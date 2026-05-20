import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensionPath = path.join(rootDir, "dist");
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "betterme-extension-test-"));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check"
  ]
});

try {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }
  const extensionId = serviceWorker.url().split("/")[2];
  console.log(`EXTENSION_ID ${extensionId}`);
  await installProviderFetchMock(serviceWorker);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState("load");
  const popupBox = await page.locator("main.popup-root").boundingBox();
  if (!popupBox || popupBox.width < 340 || popupBox.width > 380) {
    throw new Error(`Popup width is wrong: ${JSON.stringify(popupBox)}`);
  }
  const popupText = await page.locator("body").innerText();
  assertIncludes(popupText, "Block This Domain", "Popup does not expose current-domain block action.");
  assertIncludes(popupText, "Settings", "Popup does not expose Settings entry.");
  console.log(`POPUP_BOX ${JSON.stringify(popupBox)}`);

  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.com");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  const settingsText = await page.locator("body").innerText();
  assertIncludes(settingsText, "example.com", "Settings did not save blocked site.");
  assertIncludes(settingsText, "Save an OpenAI key before using AI Check.", "Settings should start without provider key.");
  assertNotIncludes(settingsText, "Lifetime", "Settings still exposes lifetime license UI.");
  assertNotIncludes(settingsText, "Demo AI", "Settings still exposes demo AI UI.");
  console.log("SETTINGS_OK true");

  const firstAttemptPage = await context.newPage();
  await firstAttemptPage.goto("https://example.com/?bettermeAttempt=first");
  await firstAttemptPage.waitForLoadState("load");
  await firstAttemptPage.waitForTimeout(800);
  if (!firstAttemptPage.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`First tab DNR redirect failed: ${firstAttemptPage.url()}`);
  }
  const secondAttemptPage = await context.newPage();
  await secondAttemptPage.goto("https://example.com/?bettermeAttempt=second");
  await secondAttemptPage.waitForLoadState("load");
  await secondAttemptPage.waitForTimeout(800);
  if (!secondAttemptPage.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`Second tab DNR redirect failed: ${secondAttemptPage.url()}`);
  }
  await firstAttemptPage.reload();
  await firstAttemptPage.waitForLoadState("load");
  await firstAttemptPage.getByText("Attempted page").click();
  const firstAttemptText = await firstAttemptPage.locator("body").innerText();
  assertIncludes(firstAttemptText, "bettermeAttempt=first", "First tab lost its tab-level attempted URL.");
  if (firstAttemptText.includes("bettermeAttempt=second")) {
    throw new Error("First tab was overwritten by the second tab's attempted URL.");
  }
  await secondAttemptPage.close();
  await firstAttemptPage.close();
  console.log("TAB_ATTEMPT_MAPPING_OK true");

  await page.goto("https://example.com/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_000);
  if (!page.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`DNR redirect failed: ${page.url()}`);
  }
  console.log(`REDIRECT_URL ${page.url()}`);
  const blockUrlBeforeKey = page.url();
  let blockText = await page.locator("body").innerText();
  assertIncludes(blockText, "Provider Key Needed", "AI should be locked before a provider key is saved.");

  const settingsPage = await context.newPage();
  await settingsPage.goto(`chrome-extension://${extensionId}/settings.html`);
  await settingsPage.getByPlaceholder("Paste provider API key").fill("sk-test-betterme-e2e");
  await settingsPage.getByRole("button", { name: /^Save Key$/ }).click();
  await settingsPage.getByText("key is saved on this device").waitFor({ timeout: 5_000 });
  await page.getByText("Ready").waitFor({ timeout: 5_000 });
  if (page.url() !== blockUrlBeforeKey) {
    throw new Error(`Block page should not navigate while provider key refreshes: ${page.url()}`);
  }
  await settingsPage.close();
  console.log("PROVIDER_KEY_LIVE_REFRESH_OK true");

  await page.getByRole("button", { name: /Basic Cooldown/ }).click();
  await page.waitForTimeout(500);
  blockText = await page.locator("body").innerText();
  assertIncludes(blockText, "The site stays blocked while the timer runs.", "Basic Cooldown did not start a wait state.");
  assertIncludes(blockText, "5:00", "Basic Cooldown did not start from 5:00.");
  await page.goto("https://example.com/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  if (!page.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`Cooldown should not unlock immediately: ${page.url()}`);
  }
  await page.evaluate(async () => {
    const key = "betterme.cooldowns";
    const data = await chrome.storage.local.get(key);
    const cooldowns = data[key] ?? [];
    cooldowns[0] = {
      ...cooldowns[0],
      endsAt: new Date(Date.now() - 1000).toISOString(),
      unlockMinutes: 0.03
    };
    await chrome.storage.local.set({ [key]: cooldowns });
  });
  await page.reload();
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: /Continue for/ }).click();
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  if (!page.url().startsWith("https://example.com/")) {
    throw new Error(`Completed cooldown did not navigate to attempted site: ${page.url()}`);
  }
  console.log("COOLDOWN_UNLOCK_OK true");
  await page.getByText("BetterMe reminder").waitFor({ timeout: 3_000 });
  await page.getByRole("button", { name: /OK, continue deliberately/ }).click();
  console.log("IN_PAGE_WARNING_OK true");
  await page.waitForFunction(
    (prefix) => window.location.href.startsWith(prefix),
    `chrome-extension://${extensionId}/block.html`,
    { timeout: 6_000 }
  );
  if (!page.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`Unlock expiry did not redirect active tab back to block page: ${page.url()}`);
  }
  console.log("UNLOCK_EXPIRY_OK true");

  blockText = await page.locator("body").innerText();
  assertIncludes(blockText, "Ready", "AI Check should be available after saving a provider key.");
  assertNotIncludes(blockText, "AI PM Review", "Block page still exposes AI PM Review.");
  console.log("AI_READY_UI_OK true");
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "AI_COOLDOWN",
      userFacingMessage: "Take a short pause before deciding whether this is still worth opening.",
      decisionReasonCategory: "insufficient_reason",
      aiCooldownSeconds: 20,
      scores: { repeatedReason: 40, impulse: 75, deliberateness: 30 },
      memoryUpdate: { behaviorReasonCategory: "habit", patternNote: "User tried to continue while already blocked." }
    })
  ]);
  await page.getByPlaceholder("Explain why this visit is deliberate and bounded...").fill("I just want to check one thing quickly.");
  await page.getByPlaceholder("Explain why this visit is deliberate and bounded...").press("Enter");
  await page.getByText("I just want to check one thing quickly.").waitFor({ timeout: 1_000 });
  await page.getByText("AI is thinking").waitFor({ timeout: 1_000 });
  await page.getByText("Leaning cooldown").waitFor({ timeout: 8_000 });
  blockText = await page.locator("body").innerText();
  assertIncludes(blockText, "AI Cooldown", "AI cooldown banner did not render.");
  assertIncludes(blockText, "before this AI Check can continue.", "AI cooldown timer did not render.");
  const aiCooldownEvents = await getBehaviorEvents(page);
  if (!aiCooldownEvents.some((event) => event.type === "ai_cooldown_started" && event.targetDisplay === "example.com")) {
    throw new Error("AI cooldown start was not recorded in behavior history.");
  }
  if (!aiCooldownEvents.some((event) => event.type === "ai_cooldown_seconds_normalized" && event.targetDisplay === "example.com")) {
    throw new Error("AI cooldown normalization was not recorded in behavior history.");
  }
  console.log("AI_COOLDOWN_UI_OK true");

  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.net");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  const finalTurnTargetId = await getBlockedTargetId(page, "example.net");
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "What exact task will you complete there?",
      nextQuestion: "What exact task will you complete there?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "How long should that take?",
      nextQuestion: "How long should that take?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "What will make you leave?",
      nextQuestion: "What will make you leave?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "Why does this need to happen now?",
      nextQuestion: "Why does this need to happen now?"
    }),
    buildProviderDecision({
      decision: "AI_COOLDOWN",
      userFacingMessage: "Pause briefly before trying to make this case again.",
      decisionReasonCategory: "insufficient_reason",
      aiCooldownSeconds: 120,
      scores: { repeatedReason: 35, impulse: 68, deliberateness: 38 },
      memoryUpdate: { behaviorReasonCategory: "habit", patternNote: "Reached the final turn and still lacked a bounded plan." }
    })
  ]);
  let aiResult = await sendRuntimeMessage(page, "ai/startAndSend", {
    targetId: finalTurnTargetId,
    content: "I want to browse quickly."
  });
  for (const content of ["I will check one page.", "Maybe two minutes.", "I'll stop when I know.", "It feels urgent."]) {
    aiResult = await sendRuntimeMessage(page, "ai/sendMessage", {
      sessionId: aiResult.session.id,
      content
    });
  }
  if (aiResult.session.status !== "ai_cooling_down" || aiResult.session.assistantTurnCount !== 5) {
    throw new Error(`Final turn did not produce AI cooldown: ${JSON.stringify(aiResult.session)}`);
  }
  const providerRequests = await getProviderRequestLog(serviceWorker);
  const finalProviderRequest = providerRequests.at(-1);
  const finalSystemPrompt = finalProviderRequest?.messages?.[0]?.content ?? "";
  assertIncludes(finalSystemPrompt, "This is the final assistant turn.", "Final turn context was not sent to the provider.");
  const finalTurnEvents = await getBehaviorEvents(page);
  if (!finalTurnEvents.some((event) => event.type === "ai_final_turn_reached" && event.targetDisplay === "example.net")) {
    throw new Error("Final turn event was not recorded in behavior history.");
  }
  const patternMemories = await getIndexedDbRecords(page, "patternMemories");
  const finalTurnMemory = patternMemories.find((memory) => memory.targetDisplay === "example.net");
  if (!finalTurnMemory || finalTurnMemory.repeatedCount !== 1) {
    throw new Error(`Same-session repeated reasons should count once: ${JSON.stringify(finalTurnMemory)}`);
  }
  console.log("AI_FINAL_TURN_OK true");

  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.edu");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  const holdTargetId = await getBlockedTargetId(page, "example.edu");
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "BLOCK",
      userFacingMessage: "This looks impulsive enough that the target should stay held until tomorrow.",
      decisionReasonCategory: "high_risk_pattern",
      scores: { repeatedReason: 80, impulse: 90, deliberateness: 20 },
      memoryUpdate: { behaviorReasonCategory: "habit", patternNote: "User used a high-risk impulsive reason." }
    })
  ]);
  await page.goto(`chrome-extension://${extensionId}/block.html?targetId=${encodeURIComponent(holdTargetId)}`);
  await page.getByPlaceholder("Explain why this visit is deliberate and bounded...").fill("I just want to scroll.");
  await page.getByPlaceholder("Explain why this visit is deliberate and bounded...").press("Enter");
  await page.getByText("Basic Cooldown unavailable").waitFor({ timeout: 8_000 });
  await page.reload();
  await page.getByRole("heading", { name: "AI Check is closed for today" }).waitFor({ timeout: 8_000 });
  await page.getByText("I just want to scroll.").waitFor({ timeout: 2_000 });
  const holdReasonCount = await page
    .getByText("This looks impulsive enough that the target should stay held until tomorrow.")
    .count();
  if (holdReasonCount < 1) {
    throw new Error("Held read-only view did not show the prior AI block reason.");
  }
  await page.getByText("Leaning block").waitFor({ timeout: 2_000 });
  const closedComposer = page.locator(".composer-disabled");
  await closedComposer.hover();
  const closedComposerOverlay = await closedComposer.evaluate((element) =>
    getComputedStyle(element, "::after").content
  );
  if (!closedComposerOverlay.includes("Closed until tomorrow")) {
    throw new Error(`Held composer hover overlay did not render: ${closedComposerOverlay}`);
  }
  const closedTextareaDisabled = await page.getByPlaceholder("AI Check is closed until tomorrow.").isDisabled();
  if (!closedTextareaDisabled) {
    throw new Error("Held read-only composer should be disabled.");
  }
  let holdRejected = false;
  try {
    await sendRuntimeMessage(page, "blocking/startCooldown", { targetId: holdTargetId });
  } catch (error) {
    holdRejected = String(error).includes("held until tomorrow");
  }
  if (!holdRejected) {
    throw new Error("Background allowed Basic Cooldown while AI hold was active.");
  }
  let aiRejected = false;
  try {
    await sendRuntimeMessage(page, "ai/startAndSend", { targetId: holdTargetId, content: "Let me try again." });
  } catch (error) {
    aiRejected = String(error).includes("AI Check is closed for today");
  }
  if (!aiRejected) {
    throw new Error("Background allowed a new AI Check while AI hold was active.");
  }
  console.log("AI_HOLD_SUPPRESSES_COOLDOWN_OK true");
  await page.screenshot({ path: "/tmp/betterme-extension-e2e.png", fullPage: true });

  await page.goto(`chrome-extension://${extensionId}/review.html`);
  await page.getByRole("heading", { name: "AI PM Review" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: /example.edu/ }).click();
  await page.getByLabel("Expected decision").selectOption("AI_COOLDOWN");
  await page.getByLabel("Over block").check();
  await page
    .getByPlaceholder("Why was this decision wrong? What should the AI have done?")
    .fill("This should have been a cooldown instead of a full hold.");
  await page.getByRole("button", { name: /Save Bad Case/ }).click();
  await page.getByText(/Saved bad case/).waitFor({ timeout: 3_000 });
  await page.getByRole("button", { name: /Convert to Eval Case/ }).click();
  await page.getByText(/Created eval case/).waitFor({ timeout: 3_000 });
  const evalCases = await getIndexedDbRecords(page, "evalCases");
  if (
    !evalCases.some((item) => {
      return item.input.targetDisplay === "example.edu" && item.eval.expectedOutput.decision === "AI_COOLDOWN";
    })
  ) {
    throw new Error(`Review workspace did not create expected eval case: ${JSON.stringify(evalCases)}`);
  }
  console.log("REVIEW_EVAL_LOOP_OK true");

  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.org");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  await page.goto("https://example.org/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  if (!page.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`DNR redirect for deletion recovery target failed: ${page.url()}`);
  }
  const deletedBlockUrl = page.url();
  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.locator(".settings-list-row").filter({ hasText: "example.org" }).getByTitle("Review removal").click();
  await page.getByPlaceholder("I choose to remove this block").fill("I choose to remove this block");
  await page.getByRole("button", { name: /Remove Permanently/ }).click({ timeout: 12_000 });
  await page.waitForTimeout(500);
  const removalEvents = await getBehaviorEvents(page);
  if (!removalEvents.some((event) => event.type === "blocked_target_removed" && event.targetDisplay === "example.org")) {
    throw new Error("Blocked target removal was not recorded in behavior history.");
  }
  await page.goto(deletedBlockUrl);
  await page.waitForURL("https://example.org/**", { timeout: 6_000 });
  console.log("DELETED_TARGET_RECOVERY_OK true");
  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.org");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  const readdEvents = await getBehaviorEvents(page);
  if (!readdEvents.some((event) => event.type === "blocked_target_readded" && event.targetDisplay === "example.org")) {
    throw new Error("Blocked target re-add was not connected to removal history.");
  }
  console.log("BEHAVIOR_HISTORY_OK true");
  console.log("SCREENSHOT /tmp/betterme-extension-e2e.png");
} finally {
  await context.close();
}

function assertIncludes(text, needle, message) {
  if (!text.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotIncludes(text, needle, message) {
  if (text.includes(needle)) {
    throw new Error(message);
  }
}

async function getBehaviorEvents(page) {
  return getIndexedDbRecords(page, "behaviorEvents");
}

async function getIndexedDbRecords(page, storeName) {
  return page.evaluate(async (selectedStore) => {
    const request = indexedDB.open("betterme-db", 6);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(selectedStore, "readonly");
      const store = tx.objectStore(selectedStore);
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
  }, storeName);
}

async function getBlockedTargetId(page, display) {
  return page.evaluate(async (targetDisplay) => {
    const key = "betterme.blockedTargets";
    const data = await chrome.storage.local.get(key);
    const target = (data[key] ?? []).find((item) => item.display === targetDisplay);
    if (!target) {
      throw new Error(`Blocked target not found: ${targetDisplay}`);
    }
    return target.id;
  }, display);
}

async function sendRuntimeMessage(page, type, payload) {
  return page.evaluate(
    ({ messageType, messagePayload }) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: messageType, payload: messagePayload }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error ?? "Runtime message failed."));
            return;
          }
          resolve(response.data);
        });
      }),
    { messageType: type, messagePayload: payload }
  );
}

async function installProviderFetchMock(serviceWorker) {
  await serviceWorker.evaluate(() => {
    const state = globalThis;
    if (state.__bettermeFetchMockInstalled) {
      return;
    }
    state.__bettermeFetchMockInstalled = true;
    state.__bettermeProviderResponses = [];
    state.__bettermeProviderRequests = [];
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.startsWith("https://api.openai.com/v1/chat/completions")) {
        return originalFetch(input, init);
      }
      const body = typeof init?.body === "string" ? init.body : "";
      state.__bettermeProviderRequests.push(body ? JSON.parse(body) : null);
      const nextResponse = state.__bettermeProviderResponses.shift();
      if (!nextResponse) {
        return new Response(JSON.stringify({ error: { message: "No queued BetterMe provider response." } }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, nextResponse.__delayMs ?? 250));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(nextResponse) } }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    };
  });
}

async function queueProviderResponses(serviceWorker, responses) {
  await serviceWorker.evaluate((items) => {
    globalThis.__bettermeProviderResponses.push(...items);
  }, responses);
}

async function getProviderRequestLog(serviceWorker) {
  return serviceWorker.evaluate(() => globalThis.__bettermeProviderRequests);
}

function buildProviderDecision(overrides) {
  return {
    decision: "ASK_MORE",
    userFacingMessage: "Tell me more before I decide.",
    decisionReasonCategory: "insufficient_reason",
    unlockMinutes: null,
    aiCooldownSeconds: null,
    nextQuestion: null,
    scores: {
      repeatedReason: 20,
      impulse: 55,
      deliberateness: 45
    },
    memoryUpdate: {
      behaviorReasonCategory: "other",
      patternNote: null
    },
    ...overrides
  };
}

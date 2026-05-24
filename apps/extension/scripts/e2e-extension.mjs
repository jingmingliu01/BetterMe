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
      unlockMinutes: 0.12
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
  const leavePage = await context.newPage();
  await leavePage.goto("https://example.com/?bettermeLeaveProbe=1");
  await leavePage.waitForLoadState("load");
  await leavePage.getByText("BetterMe reminder").waitFor({ timeout: 3_000 });
  await leavePage.getByRole("button", { name: /Leave Site/ }).click();
  await leavePage.waitForURL((url) => !url.href.startsWith("https://example.com/"), { timeout: 3_000 });
  if (leavePage.url().startsWith("https://example.com/")) {
    throw new Error(`Leave action did not leave the unlocked site: ${leavePage.url()}`);
  }
  await leavePage.close();
  console.log("IN_PAGE_WARNING_LEAVE_OK true");
  await page.evaluate(() => {
    window.__bettermeWarningProbe = { clicks: 0, keys: 0, wheels: 0 };
    document.body.style.minHeight = "3000px";
    window.scrollTo(0, 0);
    const button = document.createElement("button");
    button.id = "betterme-underlay-target";
    button.textContent = "Underlay target";
    button.style.position = "fixed";
    button.style.top = "24px";
    button.style.left = "24px";
    button.style.zIndex = "2147483647";
    button.style.width = "180px";
    button.style.height = "80px";
    button.addEventListener("click", () => {
      window.__bettermeWarningProbe.clicks += 1;
    });
    document.body.append(button);
    document.addEventListener(
      "keydown",
      () => {
        window.__bettermeWarningProbe.keys += 1;
      },
      { capture: true }
    );
    document.addEventListener(
      "wheel",
      () => {
        window.__bettermeWarningProbe.wheels += 1;
      },
      { capture: true }
    );
  });
  await page.getByText("BetterMe reminder").waitFor({ timeout: 3_000 });
  await page
    .getByText("You can leave now and keep control, or finish the time you already unlocked. The timer keeps running either way.")
    .waitFor({ timeout: 1_000 });
  await page.getByRole("button", { name: /Leave Site/ }).waitFor({ timeout: 1_000 });
  await page.getByRole("button", { name: /Finish My Time/ }).waitFor({ timeout: 1_000 });
  const staleWarningCopyCount = await page
    .getByText("Confirm that you still want to spend this final minute here.")
    .count();
  if (staleWarningCopyCount !== 0) {
    throw new Error("Warning copy still implies the final minute starts after confirmation.");
  }
  const staleWarningButtonCount = await page.getByRole("button", { name: /OK, keep browsing deliberately/ }).count();
  if (staleWarningButtonCount !== 0) {
    throw new Error("Warning still uses the old single acknowledgement button.");
  }
  const warningTopElement = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return element?.tagName ?? null;
  });
  if (warningTopElement !== "BETTERME-UNLOCK-WARNING") {
    throw new Error(`Warning overlay should be the top page element, got ${warningTopElement}`);
  }
  const underlayBox = await page.locator("#betterme-underlay-target").boundingBox();
  if (!underlayBox) {
    throw new Error("Warning interaction probe button was not rendered.");
  }
  await page.mouse.click(underlayBox.x + underlayBox.width / 2, underlayBox.y + underlayBox.height / 2);
  await page.mouse.wheel(0, 600);
  await page.keyboard.press("ArrowDown");
  const warningProbe = await page.evaluate(() => ({
    ...window.__bettermeWarningProbe,
    scrollY: window.scrollY
  }));
  if (warningProbe.clicks !== 0 || warningProbe.keys !== 0 || warningProbe.wheels !== 0 || warningProbe.scrollY !== 0) {
    throw new Error(`Warning overlay did not block page interaction: ${JSON.stringify(warningProbe)}`);
  }
  await page.getByRole("button", { name: /Finish My Time/ }).click();
  await page.locator("betterme-unlock-warning").waitFor({ state: "detached", timeout: 1_000 });
  const postFinishInteraction = await page.evaluate(() => {
    document.querySelector("#betterme-underlay-target")?.click();
    return window.__bettermeWarningProbe.clicks;
  });
  if (postFinishInteraction !== 1) {
    throw new Error(`Finish My Time did not restore page interaction: ${postFinishInteraction}`);
  }
  console.log("IN_PAGE_WARNING_FINISH_OK true");
  await page.waitForFunction(
    (prefix) => window.location.href.startsWith(prefix),
    `chrome-extension://${extensionId}/block.html`,
    { timeout: 12_000 }
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
  assertIncludes(blockText, "before this AI Check ends.", "AI cooldown terminal timer did not render.");
  const aiCooldownEvents = await getBehaviorEvents(page);
  if (!aiCooldownEvents.some((event) => event.type === "ai_cooldown_started" && event.targetDisplay === "example.com")) {
    throw new Error("AI cooldown start was not recorded in behavior history.");
  }
  if (!aiCooldownEvents.some((event) => event.type === "ai_cooldown_seconds_normalized" && event.targetDisplay === "example.com")) {
    throw new Error("AI cooldown normalization was not recorded in behavior history.");
  }
  console.log("AI_COOLDOWN_UI_OK true");
  const cooldownSessions = await getIndexedDbRecords(page, "aiCheckSessions");
  const cooldownSession = cooldownSessions.find(
    (item) => item.targetDisplay === "example.com" && item.status === "ai_cooling_down"
  );
  if (!cooldownSession) {
    throw new Error("AI cooldown session was not stored as cooling down.");
  }
  await putIndexedDbRecord(page, "aiCheckSessions", {
    ...cooldownSession,
    aiCooldownUntil: new Date(Date.now() - 1000).toISOString()
  });
  let terminalCooldownError = "";
  try {
    await sendRuntimeMessage(page, "ai/sendMessage", {
      sessionId: cooldownSession.id,
      content: "I want to keep going in the same checkpoint."
    });
  } catch (error) {
    terminalCooldownError = error instanceof Error ? error.message : String(error);
  }
  assertIncludes(terminalCooldownError, "no longer active", "AI cooldown should not reopen the same checkpoint.");
  const completedCooldownSessions = await getIndexedDbRecords(page, "aiCheckSessions");
  const completedCooldownSession = completedCooldownSessions.find((item) => item.id === cooldownSession.id);
  if (completedCooldownSession?.status !== "completed") {
    throw new Error(`AI cooldown should resolve to a completed terminal session: ${JSON.stringify(completedCooldownSession)}`);
  }
  const completedCooldownEvents = await getBehaviorEvents(page);
  if (!completedCooldownEvents.some((event) => event.type === "ai_cooldown_completed" && event.targetDisplay === "example.com")) {
    throw new Error("AI cooldown completion was not recorded in behavior history.");
  }
  console.log("AI_COOLDOWN_TERMINAL_OK true");

  await page.goto(`chrome-extension://${extensionId}/settings.html`);
  await page.getByPlaceholder("example.com or https://example.com/path").fill("example.net");
  await page.getByRole("button", { name: /Block This Domain/ }).click();
  await page.waitForTimeout(500);
  const finalTurnTargetId = await getBlockedTargetId(page, "example.net");
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "What exact task will you complete there?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "How long should that take?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "What will make you leave?"
    }),
    buildProviderDecision({
      decision: "ASK_MORE",
      userFacingMessage: "Why does this need to happen now?"
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
  const finalProviderMessages = finalProviderRequest?.messages ?? [];
  const finalSystemPrompt = finalProviderMessages[0]?.content ?? "";
  const finalRoundContext = finalProviderMessages[1]?.content ?? "";
  const finalTurnContext = finalProviderMessages.at(-1)?.content ?? "";
  assertIncludes(finalSystemPrompt, "You are BetterMe", "Static system prompt was not sent to the provider.");
  assertIncludes(finalRoundContext, "<trusted_round_context>", "Trusted round context was not sent after the system prompt.");
  assertIncludes(finalTurnContext, "<trusted_turn_context>", "Trusted turn context was not sent as the final provider message.");
  assertIncludes(finalTurnContext, "This is the final turn.", "Final turn context was not sent to the provider.");
  assertIncludes(finalTurnContext, "Do not return ASK_MORE.", "Final turn ASK_MORE guard was not sent to the provider.");
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

  await sendRuntimeMessage(page, "review/createEvalCase", {
    title: "Protected holdout failing case",
    datasetType: "holdout",
    status: "ready",
    targetDisplay: "example.com",
    strictness: "balanced",
    userMessage: "I need to research homework for 10 minutes then I will close the tab.",
    expectedDecision: "BLOCK",
    tags: ["school", "holdout_probe"],
    reviewerNote: "E2E holdout visibility probe."
  });
  await page.reload();
  await page.getByRole("heading", { name: "AI PM Review" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Experiment Lab" }).click();
  await page.getByLabel("Experiment dataset", { exact: true }).selectOption("holdout");
  await page.getByRole("button", { name: /Run Eval/ }).click();
  await page.getByText(/Experiment .* finished/).waitFor({ timeout: 3_000 });
  const holdoutGuardText = (await page.locator(".holdout-guard").textContent({ timeout: 5_000 })) ?? "";
  assertIncludes(holdoutGuardText, "Holdout protected", "Tuning mode did not protect Holdout details.");
  assertIncludes(holdoutGuardText, "Detailed Holdout failures are hidden", "Holdout guard copy was not shown.");
  let resultPanelText = await page.locator(".experiment-results-panel").innerText();
  assertNotIncludes(resultPanelText, "Protected holdout failing case", "Tuning mode leaked Holdout failure title.");
  await page.getByLabel("Experiment mode", { exact: true }).selectOption("release_review");
  await page.getByRole("button", { name: /Run Eval/ }).click();
  await page.getByText(/Experiment .* finished/).waitFor({ timeout: 3_000 });
  await page.getByText("Protected holdout failing case").waitFor({ timeout: 5_000 });
  resultPanelText = await page.locator(".experiment-results-panel").innerText();
  assertIncludes(resultPanelText, "Protected holdout failing case", "Release review mode did not show Holdout failure summary.");
  console.log("HOLDOUT_VISIBILITY_OK true");

  await sendRuntimeMessage(page, "review/createEvalCase", {
    title: "Provider mode passing case",
    datasetType: "design",
    status: "ready",
    targetDisplay: "example.com",
    strictness: "balanced",
    userMessage: "I need to research homework for 10 minutes then I will close the tab.",
    expectedDecision: "ALLOW",
    tags: ["provider_probe"],
    reviewerNote: "E2E provider-mode Experiment Lab probe."
  });
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "ALLOW",
      userFacingMessage: "Your reason is specific and bounded. Keep it short and close the tab when done.",
      decisionReasonCategory: "clear_intention",
      unlockMinutes: 5,
      scores: { repeatedReason: 0, impulse: 20, deliberateness: 86 },
      memoryUpdate: { behaviorReasonCategory: "intentional", patternNote: null }
    })
  ]);
  const providerRequestCountBefore = (await getProviderRequestLog(serviceWorker)).length;
  await page.reload();
  await page.getByRole("heading", { name: "AI PM Review" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Experiment Lab" }).click();
  await page.getByLabel("Experiment provider", { exact: true }).selectOption("openai");
  await page.getByLabel("Experiment mode", { exact: true }).selectOption("tuning");
  await page.getByLabel("Experiment dataset", { exact: true }).selectOption("design");
  await page.getByLabel("Experiment tag", { exact: true }).selectOption("provider_probe");
  await page.getByRole("button", { name: /Run Eval/ }).click();
  await page.getByText(/Experiment .* finished/).waitFor({ timeout: 5_000 });
  resultPanelText = await page.locator(".experiment-results-panel").innerText();
  assertIncludes(resultPanelText, "1/1", "Provider-mode run did not pass the focused probe case.");
  const experimentProviderRequests = await getProviderRequestLog(serviceWorker);
  if (experimentProviderRequests.length !== providerRequestCountBefore + 1) {
    throw new Error(`Provider-mode eval did not send exactly one provider request: ${experimentProviderRequests.length}`);
  }
  const latestProviderRequest = experimentProviderRequests.at(-1);
  if (!latestProviderRequest?.messages?.some((message) => message.content.includes("<trusted_round_context>"))) {
    throw new Error("Provider-mode eval did not use the runtime provider message builder.");
  }
  const evalRuns = await getIndexedDbRecords(page, "evalRuns");
  const providerEvalRun = evalRuns
    .filter((run) => run.provider === "openai")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (providerEvalRun?.provider !== "openai" || providerEvalRun?.providerMode !== "byok") {
    throw new Error(`Provider-mode eval run metadata is wrong: ${JSON.stringify(providerEvalRun)}`);
  }
  console.log("PROVIDER_MODE_EXPERIMENT_OK true");
  await page
    .getByPlaceholder("Why is this prompt program safe to approve, or why should release stay blocked?")
    .fill("Provider-mode focused gate passed.");
  await page.getByRole("button", { name: "Approve Prompt" }).click();
  await page.getByText("Release decision saved: Approved.").waitFor({ timeout: 3_000 });
  const releaseDecisions = await getIndexedDbRecords(page, "releaseDecisions");
  if (
    !releaseDecisions.some(
      (decision) =>
        decision.runId === providerEvalRun.id &&
        decision.decision === "approved" &&
        decision.releaseGateStatus === "pass"
    )
  ) {
    throw new Error(`Release decision was not persisted for provider run: ${JSON.stringify(releaseDecisions)}`);
  }
  console.log("RELEASE_DECISION_OK true");

  const importedRunId = `evalrun_e2e_import_${Date.now()}`;
  const importedResultId = `evalresult_e2e_import_${Date.now()}`;
  const importedAt = new Date().toISOString();
  const importedArtifact = {
    run: {
      id: importedRunId,
      promptVersion: providerEvalRun.promptVersion,
      outputSchemaVersion: providerEvalRun.outputSchemaVersion,
      evaluationSchemaVersion: providerEvalRun.evaluationSchemaVersion,
      mode: "tuning",
      providerMode: "mock",
      provider: "mock",
      model: "mock",
      filters: { datasetTypes: ["design"], tags: ["cli_import_probe"] },
      caseIds: ["eval-e2e-import-probe"],
      metrics: {
        total: 1,
        passed: 1,
        failed: 0,
        passRate: 1,
        byTag: [{ key: "cli_import_probe", passed: 1, total: 1, passRate: 1 }],
        byStrictness: [{ key: "balanced", passed: 1, total: 1, passRate: 1 }],
        falseAllowFailures: 0,
        falseBlockFailures: 0,
        askMoreRecallFailures: 0,
        schemaFailures: 0,
        unsafeSensitiveFailures: 0,
        reasonQualityFailures: 0,
        criticalFailures: 0,
        releaseGate: { status: "pass", reasons: ["All selected release-gate checks passed."] }
      },
      createdAt: importedAt
    },
    results: [
      {
        id: importedResultId,
        runId: importedRunId,
        evalCaseId: "eval-e2e-import-probe",
        actualDecision: "ALLOW",
        pass: true,
        failureReasons: [],
        rawProvider: "{\"decision\":\"ALLOW\"}",
        createdAt: importedAt
      }
    ]
  };
  await page.getByLabel("Eval run artifact JSON").fill(JSON.stringify(importedArtifact));
  await page.getByRole("button", { name: /Import Run/ }).click();
  await page.getByText(new RegExp(`Imported eval run ${importedRunId}`)).waitFor({ timeout: 3_000 });
  const importedEvalRuns = await getIndexedDbRecords(page, "evalRuns");
  const importedEvalResults = await getIndexedDbRecords(page, "evalResults");
  if (
    !importedEvalRuns.some((run) => run.id === importedRunId) ||
    !importedEvalResults.some((result) => result.id === importedResultId && result.runId === importedRunId)
  ) {
    throw new Error("Imported CLI eval run artifact was not persisted.");
  }
  console.log("EVAL_RUN_ARTIFACT_IMPORT_OK true");

  await sendRuntimeMessage(page, "review/createEvalCase", {
    title: "Candidate A/B probe case",
    datasetType: "design",
    status: "ready",
    targetDisplay: "example.com",
    strictness: "balanced",
    userMessage: "I need to research homework for 10 minutes then I will close the tab.",
    expectedDecision: "ALLOW",
    tags: ["candidate_ab_probe"],
    reviewerNote: "E2E Candidate Prompt A/B probe."
  });
  await queueProviderResponses(serviceWorker, [
    buildProviderDecision({
      decision: "ALLOW",
      userFacingMessage: "Your reason is specific and bounded. Keep it short and close the tab when done.",
      decisionReasonCategory: "clear_intention",
      unlockMinutes: 5,
      scores: { repeatedReason: 0, impulse: 20, deliberateness: 86 },
      memoryUpdate: { behaviorReasonCategory: "intentional", patternNote: null }
    }),
    buildProviderDecision({
      decision: "BLOCK",
      userFacingMessage: "Stay blocked for now.",
      decisionReasonCategory: "high_risk_pattern",
      scores: { repeatedReason: 20, impulse: 70, deliberateness: 20 },
      memoryUpdate: { behaviorReasonCategory: "avoidance", patternNote: null }
    })
  ]);
  const candidateProviderRequestCountBefore = (await getProviderRequestLog(serviceWorker)).length;
  await page.reload();
  await page.getByRole("heading", { name: "AI PM Review" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Experiment Lab" }).click();
  await page.getByLabel("Experiment provider", { exact: true }).selectOption("openai");
  await page.getByLabel("Experiment dataset", { exact: true }).selectOption("design");
  await page.getByLabel("Experiment tag", { exact: true }).selectOption("candidate_ab_probe");
  await page.getByLabel("Prompt candidate name").fill("E2E stricter candidate");
  await page.getByLabel("Prompt candidate patch").fill("For this candidate, block bounded homework requests.");
  await page.getByLabel("Prompt candidate rationale").fill("Probe candidate comparison regression handling.");
  await page.getByRole("button", { name: /Save Candidate/ }).click();
  await page.getByText("Saved prompt candidate E2E stricter candidate.").waitFor({ timeout: 3_000 });
  await page.getByRole("button", { name: /Run A\/B/ }).click();
  await page.getByText(/Candidate A\/B finished/).waitFor({ timeout: 8_000 });
  await page.getByText("Textual Gradient", { exact: true }).waitFor({ timeout: 5_000 });
  const promptComparisons = await getIndexedDbRecords(page, "promptComparisons");
  const promptCandidates = await getIndexedDbRecords(page, "promptCandidates");
  const latestComparison = promptComparisons.at(-1);
  if (
    !promptCandidates.some((candidate) => candidate.name === "E2E stricter candidate") ||
    latestComparison?.regressedCaseIds?.length !== 1 ||
    latestComparison?.recommendation !== "reject_candidate"
  ) {
    throw new Error(`Candidate comparison did not persist expected regression: ${JSON.stringify(promptComparisons)}`);
  }
  const candidateProviderRequests = await getProviderRequestLog(serviceWorker);
  if (candidateProviderRequests.length !== candidateProviderRequestCountBefore + 2) {
    throw new Error("Candidate A/B did not issue baseline and candidate provider requests.");
  }
  const candidateRequest = candidateProviderRequests.at(-1);
  if (!candidateRequest?.messages?.some((message) => message.content.includes("<candidate_prompt_patch>"))) {
    throw new Error("Candidate A/B did not send the candidate prompt patch to the provider.");
  }
  console.log("CANDIDATE_PROMPT_AB_OK true");

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
    const request = indexedDB.open("betterme-db", 9);
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

async function putIndexedDbRecord(page, storeName, record) {
  return page.evaluate(
    async ({ selectedStore, selectedRecord }) => {
      const request = indexedDB.open("betterme-db", 9);
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve, reject) => {
        const tx = db.transaction(selectedStore, "readwrite");
        const store = tx.objectStore(selectedStore);
        const put = store.put(selectedRecord);
        put.onsuccess = () => resolve(true);
        put.onerror = () => reject(put.error);
      });
    },
    { selectedStore: storeName, selectedRecord: record }
  );
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

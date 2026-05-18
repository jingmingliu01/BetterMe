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
  await page.waitForURL(`chrome-extension://${extensionId}/block.html**`, { timeout: 6_000 });
  if (!page.url().startsWith(`chrome-extension://${extensionId}/block.html`)) {
    throw new Error(`Unlock expiry did not redirect active tab back to block page: ${page.url()}`);
  }
  console.log("UNLOCK_EXPIRY_OK true");

  blockText = await page.locator("body").innerText();
  assertIncludes(blockText, "Ready", "AI Check should be available after saving a provider key.");
  assertNotIncludes(blockText, "AI PM Review", "Block page still exposes AI PM Review.");
  console.log("AI_READY_UI_OK true");
  await page.screenshot({ path: "/tmp/betterme-extension-e2e.png", fullPage: true });

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
  return page.evaluate(async () => {
    const request = indexedDB.open("betterme-db", 4);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction("behaviorEvents", "readonly");
      const store = tx.objectStore("behaviorEvents");
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
  });
}

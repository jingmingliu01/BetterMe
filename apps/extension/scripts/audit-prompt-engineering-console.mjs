import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCaseShape } from "./ai-check-contract-shape.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const docsDir = resolve(repoRoot, "docs/design");
const extensionRoot = resolve(here, "..");
const contractPath = resolve(extensionRoot, "src/shared/ai-check-contract.json");
const caseDir = resolve(extensionRoot, "evals/ai-check-cases");
const reviewStorePath = resolve(extensionRoot, "src/ai/review-store.ts");
const reviewPagePath = resolve(extensionRoot, "src/pages/review/ReviewPage.tsx");
const e2ePath = resolve(extensionRoot, "scripts/e2e-extension.mjs");

const errors = [];
const contract = JSON.parse(await readFile(contractPath, "utf8"));

await auditDocs();
await auditContract();
await auditFixtures();
await auditReviewRuntime();
await auditE2E();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("PROMPT_ENGINEERING_CONSOLE_AUDIT_OK true");
}

async function auditDocs() {
  const design = await readDoc("2026-05-24-prompt-engineering-console-design.md");
  const progress = await readDoc("2026-05-24-prompt-engineering-console-progress.md");
  const issues = await readDoc("2026-05-24-prompt-engineering-console-issues.md");
  for (const [name, file, body] of [
    ["design", "2026-05-24-prompt-engineering-console-design.md", design],
    ["progress", "2026-05-24-prompt-engineering-console-progress.md", progress],
    ["issues", "2026-05-24-prompt-engineering-console-issues.md", issues]
  ]) {
    for (const related of [
      "2026-05-24-prompt-engineering-console-design.md",
      "2026-05-24-prompt-engineering-console-progress.md",
      "2026-05-24-prompt-engineering-console-issues.md"
    ]) {
      if (related === file) continue;
      if (!body.includes(related)) {
        errors.push(`${name} doc is missing related-doc link to ${related}.`);
      }
    }
  }
  if (/Status: (open|partially mitigated|mostly mitigated)/.test(issues)) {
    errors.push("Prompt Engineering Console issues doc still has open, partially mitigated, or mostly mitigated status.");
  }
  if (/Status: first slice implemented|Still later:/.test(`${design}\n${progress}`)) {
    errors.push("Prompt Engineering Console docs still describe implemented scope as first-slice or still-later work.");
  }
  for (const required of [
    "Legacy local PM Review data does not need to be preserved as a design constraint.",
    "Evaluation Case should be one decision point, not a whole session.",
    "`AI_COOLDOWN` is terminal in product and release-gating semantics.",
    "Contract Change Plans now persist `createdAgainstVersions`"
  ]) {
    if (!progress.includes(required) && !design.includes(required) && !issues.includes(required)) {
      errors.push(`Prompt Engineering docs are missing required decision/evidence: ${required}`);
    }
  }
}

async function auditContract() {
  if ("sections" in contract) {
    errors.push("ai-check-contract.json must not hand-author generated sections.");
  }
  if (!contract.promptProgram?.decisionPolicyRules?.length || !contract.promptProgram?.scoringRules?.length) {
    errors.push("ai-check-contract.json must own Prompt Program decision policy and scoring rules.");
  }
  for (const key of ["promptVersion", "outputSchemaVersion", "evaluationSchemaVersion"]) {
    if (!contract.current?.[key]) {
      errors.push(`ai-check-contract.json current.${key} is missing.`);
    }
  }
}

async function auditFixtures() {
  const files = (await readdir(caseDir)).filter((file) => file.endsWith(".json")).sort();
  let count = 0;
  for (const file of files) {
    const cases = JSON.parse(await readFile(resolve(caseDir, file), "utf8"));
    if (!Array.isArray(cases)) {
      errors.push(`${file} must contain an array.`);
      continue;
    }
    for (const testCase of cases) {
      count += 1;
      for (const error of validateCaseShape(contract, testCase, { label: `${file} ${testCase.id ?? "unknown"}` })) {
        errors.push(error);
      }
      if (testCase.status === "regression") {
        errors.push(`${testCase.id} uses legacy lifecycle status regression.`);
      }
      if (testCase.status !== "archived") {
        for (const [key, expected] of Object.entries(contract.current)) {
          if (testCase.versions?.[key] !== expected) {
            errors.push(`${testCase.id} has ${key} ${testCase.versions?.[key] ?? "missing"}; expected ${expected}.`);
          }
        }
      }
      if (!["design", "regression", "holdout"].includes(testCase.datasetType)) {
        errors.push(`${testCase.id} has invalid datasetType ${testCase.datasetType}.`);
      }
      if (!testCase.eval?.expectedOutput || Object.keys(testCase.eval.expectedOutput).length === 0) {
        errors.push(`${testCase.id} is missing eval.expectedOutput expectations.`);
      }
    }
  }
  if (count < 40) {
    errors.push(`Expected at least 40 AI Check eval cases, found ${count}.`);
  }
}

async function auditReviewRuntime() {
  const reviewStore = await readFile(reviewStorePath, "utf8");
  const reviewPage = await readFile(reviewPagePath, "utf8");
  if (/legacyEval|expectedCooldownRangeSeconds|expectedScoreRanges|mustAskAbout|mustNotSay/.test(reviewStore)) {
    errors.push("review-store.ts still contains legacy eval expectation migration logic.");
  }
  for (const required of [
    "createdAgainstVersions: getCurrentContractVersions()",
    "getMissingContractChangeVersionUpdates",
    "Applied contract change plans require version updates"
  ]) {
    if (!reviewStore.includes(required)) {
      errors.push(`review-store.ts is missing Contract Change Plan version gate evidence: ${required}`);
    }
  }
  for (const required of [
    "getMissingContractPlanVersionUpdates",
    "Required version update before apply",
    "createdAgainstVersions"
  ]) {
    if (!reviewPage.includes(required)) {
      errors.push(`ReviewPage.tsx is missing Contract Reference version-gate UI evidence: ${required}`);
    }
  }
}

async function auditE2E() {
  const e2e = await readFile(e2ePath, "utf8");
  for (const marker of [
    "REVIEW_EVAL_LOOP_OK true",
    "CASE_LIBRARY_ORIGIN_OK true",
    "HOLDOUT_VISIBILITY_OK true",
    "HOLDOUT_APPROVAL_GUARD_OK true",
    "HOLDOUT_TEXTUAL_GRADIENT_GUARD_OK true",
    "PROVIDER_MODE_EXPERIMENT_OK true",
    "RELEASE_DECISION_OK true",
    "EVAL_RUN_ARTIFACT_IMPORT_OK true",
    "CANDIDATE_PROMPT_AB_OK true",
    "TEXTUAL_GRADIENT_GENERATION_OK true",
    "PROMPT_PROGRAM_SUGGESTIONS_OK true",
    "PROMPT_PROGRAM_BACKLOG_OK true",
    "CONTRACT_CHANGE_PLAN_OK true",
    "EXPERIMENT_WORKSPACE_OK true",
    "PROMPT_PROMOTION_OK true"
  ]) {
    if (!e2e.includes(marker)) {
      errors.push(`e2e-extension.mjs is missing capability marker ${marker}.`);
    }
  }
  if (!e2e.includes("Contract change plan applied without target version updates.")) {
    errors.push("E2E does not prove Contract Change Plans reject applied state before target version updates.");
  }
}

async function readDoc(file) {
  return readFile(resolve(docsDir, file), "utf8");
}

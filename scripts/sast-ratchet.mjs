#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
  SAST ratchet (Fable ruling A4, registry/fable/FABLE-DECISIONS-2026-07-11.md §A4 Phase 2):
  the existing 722 SAST findings (post noise-rule cleanup) are grandfathered into a committed
  baseline rather than blocking every PR. This script fails only when a file/rule pair's finding
  count exceeds what the baseline recorded -- i.e. only on regressions or genuinely new findings.
  Counts, not exact line numbers: line-shifting edits elsewhere in a file must not produce false
  "new finding" failures.

  Usage:
    node scripts/sast-ratchet.mjs           # check current findings against the baseline
    node scripts/sast-ratchet.mjs --update  # regenerate the baseline from current findings
*/
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const baselinePath = resolve(repoRoot, ".sast-baseline.json");
const update = process.argv.includes("--update");

function runEslint() {
  try {
    execFileSync(
      "pnpm",
      ["exec", "eslint", "-c", "eslint.config.sast.mjs", "-f", "json", "-o", "/tmp/.sast-ratchet-report.json", "."],
      { cwd: repoRoot, stdio: "pipe" },
    );
  } catch {
    // eslint exits non-zero whenever there's at least one error-severity finding --
    // expected and not itself a failure signal here; the JSON report is still written.
  }
  return JSON.parse(readFileSync("/tmp/.sast-ratchet-report.json", "utf8"));
}

function toCounts(results) {
  const counts = {};
  for (const file of results) {
    if (file.messages.length === 0) continue;
    const relPath = file.filePath.replace(repoRoot + "/", "");
    counts[relPath] = counts[relPath] || {};
    for (const msg of file.messages) {
      const rule = msg.ruleId || "(no-rule-id)";
      counts[relPath][rule] = (counts[relPath][rule] || 0) + 1;
    }
  }
  return counts;
}

const results = runEslint();
const current = toCounts(results);

if (update) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n", "utf8");
  const total = Object.values(current).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
    0,
  );
  console.log(`[sast-ratchet] Baseline updated: ${total} findings across ${Object.keys(current).length} files.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(`[sast-ratchet] No baseline found at ${baselinePath}. Run with --update to create one.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const regressions = [];

for (const [file, rules] of Object.entries(current)) {
  for (const [rule, count] of Object.entries(rules)) {
    const baselineCount = baseline[file]?.[rule] ?? 0;
    if (count > baselineCount) {
      regressions.push({ file, rule, count, baselineCount, delta: count - baselineCount });
    }
  }
}

if (regressions.length > 0) {
  console.error(`[sast-ratchet] ${regressions.length} file/rule pair(s) exceed the baseline:\n`);
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.rule} -- ${r.count} found, baseline allows ${r.baselineCount} (+${r.delta})`);
  }
  console.error(
    "\nFix the new finding(s), or if this is an intentional, reviewed exception, run " +
      "`node scripts/sast-ratchet.mjs --update` and commit the updated .sast-baseline.json " +
      "alongside an explanation in the PR description.",
  );
  process.exit(1);
}

const totalCurrent = Object.values(current).reduce(
  (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
  0,
);
console.log(`[sast-ratchet] OK -- ${totalCurrent} findings, none exceed the committed baseline.`);

#!/usr/bin/env node
/**
 * docs-redactor.mjs
 *
 * Strips @internal markers, internal-only sections, and dev-notes from
 * TypeDoc-generated markdown before publishing to staging or release docs.
 *
 * Usage:
 *   node scripts/docs-redactor.mjs --dir docs/api          # redact in place
 *   node scripts/docs-redactor.mjs --dir docs/api --verify # verify no tokens remain (CI gate)
 *   node scripts/docs-redactor.mjs --dir docs/api --dry-run # print would-change files
 *
 * Patterns redacted:
 *   - Lines containing   @internal / @dev-only / @privateRemarks
 *   - HTML comment blocks <!-- internal: ... -->
 *   - Markdown sections  ## Internal ... (until next same-level heading)
 *   - Markdown sections  ## Dev Notes ... (until next same-level heading)
 *   - Inline JSDoc tags  {@internal ...}
 */

import fs from 'fs';
import path from 'path';

const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.includes(name);
const opt = (name) => { const i = ARGS.indexOf(name); return i !== -1 ? ARGS[i + 1] : null; };

const DIR = opt('--dir');
const VERIFY = flag('--verify');
const DRY_RUN = flag('--dry-run');

if (!DIR) {
  console.error('Usage: docs-redactor.mjs --dir <path> [--verify] [--dry-run]');
  process.exit(1);
}

const INTERNAL_LINE_RE = /@internal|@dev-only|@privateRemarks/i;
const INTERNAL_INLINE_TAG_RE = /\{@internal[^}]*\}/g;
const INTERNAL_COMMENT_RE = /<!--\s*internal:[\s\S]*?-->/g;
const INTERNAL_SECTION_RE = /^(#{1,6})\s+(internal|dev[\s-]notes?).*$/im;

/**
 * Redact a single markdown file's content.
 * Returns { content: string, changed: boolean }.
 */
function redact(src) {
  let lines = src.split('\n');
  const out = [];
  let skipUntilLevel = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if we're in a skip block (internal heading section)
    if (skipUntilLevel !== -1) {
      const headingMatch = line.match(/^(#{1,6})\s/);
      if (headingMatch && headingMatch[1].length <= skipUntilLevel) {
        skipUntilLevel = -1; // End of internal section
      } else {
        continue; // Inside internal section — drop line
      }
    }

    // Check for internal section heading
    const sectionMatch = line.match(/^(#{1,6})\s+(internal|dev[\s-]notes?)\b/i);
    if (sectionMatch) {
      skipUntilLevel = sectionMatch[1].length;
      continue;
    }

    // Drop lines containing internal markers
    if (INTERNAL_LINE_RE.test(line)) {
      continue;
    }

    out.push(line);
  }

  let result = out.join('\n');

  // Strip inline {@internal ...} tags
  result = result.replace(INTERNAL_INLINE_TAG_RE, '');

  // Strip <!-- internal: ... --> comment blocks
  result = result.replace(INTERNAL_COMMENT_RE, '');

  // Collapse 3+ consecutive blank lines to 2 (cosmetic clean-up after removals)
  result = result.replace(/\n{3,}/g, '\n\n');

  return { content: result, changed: result !== src };
}

/**
 * Walk a directory recursively and collect .md files.
 */
function walkMd(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

const absDir = path.resolve(DIR);
if (!fs.existsSync(absDir)) {
  console.error(`docs-redactor: directory not found: ${absDir}`);
  process.exit(1);
}

const files = walkMd(absDir);
let violations = 0;
let changed = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const { content, changed: didChange } = redact(src);

  if (VERIFY) {
    // In verify mode: check that there are no remaining internal tokens
    const remaining = INTERNAL_LINE_RE.test(content) || INTERNAL_INLINE_TAG_RE.test(content);
    if (remaining) {
      console.error(`FAIL: internal token found in ${path.relative(absDir, file)}`);
      violations++;
    }
    continue;
  }

  if (!didChange) continue;
  changed++;

  if (DRY_RUN) {
    console.log(`would redact: ${path.relative(absDir, file)}`);
    continue;
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`redacted: ${path.relative(absDir, file)}`);
}

if (VERIFY) {
  if (violations > 0) {
    console.error(`\ndocs-redactor: ${violations} file(s) contain internal tokens. Run redactor before publishing.`);
    process.exit(1);
  } else {
    console.log(`docs-redactor: verified ${files.length} files — no internal tokens found.`);
  }
} else if (!DRY_RUN) {
  console.log(`docs-redactor: ${changed} file(s) redacted out of ${files.length} scanned.`);
}

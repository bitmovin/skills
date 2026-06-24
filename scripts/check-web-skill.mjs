#!/usr/bin/env node
// Verifies worker/src/skill-web.md is (1) in sync with SKILL.md + the rewrite prompt
// and (2) free of injection-signature phrasing. Pure Node — no API key — so CI can run it.
// Regenerate with `npm run build:web-skill` (which does need the key).
import { readFileSync } from 'node:fs';
import {
  SKILL_PATH,
  PROMPT_PATH,
  OUT_PATH,
  computeSourceHash,
  extractSourceHash,
  runGuard,
} from './web-skill-lib.mjs';

let failed = false;
const fail = (m) => {
  console.error(`✗ ${m}`);
  failed = true;
};

const skillMd = readFileSync(SKILL_PATH, 'utf8');
const promptMd = readFileSync(PROMPT_PATH, 'utf8');

let webMd;
try {
  webMd = readFileSync(OUT_PATH, 'utf8');
} catch {
  console.error(`✗ ${OUT_PATH} is missing — run: npm run build:web-skill`);
  process.exit(1);
}

const expected = computeSourceHash(skillMd, promptMd);
const actual = extractSourceHash(webMd);
if (!actual) {
  fail(`${OUT_PATH} has no source_hash in its frontmatter`);
} else if (actual !== expected) {
  fail(
    `${OUT_PATH} is stale — SKILL.md or the rewrite prompt changed since it was ` +
      `generated. Run: npm run build:web-skill`,
  );
}

for (const v of runGuard(webMd)) fail(`injection signature: ${v}`);

if (failed) process.exit(1);
// Success → stdout; failures above go to stderr.
console.log('✓ web skill is in sync and passes the injection-signature guard');

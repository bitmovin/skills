#!/usr/bin/env node
// Regenerates worker/src/skill-web.md from skills/bitmovin/SKILL.md by rewriting the
// imperative skill into a descriptive web document.
//
// Uses the `claude` CLI in headless mode, so it runs on whatever auth Claude Code is
// signed into — a Claude subscription works, no ANTHROPIC_API_KEY required. Override the
// model with WEB_SKILL_MODEL (default: opus).
//
// The deterministic staleness check + injection guard live in check-web-skill.mjs (pure
// Node, no model call) so CI can run them for free.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  SKILL_PATH,
  PROMPT_PATH,
  OUT_PATH,
  FRONTMATTER_NAME,
  computeSourceHash,
  runGuard,
} from './web-skill-lib.mjs';

const MODEL = process.env.WEB_SKILL_MODEL || 'opus';
const MAX_ATTEMPTS = Number(process.env.WEB_SKILL_ATTEMPTS || 5);

const skillMd = readFileSync(SKILL_PATH, 'utf8');
const promptMd = readFileSync(PROMPT_PATH, 'utf8');

const userPrompt =
  'Rewrite the following canonical SKILL.md into the descriptive web document ' +
  'described by your instructions:\n\n<skill_md>\n' +
  skillMd +
  '\n</skill_md>';

// Run the headless `claude` CLI as a pure text transform: the rewrite contract fully
// replaces Claude Code's default system prompt, and the empty tool allowlist denies it
// file and shell access. Returns the trimmed body; exits on a fatal CLI/auth error.
function generate() {
  const result = spawnSync(
    'claude',
    [
      '-p',
      '--model',
      MODEL,
      '--system-prompt',
      promptMd,
      '--allowedTools',
      '',
      '--output-format',
      'text',
    ],
    { input: userPrompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(
        'The `claude` CLI was not found on PATH. Install Claude Code and sign in ' +
          '(a Claude subscription works — no API key needed).',
      );
    } else {
      console.error(`Failed to run \`claude\`: ${result.error.message}`);
    }
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\`claude -p\` exited with status ${result.status}.`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(1);
  }

  // Strip an accidental fenced-code wrapper if the model added one.
  return result.stdout
    .trim()
    .replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/m, '$1')
    .trim();
}

const sourceHash = computeSourceHash(skillMd, promptMd);
const frontmatter =
  `---\n` +
  `name: ${FRONTMATTER_NAME}\n` +
  `source_hash: ${sourceHash}\n` +
  `generated: "DO NOT EDIT BY HAND — regenerate with: npm run build:web-skill"\n` +
  `---\n\n`;

// The rewrite is non-deterministic, so a run occasionally trips the guard (a stray
// imperative phrase, an unclosed code fence). The guard is the gate; retry a few times
// rather than write a bad file or make the caller rerun by hand.
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const body = generate();
  if (!body) {
    console.error(`Attempt ${attempt}/${MAX_ATTEMPTS}: \`claude\` returned empty output.`);
    continue;
  }
  const out = frontmatter + body + '\n';
  const violations = runGuard(out);
  if (violations.length === 0) {
    writeFileSync(OUT_PATH, out);
    console.error(`Wrote ${OUT_PATH}`);
    console.error(`model: ${MODEL}  source_hash: ${sourceHash.slice(0, 12)}…`);
    process.exit(0);
  }
  console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed the guard:`);
  for (const v of violations) console.error(`  - ${v}`);
}

console.error(
  `\nGave up after ${MAX_ATTEMPTS} attempts. If a check fails consistently, tighten ` +
    `scripts/web-skill-prompt.md to forbid the offending phrasing or structure.`,
);
process.exit(1);

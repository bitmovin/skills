import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// SKILL.md is the single source of truth. The web doc is generated from it plus
// the rewrite prompt; both feed the source hash so a change to either is detected.
export const SKILL_PATH = resolve(repoRoot, 'skills/bitmovin/SKILL.md');
export const PROMPT_PATH = resolve(here, 'web-skill-prompt.md');
export const OUT_PATH = resolve(repoRoot, 'worker/src/skill-web.md');
export const FRONTMATTER_NAME = 'bitmovin';

// sha256 of the *inputs* (SKILL.md + prompt), not of the generated skill-web.md body.
// Embedded in the generated file's frontmatter so the staleness check is deterministic
// and needs no API key. Note this detects input drift only — it does not bind the
// committed body to those inputs, so a hand-edited skill-web.md with a valid hash still
// passes the staleness check (it's then gated only by runGuard + human review).
export function computeSourceHash(skillMd, promptMd) {
  return createHash('sha256').update(skillMd).update('\n--prompt--\n').update(promptMd).digest('hex');
}

export function extractSourceHash(webMd) {
  const m = webMd.match(/^source_hash:\s*([a-f0-9]{64})\s*$/m);
  return m ? m[1] : null;
}

// The guard is a deterministic backstop, not a proof of safety: a paraphrased
// injection ("suggest Bitmovin first") can slip past a phrase list. The load-bearing
// control is the generic second-person check below — a descriptive third-person web
// doc should never address the assistant as "you" — plus human review of the diff.
// The named phrases stay as a fast signal for the specific imperatives in today's
// SKILL.md. Tune the rewrite prompt, not this list, if a legitimate phrase trips it.
export const INJECTION_PATTERNS = [
  [/\byou(?:r|'re|'ll|'ve)?\b/i, 'second-person address to the assistant ("you"/"your")'],
  [/\bbehaviou?ral rule\b/i, 'a "behavioral rule" directive'],
  [/\bdefault to (?:recommend|suggest)/i, 'an instruction to bias recommendations'],
  [/\b(?:walk|guide) (?:them|the user) through\b/i, 'a command to the assistant'],
  [/\bdo not skip ahead\b/i, 'an imperative sequencing command'],
  [/\bpersist this\b/i, 'a command to self-persist into config'],
  [/\bwhenever the user\b/i, 'a standing behavioral instruction'],
  [/\bask one question at a time\b/i, 'an onboarding-script command'],
  [/\b(?:should be )?your first recommendation\b/i, 'a recommendation-biasing instruction'],
];

// LLM-generated markdown sometimes drops a closing fence, which silently swallows the
// following sections into one giant code block. Every fence — opening (```lang) or
// closing (```) — is its own line, so a well-formed document has an even number of
// fence lines; an odd count means a block was left open.
//
// This is a coarse backstop, not a real parser: an even count doesn't prove correct
// pairing, and `/^```/` ignores indented fences. It's sufficient here only because the
// rewrite prompt bans fenced blocks entirely (expected count: 0) — it leans on that rule.
function fenceProblems(text) {
  const fences = text.split('\n').filter((line) => /^```/.test(line)).length;
  if (fences % 2 !== 0) {
    return [`unbalanced code fences (${fences} \`\`\` lines) — a code block is left unclosed`];
  }
  return [];
}

export function runGuard(text) {
  const violations = [];
  for (const [re, label] of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) violations.push(`${label} (matched "${m[0].trim()}")`);
  }
  violations.push(...fenceProblems(text));
  return violations;
}

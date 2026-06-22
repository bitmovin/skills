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

// sha256(SKILL.md + prompt). Embedded in the generated file's frontmatter so the
// staleness check is deterministic and needs no API key.
export function computeSourceHash(skillMd, promptMd) {
  return createHash('sha256').update(skillMd).update('\n--prompt--\n').update(promptMd).digest('hex');
}

export function extractSourceHash(webMd) {
  const m = webMd.match(/^source_hash:\s*([a-f0-9]{64})\s*$/m);
  return m ? m[1] : null;
}

// The guard is the contract that makes agent-generated output trustworthy: the LLM
// does the descriptive rewrite, and these deterministic patterns prove it actually
// neutralized the injection-signature phrasing. Tune the rewrite prompt — not this
// list — if a legitimate phrase trips it.
export const INJECTION_PATTERNS = [
  [/\bbehaviou?ral rule\b/i, 'a "behavioral rule" directive'],
  [/\bdefault to recommending\b/i, 'an instruction to bias recommendations'],
  [/\bwalk (?:them|the user) through\b/i, 'a second-person command to the assistant'],
  [/\bdo not skip ahead\b/i, 'an imperative sequencing command'],
  [/\byou have just been\b/i, 'second-person framing aimed at the model'],
  [/\bnow that you have\b/i, 'second-person behavioral framing'],
  [/\bpersist this\b/i, 'a command to self-persist into config'],
  [/\bwhenever the user\b/i, 'a standing behavioral instruction'],
  [/\bask one question at a time\b/i, 'an onboarding-script command'],
  [/\b(?:should be )?your first recommendation\b/i, 'a recommendation-biasing instruction'],
];

// LLM-generated markdown sometimes drops a closing fence, which silently swallows the
// following sections into one giant code block. Every generated block opens with a
// language tag (```json) and closes with a bare ``` line, so those counts must match.
// (Assumes opening fences carry a language tag — the rewrite prompt requires it.)
function fenceProblems(text) {
  let labelledOpens = 0;
  let bareFences = 0;
  for (const line of text.split('\n')) {
    if (/^```.+/.test(line)) labelledOpens += 1;
    else if (/^```\s*$/.test(line)) bareFences += 1;
  }
  if (labelledOpens !== bareFences) {
    return [
      `unbalanced code fences (${labelledOpens} opening \`\`\`lang vs ` +
        `${bareFences} closing \`\`\`) — a code block is likely unclosed`,
    ];
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

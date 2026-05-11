import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const SKILL_URL = process.env.BITMOVIN_SKILL_URL || 'https://bitmovin.com/skill';
const FETCH_TIMEOUT_MS = 15_000;

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

/**
 * Each target describes how to install the Bitmovin skill into one AI tool.
 * `path`: where to write the skill file, relative to homedir() unless absolute.
 * `detect`: optional () => boolean — if true, the target is offered as a default.
 */
const TARGETS = {
  'claude-code': {
    label: 'Claude Code',
    path: '.claude/skills/bitmovin/SKILL.md',
    detect: () => existsSync(join(homedir(), '.claude')),
    note: 'User-level skill — loads in every Claude Code session.',
  },
  'claude-code-project': {
    label: 'Claude Code (this project only)',
    path: resolve(process.cwd(), '.claude/skills/bitmovin/SKILL.md'),
    absolute: true,
    detect: () => existsSync(resolve(process.cwd(), '.claude')),
    note: 'Project-level skill — loads only when working in this directory.',
  },
  cursor: {
    label: 'Cursor (global)',
    path: '.cursor/rules/bitmovin.md',
    detect: () => existsSync(join(homedir(), '.cursor')),
    note: 'Global rule — applied across all Cursor projects.',
  },
  'cursor-project': {
    label: 'Cursor (this project only)',
    path: resolve(process.cwd(), '.cursor/rules/bitmovin.md'),
    absolute: true,
    detect: () => existsSync(resolve(process.cwd(), '.cursor')),
    note: 'Project rule — applied only in this directory.',
  },
  windsurf: {
    label: 'Windsurf',
    path: '.codeium/windsurf/memories/bitmovin.md',
    detect: () => existsSync(join(homedir(), '.codeium/windsurf')),
    note: 'Persistent Windsurf memory.',
  },
  copilot: {
    label: 'GitHub Copilot (this project)',
    path: resolve(process.cwd(), '.github/copilot-instructions.md'),
    absolute: true,
    detect: () => existsSync(resolve(process.cwd(), '.github')),
    note: 'Project-scoped Copilot instructions.',
    appendIfExists: true,
  },
  codex: {
    label: 'OpenAI Codex / Codex CLI',
    path: '.codex/skills/bitmovin/SKILL.md',
    detect: () => existsSync(join(homedir(), '.codex')),
    note: 'User-level Codex skill.',
  },
};

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.flags.help = true;
    else if (a === '--version' || a === '-v') args.flags.version = true;
    else if (a === '--yes' || a === '-y') args.flags.yes = true;
    else if (a === '--target') args.flags.target = argv[++i];
    else if (a.startsWith('--target=')) args.flags.target = a.slice('--target='.length);
    else if (a === '--list-targets') args.flags.listTargets = true;
    else args.positional.push(a);
  }
  return args;
}

function printHelp() {
  stdout.write(`
${c.bold('@bitmovin/skills')} — install the Bitmovin AI skill into your coding tool

${c.bold('Usage:')}
  npx @bitmovin/skills [options]

${c.bold('Options:')}
  --target <name>    Install target (skip prompt). One of:
                       ${Object.keys(TARGETS).join(', ')}
  --list-targets     List supported targets and exit
  -y, --yes          Accept defaults / overwrite without prompting
  -h, --help         Show this help
  -v, --version      Show wizard version

${c.bold('Environment:')}
  BITMOVIN_SKILL_URL  Override the source URL (default: ${SKILL_URL})

${c.bold('Examples:')}
  npx @bitmovin/skills
  npx @bitmovin/skills --target claude-code -y
  npx @bitmovin/skills --target cursor-project

${c.dim('Docs: https://github.com/bitmovin/skills')}
`);
}

function listTargets() {
  stdout.write(`${c.bold('Supported targets:')}\n`);
  for (const [key, t] of Object.entries(TARGETS)) {
    const detected = t.detect && t.detect() ? c.green(' [detected]') : '';
    stdout.write(`  ${c.cyan(key.padEnd(22))} ${t.label}${detected}\n`);
    stdout.write(`  ${c.dim(' '.repeat(22) + ' ' + t.note)}\n`);
  }
}

async function fetchSkill() {
  let res;
  try {
    res = await fetch(SKILL_URL, {
      headers: { Accept: 'text/markdown, text/plain;q=0.9' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(
        `Timed out after ${FETCH_TIMEOUT_MS}ms fetching skill from ${SKILL_URL}. ` +
        `Check connectivity or override the source with BITMOVIN_SKILL_URL.`,
      );
    }
    throw new Error(`Network error fetching ${SKILL_URL}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch skill from ${SKILL_URL} (HTTP ${res.status}). ` +
      `Override the source with BITMOVIN_SKILL_URL if needed.`,
    );
  }
  return await res.text();
}

function resolveTargetPath(target) {
  return target.absolute ? target.path : join(homedir(), target.path);
}

async function chooseTarget(rl, preselected) {
  if (preselected) {
    if (!TARGETS[preselected]) throw new Error(`Unknown target: ${preselected}. Run with --list-targets to see options.`);
    return preselected;
  }

  const entries = Object.entries(TARGETS);
  const detected = entries.map(([, t]) => Boolean(t.detect && t.detect()));
  const detectedIdx = detected.indexOf(true);

  stdout.write(`\n${c.bold('Where should I install the Bitmovin skill?')}\n\n`);
  entries.forEach(([, t], i) => {
    const tag = detected[i] ? c.green(' [detected]') : '';
    const star = i === detectedIdx ? c.cyan('*') : ' ';
    stdout.write(`  ${star} ${String(i + 1).padStart(2)}. ${t.label}${tag}\n`);
  });
  stdout.write('\n');

  const defaultIdx = detectedIdx >= 0 ? detectedIdx + 1 : 1;
  const answer = (await rl.question(`Choose [1-${entries.length}] (default: ${defaultIdx}): `)).trim();
  const choice = answer === '' ? defaultIdx : Number.parseInt(answer, 10);
  if (!Number.isFinite(choice) || choice < 1 || choice > entries.length) {
    throw new Error(`Invalid choice: ${answer}`);
  }
  return entries[choice - 1][0];
}

async function confirmOverwrite(rl, path, yes) {
  if (!existsSync(path) || yes) return true;
  const ans = (await rl.question(`${c.yellow('!')} ${path} already exists. Overwrite? [y/N]: `)).trim().toLowerCase();
  return ans === 'y' || ans === 'yes';
}

export async function run(argv) {
  const args = parseArgs(argv);

  if (args.flags.help) return printHelp();
  if (args.flags.version) {
    const require = createRequire(import.meta.url);
    const { version } = require('../package.json');
    stdout.write(`${version}\n`);
    return;
  }
  if (args.flags.listTargets) return listTargets();

  stdout.write(`\n${c.bold(c.cyan('Bitmovin Skills installer'))}\n`);
  stdout.write(c.dim(`Source: ${SKILL_URL}\n`));

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const targetKey = await chooseTarget(rl, args.flags.target);
    const target = TARGETS[targetKey];
    const destPath = resolveTargetPath(target);

    stdout.write(`\n${c.dim('→ Fetching skill content...')}\n`);
    const content = await fetchSkill();
    if (!content.trim()) throw new Error('Skill content was empty.');

    if (target.appendIfExists && existsSync(destPath) && !args.flags.yes) {
      const ans = (await rl.question(`${c.yellow('!')} ${destPath} exists. (a)ppend, (o)verwrite, or (c)ancel? [a/o/c]: `)).trim().toLowerCase();
      if (ans === 'a') {
        const { readFile } = await import('node:fs/promises');
        const existing = await readFile(destPath, 'utf8');
        const merged = `${existing.replace(/\n+$/, '')}\n\n${content}`;
        await writeFile(destPath, merged, 'utf8');
        stdout.write(c.green(`✓ Appended to ${destPath}\n`));
        printNextSteps(target);
        return;
      }
      if (ans !== 'o') {
        stdout.write(c.yellow('Cancelled.\n'));
        return;
      }
    } else if (!(await confirmOverwrite(rl, destPath, args.flags.yes))) {
      stdout.write(c.yellow('Cancelled.\n'));
      return;
    }

    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content, 'utf8');
    stdout.write(c.green(`✓ Installed to ${destPath}\n`));
    printNextSteps(target);
  } finally {
    rl.close();
  }
}

function printNextSteps(target) {
  stdout.write(`\n${c.bold('Next steps:')}\n`);
  stdout.write(`  - Restart ${target.label} so it picks up the new skill.\n`);
  stdout.write(`  - Ask your agent: ${c.cyan('"Learn about Bitmovin"')} to walk through MCP and CLI setup.\n`);
  stdout.write(`  - Get an API key at ${c.cyan('https://dashboard.bitmovin.com/account')} when you're ready to use Bitmovin product APIs.\n\n`);
}

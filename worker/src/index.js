import skillMd from '../../skills/bitmovin/SKILL.md';

const REPO_URL = 'https://github.com/bitmovin/skills';
const NPX_CMD = 'npx @bitmovin/skills';
const CACHE_HEADERS = {
  'cache-control': 'public, max-age=300, s-maxage=600',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, HEAD, OPTIONS',
          'access-control-allow-headers': 'Accept, Content-Type, User-Agent',
          'access-control-max-age': '86400',
        },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/skill.md' || path === '/skill.markdown') {
      return mdResponse(skillMd);
    }

    if (path === '/skill') {
      return wantsHtml(request) ? htmlResponse(renderLanding()) : mdResponse(skillMd);
    }

    return new Response('Not Found', { status: 404 });
  },
};

function wantsHtml(request) {
  const url = new URL(request.url);
  const fmt = url.searchParams.get('format');
  if (fmt === 'md' || fmt === 'markdown' || fmt === 'raw') return false;
  if (fmt === 'html') return true;

  // Explicit Accept header wins over UA sniffing.
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (accept.includes('text/markdown')) return false;
  if (accept.includes('text/html')) return true;

  // No explicit preference — sniff the UA. CLI clients and agent libraries
  // get markdown; everything ambiguous defaults to markdown too.
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (/curl|wget|node-fetch|undici|python-requests|httpx|^go-http-client|libwww-perl|fetch|axios/.test(ua)) {
    return false;
  }

  return false;
}

function mdResponse(body) {
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      ...CACHE_HEADERS,
    },
  });
}

function htmlResponse(body) {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...CACHE_HEADERS,
    },
  });
}

function renderLanding() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Install Bitmovin in your AI tool</title>
<meta name="description" content="One-prompt install of the Bitmovin AI skill into Claude Code, Cursor, Windsurf, GitHub Copilot, and Codex.">
<style>
  :root { color-scheme: light dark; --bm: #1730E7; --fg: #111; --muted: #555; --bg: #fff; --code-bg: #f4f4f6; --border: #e5e5ea; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #f5f5f7; --muted: #a1a1a6; --bg: #0b0b0d; --code-bg: #18181b; --border: #2a2a2e; }
  }
  html, body { margin: 0; padding: 0; }
  body { font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 720px; margin: 0 auto; padding: 64px 24px 96px; }
  h1 { font-size: 32px; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 12px; }
  .lead { color: var(--muted); margin: 0 0 32px; font-size: 17px; }
  .cmd { display: flex; align-items: center; gap: 12px; background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; font: 15px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .cmd code { flex: 1; user-select: all; }
  .cmd button { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px; color: var(--muted); }
  .cmd button:hover { color: var(--fg); }
  h2 { font-size: 20px; margin: 40px 0 12px; letter-spacing: -0.01em; }
  ul { padding-left: 22px; margin: 0 0 24px; }
  li { margin: 6px 0; }
  a { color: var(--bm); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .small { font-size: 14px; color: var(--muted); }
  .raw { display: inline-block; margin-top: 32px; font-size: 14px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--bm); color: #fff; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: middle; margin-right: 8px; }
</style>
</head>
<body>
<main>
  <h1><span class="pill">Bitmovin</span>Install with AI in a single prompt</h1>
  <p class="lead">Drop the Bitmovin skill into Claude Code, Cursor, Windsurf, GitHub Copilot, or OpenAI Codex. Your AI tool will know how to use Bitmovin Player, Encoding, Observability, AI Scene Analysis, Streams, and Stream Lab.</p>

  <div class="cmd">
    <code id="cmd">${NPX_CMD}</code>
    <button onclick="navigator.clipboard.writeText(document.getElementById('cmd').textContent)">Copy</button>
  </div>

  <h2>What this does</h2>
  <ul>
    <li>Detects which AI tool you're using.</li>
    <li>Installs the Bitmovin skill into the right location for that tool.</li>
    <li>Walks you through connecting the Bitmovin MCP server (optional, requires API key).</li>
    <li>Optionally installs the <code>@bitmovin/cli</code> for terminal users.</li>
  </ul>

  <h2>Already in a chat with an AI?</h2>
  <p>Paste this prompt:</p>
  <div class="cmd"><code>Learn about Bitmovin from bitmovin.com/skill</code></div>

  <p class="small raw">Raw skill content: <a href="/skill.md">bitmovin.com/skill.md</a> &middot; Source: <a href="${REPO_URL}">github.com/bitmovin/skills</a></p>
</main>
</body>
</html>`;
}

// The public URL serves a DESCRIPTIVE rewrite of the skill, generated from the
// canonical skills/bitmovin/SKILL.md (see scripts/build-web-skill.mjs). The raw
// imperative SKILL.md is only distributed via `npx @bitmovin/skills` / the plugin
// marketplace, where the user has chosen to install it — serving it over HTTP gets
// flagged as prompt injection when an agent fetches the page.
import skillWebMd from './skill-web.md';
import landingHtml from './landing.html';

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

    // 301-redirect the common plural typo `/skills` to the canonical
    // `/skill`. The Worker route `bitmovin.com/skill*` already matches
    // these. Note that the zone's WAF Skip Rule only covers /skill,
    // /skill.md and /skill/* — so curl/agents hitting /skills still
    // see the bot challenge first. Browser users solve the challenge
    // and reach this redirect on retry.
    if (path === '/skills' || path === '/skills.md' || path === '/skills.markdown') {
      const target = path.replace(/^\/skills/, '/skill') + url.search;
      return Response.redirect(new URL(target, url).toString(), 301);
    }
    if (path.startsWith('/skills/')) {
      const target = '/skill/' + path.slice('/skills/'.length) + url.search;
      return Response.redirect(new URL(target, url).toString(), 301);
    }

    if (path === '/skill.md' || path === '/skill.markdown') {
      return mdResponse(skillWebMd);
    }

    if (path === '/skill') {
      return wantsHtml(request) ? htmlResponse(landingHtml) : mdResponse(skillWebMd);
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

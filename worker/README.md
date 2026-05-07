# bitmovin.com/skill — Cloudflare Worker

Serves the canonical Bitmovin hub skill with content negotiation:

- `GET /skill` from a browser (`Accept: text/html`) → HTML landing page with the `npx @bitmovin/skills` install command.
- `GET /skill` from `curl`, an AI agent, or any client requesting `text/markdown` → raw markdown.
- `GET /skill.md` → raw markdown unconditionally.
- `?format=md|html` → force one or the other.

The skill content is bundled into the Worker at deploy time from `../skills/bitmovin/SKILL.md`, so updates require redeploy.

## Deploy

```bash
cd worker
npm install -g wrangler   # or use npx wrangler
wrangler login
wrangler deploy
```

Then enable the routes in `wrangler.toml` (currently commented out):

```toml
[[routes]]
pattern = "bitmovin.com/skill"
zone_name = "bitmovin.com"

[[routes]]
pattern = "bitmovin.com/skill/*"
zone_name = "bitmovin.com"

[[routes]]
pattern = "bitmovin.com/skill.md"
zone_name = "bitmovin.com"
```

The `bitmovin.com` zone must be on Cloudflare and the deploying account must have edit access to that zone.

## Test locally

```bash
wrangler dev
# In another terminal:
curl -s http://localhost:8787/skill | head
curl -s -H 'Accept: text/html' http://localhost:8787/skill | head
curl -s http://localhost:8787/skill.md | head
```

## Update the served content

The Worker imports `../skills/bitmovin/SKILL.md` directly. To update what's served, edit that file and redeploy. There is no separate copy in the Worker directory.

## Caching

Responses set `cache-control: public, max-age=300, s-maxage=600` (5 minutes browser, 10 minutes Cloudflare edge). Adjust in `src/index.js` if you want shorter or longer TTLs.

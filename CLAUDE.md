# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo is a monorepo of three independent ES-module Node.js services. See `AGENTS.md` for contributor conventions (style, commit/PR format, testing policy); this file focuses on architecture and the per-service commands needed to be productive. The active development area is `toloka-addon/`.

## Services

| Dir | Package | Role |
|-----|---------|------|
| `addon/` | `stremio-torrentio` | Main Torrentio Stremio addon. Reads scraped torrents from Postgres, applies filtering/sorting, and resolves streams through debrid providers ("mochs"). |
| `catalogs/` | `stremio-torrentio-catalogs` | Catalog endpoints. **Imports from `addon/lib/`** — the sibling layout is load-bearing; do not move or rename `addon/lib/` without updating catalogs. |
| `toloka-addon/` | `stremio-toloka-torbox` (private) | Companion addon: searches Toloka, verifies exact IMDb match, and only exposes releases already cached in TorBox. |

Each package has its own `package.json`, `package-lock.json`, `Dockerfile`, and GitHub Actions workflow under `.github/workflows/`. Install and run from inside each directory; there is no root-level package.

## Commands

```sh
# Main addon (needs DATABASE_URI, REDIS_URL, and metrics vars; listens on PORT or 7000)
cd addon && npm ci && npm start

# Catalogs
cd catalogs && npm ci && npm start

# Toloka addon (Node 22+)
cd toloka-addon && npm ci
npm test                       # node --test runner
npm run check                  # node --check syntax-check every src/scripts/test file
npm run dev                    # --watch, loads .env if present
npm start                      # loads .env if present
node --test test/unit/discovery.test.js   # run a single test file
node --test --test-name-pattern="<name>"  # run tests matching a name

# Toloka feasibility probes (real credentials via local .env)
npm run probe:login            # TOLOKA_USERNAME / TOLOKA_PASSWORD
TOLOKA_TOPIC_ID=12345 npm run probe:cache   # + TORBOX_API_TOKEN
```

There is **no linter or formatter** configured anywhere. After editing a legacy service (`addon/`, `catalogs/`) the only check is `node --check path/to/file.js` plus starting the package. Build deploy-equivalent images from repo root (note catalogs uses a root context):

```sh
docker build -t torrentio-addon ./addon
docker build -t torrentio-catalogs . -f catalogs/Dockerfile
docker build -t toloka-addon ./toloka-addon
```

## Architecture — `addon/`

Stremio addon built on `stremio-addon-sdk`. `index.js` wraps `serverless.js` in Express plus swagger-stats metrics; `serverless.js` is a `router` instance handling configuration landing pages, manifests, Redis-backed rate limiting, and moch resolver routes. `addon.js` defines the SDK handlers.

Stream request flow (`addon.js` → `resolveStreams`): query Postgres via `lib/repository.js` (Sequelize models `Torrent`/`File`) → `applyFilters` → `applySorting` → `applyStaticInfo` → `applyMochs` → cache-param enrichment. Requests are deduped through a named-queue + `p-limit`, and results are cached (`lib/cache.js`, Keyv over Mongo/Redis) with stale-while-revalidate semantics.

**Mochs** (`moch/`) are debrid-provider integrations (RealDebrid, Premiumize, AllDebrid, DebridLink, EasyDebrid, Offcloud, TorBox, Put.io). `moch/moch.js` holds the `MochOptions` registry and orchestrates `applyMochs`, catalog, and meta resolution across providers; each provider file implements the same interface. Add a provider by adding a module plus a `MochOptions` entry. `moch/static.js` handles static/non-debrid responses.

Keep route handlers thin: data access, filtering, and provider logic live in `lib/` and `moch/`.

## Architecture — `toloka-addon/`

Express 5 app (no Stremio SDK) wired in `src/app.js`, started by `src/index.js`. Config is parsed and frozen by `src/config.js` using Zod — `loadConfig` defines every env var and its default; read it first when you need to know a setting.

**Security model is central:**
- All real routes live under `/:secret` and are gated by a constant-time compare against `ADDON_SECRET` (mismatch → 404). Routes: `/configure`, `/manifest.json`, `/cache/clear`, `/stream/:type/:id.json`, `/resolve/:payload/:signature/:filename`.
- Stream URLs are self-contained: `src/routes/stream.js` HMAC-signs a payload (`src/security/payload.js`, `SIGNING_SECRET`) describing the release; `src/routes/resolve.js` verifies signature + TTL + Zod schema before playback. No server-side session state.
- `src/security/redaction.js` and the logger deliberately exclude HTML bodies, announce URLs, tokens, cookies, and TorBox CDN URLs from logs.

**Two core services:**
- `src/services/discovery.js` (`find`): Cinemeta metadata (with Wikidata alternate-title fallback) → build search queries (`domain/release.js`) → search Toloka → narrow candidates → fetch topics and enforce **exact IMDb match** (`hasExactImdbMatch`) → download authenticated `.torrent` → check TorBox cache → match video files. Movie vs. series behavior is governed by separate `*_LIMIT` / `*_DELAY_MS` config knobs. Results (including negative results) are cached in in-memory weighted `MemoryCache`s; auth/dependency failures mark the result `degraded` (non-enumerable flag) so the route sends `no-store` instead of caching an empty list.
- `src/services/playback.js` (`resolve`): re-validates the IMDb match, ensures the torrent is cached in TorBox (waiting briefly on `downloading`), and returns a temporary TorBox download URL. **V1 invariant: never asks TorBox to fetch uncached torrents** — uncached releases simply do not appear.

Clients in `src/clients/` (`toloka`, `torbox`, `cinemeta`, `wikidata`, shared `http`) are the only things that make network calls; `src/domain/` is pure parsing/matching logic (`stremio-id`, `release`, `torrent`, `video-match`). Dependencies are injected into `createApp`/services, which is how tests substitute fakes.

Tests use Node's built-in runner: `test/unit/` (one file per module, HTML fixtures in `test/fixtures/`) and `test/integration/app.test.js` (full app with injected fakes). Keep provider calls mocked; run credentialed probes only from a local, gitignored `.env`.

Deployment targets Cloud Run (`deploy-cloud-run.sh`, `setup-gcp.sh`, secrets via Secret Manager). Cloud Run only coordinates metadata/provider API calls — TorBox serves the video bytes directly. See `toloka-addon/README.md` for the full deploy procedure and `FEATURE_PLAN.md` for roadmap.

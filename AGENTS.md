# Repository Guidelines

## Project Structure & Module Organization

This repository contains two ES module Node.js services:

- `addon/` serves the main Torrentio Stremio addon. `addon.js` defines handlers, `serverless.js` defines HTTP routes, `lib/` contains shared domain and infrastructure helpers, and `moch/` contains debrid-provider integrations.
- `catalogs/` serves catalog endpoints. Its `lib/` directory contains metadata, cache, manifest, and repository logic.
- `addon/static/` stores landing-page images and fallback videos.
- `.github/workflows/` builds and deploys each service independently.

The catalogs service imports shared modules from `addon/lib/`; preserve this sibling-directory layout.

## Build, Test, and Development Commands

Install and run each package from its own directory:

```sh
cd addon && npm ci && npm start
cd catalogs && npm ci && npm start
```

Both services listen on `PORT` or default to `7000`. They require backing services configured through environment variables such as `DATABASE_URI`, `MONGODB_URI`, and, for the addon, `REDIS_URL`, `METRICS_USER`, and `METRICS_PASSWORD`.

Build deployment-equivalent images from the repository root:

```sh
docker build -t torrentio-addon ./addon
docker build -t torrentio-catalogs . -f catalogs/Dockerfile
```

## Coding Style & Naming Conventions

Use modern JavaScript with ES module `import`/`export`, 2-space indentation, semicolons, and trailing commas only where they improve multiline readability. Follow existing names: `camelCase` for functions and variables, `PascalCase` for classes or enum-like objects, and uppercase snake case for constants such as `CACHE_MAX_AGE`. Keep route handling thin and place database, cache, filtering, and provider logic in the corresponding `lib/` or `moch/` module.

No formatter or linter is configured; match surrounding code and run `node --check path/to/file.js` on changed files.

## Testing Guidelines

There is currently no automated test suite. For every change, perform syntax checks and start the affected service. Verify relevant routes manually, for example `curl http://localhost:7000/manifest.json`. Changes involving caches, databases, Redis, or debrid providers should be exercised against a non-production configuration. Document the manual cases tested in the pull request.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, imperative summaries, for example `reduce tb timeout` or `update landing template`. Keep each commit focused on one behavior.

Pull requests should identify the affected service, describe user-visible behavior and configuration changes, list verification steps, and link related issues. Include screenshots for landing-page changes and note any new environment variables or deployment requirements.

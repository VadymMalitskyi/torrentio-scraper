# Repository Guidelines

## Project Structure & Module Organization

This repository contains three ES module Node.js services:

- `addon/` serves the main Torrentio Stremio addon. `addon.js` defines handlers, `serverless.js` defines HTTP routes, `lib/` contains shared domain and infrastructure helpers, and `moch/` contains debrid-provider integrations.
- `catalogs/` serves catalog endpoints. Its `lib/` directory contains metadata, cache, manifest, and repository logic.
- `toloka-addon/` is the private Toloka-to-TorBox companion addon. `src/clients/` contains provider integrations, `src/domain/` contains parsing and matching logic, and `test/` contains Node test-runner coverage.
- `addon/static/` stores landing-page images and fallback videos.
- `.github/workflows/` builds and deploys each service independently.

`catalogs/` imports modules from `addon/lib/`; preserve the sibling layout.

## Build, Test, and Development Commands

Install and run each package from its own directory:

```sh
cd addon && npm ci && npm start
cd catalogs && npm ci && npm start
cd toloka-addon && npm ci && npm test && npm start
```

Legacy services listen on `PORT` or `7000` and require their documented database, Redis, and metrics variables.

Build deployment-equivalent images from the repository root:

```sh
docker build -t torrentio-addon ./addon
docker build -t torrentio-catalogs . -f catalogs/Dockerfile
docker build -t toloka-addon ./toloka-addon
```

## Coding Style & Naming Conventions

Use modern JavaScript with ES module `import`/`export`, 2-space indentation, semicolons, and trailing commas only where they improve multiline readability. Follow existing names: `camelCase` for functions and variables, `PascalCase` for classes or enum-like objects, and uppercase snake case for constants such as `CACHE_MAX_AGE`. Keep route handling thin and place database, cache, filtering, and provider logic in the corresponding `lib/` or `moch/` module.

No formatter or linter is configured; match surrounding code and run `node --check path/to/file.js` on changed files.

## Testing Guidelines

The legacy services have no automated suite; syntax-check and start the affected package. The Toloka addon uses Node's test runner: run `cd toloka-addon && npm run check && npm test`. Keep provider tests mocked and run credentialed feasibility probes only from a local, ignored `.env`. Document manual provider cases in the pull request.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, imperative summaries, for example `reduce tb timeout` or `update landing template`. Keep each commit focused on one behavior.

Pull requests should identify the affected service, describe user-visible behavior and configuration changes, list verification steps, and link related issues. Include screenshots for landing-page changes and note any new environment variables or deployment requirements.

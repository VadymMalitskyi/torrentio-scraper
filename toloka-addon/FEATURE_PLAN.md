# Toloka Addon Implementation Plan

## Objective
Build and maintain a private `toloka-addon` service that extends Stremio with Toloka-discovered streams, while keeping V1 limited to torrents that are already cached in TorBox.

## Current V1 State
- `toloka-addon/` exists as a standalone Node/Express service.
- Local playback works for movies and series through protected Stremio routes.
- Cloud Run deployment works with Secret Manager and private manifest installation.
- Discovery is cached-only: the addon never asks TorBox to fetch uncached torrents from Toloka.
- Admin cache reset endpoint exists at `POST /<ADDON_SECRET>/cache/clear`.
- Toloka search and parser fixes are in place for current tracker markup.
- CORS is enabled so Stremio can fetch the manifest and stream endpoints.

## Confirmed Constraints
- Toloka search results do not carry authoritative IMDb metadata.
- Exact IMDb validation happens only after opening the Toloka topic page.
- Broad series searches can trigger too many topic fetches and Toloka `429` rate limiting.
- TorBox cache presence alone is not enough; the addon must still reach the correct Toloka topic, parse its torrent, and match the right file.

## Recent Search Improvements
- Series queries are yearless.
- Series queries are season-aware, for example `The Boys Season 5`.
- Series discovery does not stop at the first non-empty query; it can merge candidates from the series query set.
- Series candidates are narrowed before topic fetches using season and episode hints.
- Discovery now uses explicit Toloka request budgets and per-candidate pacing.

## Active V1 Search Budget
- movie topic fetch limit: `3`
- series topic fetch limit: `3`
- movie torrent download limit: `2`
- series torrent download limit: `2`
- movie release limit: `1`
- series release limit: `4`
- series inter-candidate delay: `750 ms`

## Next Change: Series Candidate Narrowing Follow-Up
Reduce Toloka topic-page fetches further for series requests while preserving the exact IMDb correctness gate.

### Goal
For `series` requests, inspect the most likely season and episode candidates first and spend as few Toloka requests as possible before either finding a playable cached release or giving up.

### Non-Goals
- No change to movie discovery ranking.
- No active TorBox download path.
- No weakening of the exact IMDb requirement.

## Candidate Narrowing Strategy
Before calling `toloka.getTopic(candidate.url)`, rank or filter series candidates using title-level heuristics from the Toloka search result row.

Heuristics, in order:
1. Prefer titles that explicitly mention the requested season and episode, for example `S03E07`, `3x07`, `Season 3`, `Сезон 3`.
2. Prefer titles that mention the requested season even if the episode is inside a season pack.
3. De-prioritize large multi-season packs when a single-season or single-episode result exists.
4. Keep a bounded fallback window so the addon still inspects a few weaker candidates if the strong ones fail.

## Proposed Follow-Up Work
1. Add diagnostic logging for series ranking and rejection reasons when debugging is enabled.
2. Add a topic-specific debug path for known `TOLOKA_TOPIC_ID` values.
3. Tighten fallback behavior if Toloka `429` remains common.
4. Revisit the series request budgets after live observation.

## Expected Behavior
For a request like `tt1190634:5:2`, the addon should:
- search Toloka with season-aware title queries
- include season 5 topics in the candidate set
- inspect season 5 and `S05E02` style candidates before older season packs
- stop after a small bounded number of topic and torrent requests

## Validation Plan
### Automated
- Unit tests for series query generation.
- Unit tests for candidate scoring and ordering.
- Discovery tests proving the service inspects narrowed candidates first.
- Full `npm test` and `npm run check`.

### Manual
- Clear caches with `POST /<ADDON_SECRET>/cache/clear`.
- Test at least one broad series search locally.
- Confirm fewer Toloka `429` warnings in logs.
- Confirm the correct episode still resolves to TorBox playback.

## Risks
- Over-aggressive narrowing could hide valid releases if title patterns are unusual.
- Some Toloka topics may use Ukrainian-only season naming and need extra token support.
- Series packs can still be valid if no narrower candidate exists; fallback logic must remain.

## Follow-Up After This Phase
If Toloka `429` is still common after the current narrowing and request caps, add one of these next:
- stronger pacing between topic fetches
- a small topic-debug endpoint for known Toloka topics
- temporary diagnostic logging of candidate ranking and rejection reasons

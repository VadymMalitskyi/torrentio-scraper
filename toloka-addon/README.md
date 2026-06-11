# Toloka + TorBox Stremio Addon

Private companion addon that searches Toloka, verifies an exact IMDb ID, parses the original authenticated `.torrent`, and plays it only when TorBox already has the torrent cached.

## Prerequisites

- Node.js 22+
- Toloka account
- TorBox API token
- Two independent random secrets of at least 32 characters

Create local configuration without committing it:

```sh
cp .env.example .env
```

`probe:login` only requires `TOLOKA_USERNAME` and `TOLOKA_PASSWORD`.
`probe:cache` additionally requires `TORBOX_API_TOKEN`. The addon and
Cloud Run deployment also require `ADDON_SECRET` and `SIGNING_SECRET`.
Probe scripts load `.env` through Node, so credentials containing shell
characters such as `&` do not require shell escaping.

## Mandatory Feasibility Gate

Use a Toloka topic that is already cached in TorBox or likely to be cached:

```sh
npm run probe:login
TOLOKA_TOPIC_ID=12345 npm run probe:cache
```

The cache probe downloads the Toloka torrent, verifies the exact info hash, checks TorBox cache availability, materializes a TorBox item only if it is already cached, and requests a temporary download URL. Uncached torrents are expected V1 misses, not failures.

## Local Development

```sh
npm ci
npm test
npm run check
npm start
```

Health: `http://127.0.0.1:7000/healthz`

Manifest: `http://127.0.0.1:7000/<ADDON_SECRET>/manifest.json`

Clear in-memory caches:

```sh
curl -X POST http://127.0.0.1:7000/<ADDON_SECRET>/cache/clear
```

## Cloud Run

Create these Secret Manager secrets:

- `toloka-username`
- `toloka-password`
- `torbox-api-token`
- `addon-secret`
- `signing-secret`

Install and authenticate the `gcloud` CLI, then create the APIs, repository, runtime identity, and empty secrets:

```sh
GCP_PROJECT=your-project ./setup-gcp.sh
```

Add secret versions through standard input so values are not command arguments:

```sh
printf %s "$TOLOKA_USERNAME" | gcloud secrets versions add toloka-username --project "$GCP_PROJECT" --data-file=-
printf %s "$TOLOKA_PASSWORD" | gcloud secrets versions add toloka-password --project "$GCP_PROJECT" --data-file=-
printf %s "$TORBOX_API_TOKEN" | gcloud secrets versions add torbox-api-token --project "$GCP_PROJECT" --data-file=-
printf %s "$ADDON_SECRET" | gcloud secrets versions add addon-secret --project "$GCP_PROJECT" --data-file=-
printf %s "$SIGNING_SECRET" | gcloud secrets versions add signing-secret --project "$GCP_PROJECT" --data-file=-
```

Deploy:

```sh
GCP_PROJECT=your-project ./deploy-cloud-run.sh
```

The initial deployment uses 1 CPU, 512 MiB RAM, concurrency 4, minimum instances 0, and maximum instances 1. Install:

```text
https://<cloud-run-host>/<ADDON_SECRET>/manifest.json
```

Cloud Run only coordinates metadata and provider API calls. TorBox serves video bytes directly.

## V1 Behavior

- Exact IMDb match is mandatory.
- Only TorBox-cached Toloka torrents are exposed in Stremio.
- The addon never asks TorBox to fetch uncached torrents from Toloka in V1.
- If a Toloka release is uncached in TorBox, it simply does not appear.

## Security

Never commit `.env`, `.torrent` files, cookies, passkeys, or API tokens. Resolver URLs contain signed metadata only. Logs deliberately exclude HTML bodies, torrent announce URLs, provider tokens, cookies, and TorBox CDN URLs.

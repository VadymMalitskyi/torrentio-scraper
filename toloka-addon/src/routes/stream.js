import path from 'node:path';
import { parseStremioId } from '../domain/stremio-id.js';
import { signPayload } from '../security/payload.js';

export function createStreamHandler({ config, discovery, logger }) {
  return async (req, res) => {
    let request;
    try {
      request = parseStremioId(req.params.type, req.params.id);
    } catch {
      return res.json({ streams: [] });
    }

    try {
      const releases = await discovery.find(request);
      const issuedAt = Math.floor(Date.now() / 1000);
      const streams = releases.map((release) => {
        const { payload, signature } = signPayload({
          v: 1,
          topicId: release.topicId,
          attachmentId: release.attachmentId,
          infoHash: release.infoHash,
          path: release.path,
          size: release.size,
          imdbId: request.imdbId,
          ...(request.type === 'series' && {
            season: request.season,
            episode: request.episode,
          }),
          issuedAt,
        }, config.signingSecret);
        const filename = encodeURIComponent(path.basename(release.path));
        return {
          name: 'Toloka\nTorBox',
          title: formatTitle(release),
          url: `${req.addonBaseUrl}/resolve/${payload}/${signature}/${filename}`,
          behaviorHints: {
            filename: path.basename(release.path),
            videoSize: release.size,
          },
        };
      });
      res.set('Cache-Control', streams.length
        ? `public, max-age=${Math.floor(config.tolokaCacheTtlMs / 1000)}`
        : `public, max-age=${Math.floor(config.tolokaNegativeCacheTtlMs / 1000)}`);
      return res.json({ streams });
    } catch (error) {
      logger.error('Stream discovery failed', {
        imdbId: request.imdbId,
        errorName: error.name,
      });
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ streams: [] });
    }
  };
}

function formatTitle(release) {
  const metrics = [
    formatBytes(release.size),
    Number.isInteger(release.seeds) ? `${release.seeds} seeders` : undefined,
  ].filter(Boolean).join(' | ');
  return `${release.releaseTitle}\n${metrics}\n${release.path}`;
}

function formatBytes(bytes) {
  const gib = bytes / (1024 ** 3);
  return `${gib.toFixed(gib >= 10 ? 1 : 2)} GiB`;
}

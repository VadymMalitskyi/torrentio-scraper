import { buildSearchQueries } from '../domain/release.js';
import { selectVideoFiles } from '../domain/video-match.js';
import { hasExactImdbMatch } from '../clients/toloka.js';
import { matchTorBoxFile } from '../clients/torbox.js';

export function createDiscoveryService({
  config,
  cinemeta,
  toloka,
  searchCache,
  metadataCache,
  torrentCache,
  torbox,
  logger,
}) {
  return {
    async find(request) {
      const cacheKey = requestKey(request);
      const cached = searchCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const metadataKey = `${request.type}:${request.imdbId}`;
      let meta = metadataCache.get(metadataKey);
      if (!meta) {
        meta = await cinemeta.getMeta(request.type, request.imdbId);
        metadataCache.set(metadataKey, meta, 24 * 60 * 60 * 1000);
      }

      const candidates = [];
      const seen = new Set();
      for (const query of buildSearchQueries(meta)) {
        const results = await toloka.search(query);
        for (const candidate of results) {
          if (!seen.has(candidate.topicId)) {
            candidates.push(candidate);
            seen.add(candidate.topicId);
          }
        }
        if (results.length > 0 || candidates.length >= config.maxSearchCandidates) {
          break;
        }
      }

      const releases = [];
      for (const candidate of candidates.slice(0, config.maxSearchCandidates)) {
        try {
          const topic = await toloka.getTopic(candidate.url);
          if (!hasExactImdbMatch(topic, request.imdbId)) {
            continue;
          }
          const attachment = selectAttachment(topic.attachments, candidate)
            || (candidate.attachmentId && toloka.attachmentForId(candidate.attachmentId));
          if (!attachment) {
            continue;
          }
          const torrent = await toloka.downloadTorrent(attachment);
          torrentCache.set(torrent.infoHash, torrent, config.torrentCacheTtlMs);
          const cachedEntry = await torbox.getCachedEntry(torrent.infoHash);
          if (!cachedEntry) {
            continue;
          }
          releases.push(
            ...selectVideoFiles(torrent.files, request, {
              minVideoBytes: config.minVideoBytes,
            })
              .filter((file) => matchTorBoxFile(cachedEntry.files || [], file.path, file.size))
              .map((file) => ({
                topicId: candidate.topicId,
                attachmentId: attachment.id,
                infoHash: torrent.infoHash,
                torrentName: torrent.name,
                path: file.path,
                size: file.size,
                releaseTitle: candidate.title || topic.title || torrent.name,
                seeds: candidate.seeds,
                leeches: candidate.leeches,
              })),
          );
        } catch (error) {
          logger.warn('Toloka candidate rejected', {
            topicId: candidate.topicId,
            errorName: error.name,
            status: error.status,
          });
        }
      }

      const ttl = releases.length
        ? config.tolokaCacheTtlMs
        : config.tolokaNegativeCacheTtlMs;
      searchCache.set(cacheKey, releases, ttl);
      return releases;
    },
  };
}

function selectAttachment(attachments, candidate) {
  if (candidate.attachmentId) {
    return attachments.find((attachment) => attachment.id === candidate.attachmentId)
      || (candidate.attachmentUrl && {
        id: candidate.attachmentId,
        url: candidate.attachmentUrl,
      });
  }
  return attachments[0];
}

function requestKey(request) {
  return [request.type, request.imdbId, request.season, request.episode]
    .filter((value) => value !== undefined)
    .join(':');
}

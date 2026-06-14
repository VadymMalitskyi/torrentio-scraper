import { buildSearchQueries, narrowTolokaCandidates } from '../domain/release.js';
import { selectVideoFiles } from '../domain/video-match.js';
import { hasExactImdbMatch } from '../clients/toloka.js';
import { matchTorBoxFile } from '../clients/torbox.js';

export function createDiscoveryService({
  config,
  cinemeta,
  wikidata,
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
        meta = await enrichMetadata(meta, request, wikidata, logger);
        metadataCache.set(metadataKey, meta, 24 * 60 * 60 * 1000);
      }

      const candidates = [];
      const seen = new Set();
      for (const query of buildSearchQueries(meta, request)) {
        const results = await toloka.search(query);
        for (const candidate of results.slice(0, config.maxSearchResultsPerQuery)) {
          if (!seen.has(candidate.topicId)) {
            candidates.push(candidate);
            seen.add(candidate.topicId);
          }
        }
      }

      const narrowedCandidates = narrowTolokaCandidates(
        candidates,
        request,
        meta,
        { limit: config.maxSearchCandidates },
      );
      const topicFetchLimit = request.type === 'series'
        ? config.seriesTopicFetchLimit
        : config.movieTopicFetchLimit;
      const torrentDownloadLimit = request.type === 'series'
        ? config.seriesTorrentDownloadLimit
        : config.movieTorrentDownloadLimit;
      const releaseLimit = request.type === 'series'
        ? config.seriesReleaseLimit
        : config.movieReleaseLimit;
      const candidateDelayMs = request.type === 'series'
        ? config.seriesCandidateDelayMs
        : config.movieCandidateDelayMs;

      const releases = [];
      let topicFetches = 0;
      let torrentDownloads = 0;
      for (const candidate of narrowedCandidates) {
        if (releases.length >= releaseLimit || topicFetches >= topicFetchLimit) {
          break;
        }
        try {
          if (candidateDelayMs > 0 && (request.type !== 'series' || topicFetches > 0)) {
            await sleep(candidateDelayMs);
          }
          topicFetches += 1;
          const topic = await toloka.getTopic(candidate.url);
          if (!hasExactImdbMatch(topic, request.imdbId)) {
            continue;
          }
          const attachment = selectAttachment(topic.attachments, candidate)
            || (candidate.attachmentId && toloka.attachmentForId(candidate.attachmentId));
          if (!attachment) {
            continue;
          }
          if (torrentDownloads >= torrentDownloadLimit) {
            break;
          }
          torrentDownloads += 1;
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

async function enrichMetadata(meta, request, wikidata, logger) {
  if (!wikidata || !needsAlternateTitleLookup(meta)) {
    return meta;
  }

  try {
    const titles = await wikidata.getTitlesByImdbId(request.imdbId);
    if (!titles.length) {
      return meta;
    }

    const existing = new Set(collectKnownTitles(meta).map((title) => title.toLocaleLowerCase()));
    const aliases = [
      ...(Array.isArray(meta.aliases) ? meta.aliases : []),
      ...titles.filter((title) => !existing.has(title.toLocaleLowerCase())),
    ];

    return {
      ...meta,
      aliases,
    };
  } catch (error) {
    logger.warn('Alternate title lookup failed', {
      imdbId: request.imdbId,
      errorName: error.name,
      status: error.status,
    });
    return meta;
  }
}

function needsAlternateTitleLookup(meta) {
  return collectKnownTitles(meta).length < 2;
}

function collectKnownTitles(meta) {
  return [
    meta?.name,
    meta?.originalName,
    meta?.originalTitle,
    ...(Array.isArray(meta?.aliases) ? meta.aliases : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, values) => (
      values.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index
    ));
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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

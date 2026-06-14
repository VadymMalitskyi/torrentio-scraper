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
      logger.debug('Discovery metadata ready', {
        ...requestContext(request),
        titles: collectKnownTitles(meta).slice(0, 8),
        releaseInfo: meta.releaseInfo || meta.year || meta.released,
      });

      const candidates = [];
      const seen = new Set();
      let degraded = false;
      const queries = buildSearchQueries(meta, request);
      const minQueriesBeforeStop = request.type === 'series' ? 3 : 2;
      logger.debug('Toloka queries prepared', {
        ...requestContext(request),
        queries,
      });
      for (const [index, query] of queries.entries()) {
        let results = [];
        try {
          results = await toloka.search(query);
        } catch (error) {
          degraded = degraded || isDegradedDiscoveryError(error);
          logger.warn('Toloka query failed', {
            ...requestContext(request),
            query,
            errorName: error.name,
            status: error.status,
          });
          continue;
        }
        logger.debug('Toloka query completed', {
          ...requestContext(request),
          query,
          resultCount: results.length,
          topResults: summarizeCandidates(results),
        });
        for (const candidate of results.slice(0, config.maxSearchResultsPerQuery)) {
          if (!seen.has(candidate.topicId)) {
            candidates.push(candidate);
            seen.add(candidate.topicId);
          }
        }
        if (candidates.length >= config.maxSearchCandidates && index + 1 >= minQueriesBeforeStop) {
          logger.debug('Toloka query loop stopped early', {
            ...requestContext(request),
            completedQueries: index + 1,
            candidateCount: candidates.length,
          });
          break;
        }
      }
      logger.debug('Toloka candidates collected', {
        ...requestContext(request),
        candidateCount: candidates.length,
      });

      const narrowedCandidates = narrowTolokaCandidates(
        candidates,
        request,
        meta,
        { limit: config.maxSearchCandidates },
      );
      logger.debug('Toloka candidates narrowed', {
        ...requestContext(request),
        candidateCount: narrowedCandidates.length,
        candidates: summarizeCandidates(narrowedCandidates),
      });
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
          logger.debug('Toloka topic fetch started', {
            ...requestContext(request),
            topicId: candidate.topicId,
            title: candidate.title,
            topicFetches,
          });
          const topic = await toloka.getTopic(candidate.url);
          if (!hasExactImdbMatch(topic, request.imdbId)) {
            logger.debug('Toloka candidate skipped', {
              ...requestContext(request),
              topicId: candidate.topicId,
              title: candidate.title,
              reason: 'imdb_mismatch',
              imdbIds: topic.imdbIds,
            });
            continue;
          }
          const attachment = selectAttachment(topic.attachments, candidate)
            || (candidate.attachmentId && toloka.attachmentForId(candidate.attachmentId));
          if (!attachment) {
            logger.debug('Toloka candidate skipped', {
              ...requestContext(request),
              topicId: candidate.topicId,
              title: candidate.title,
              reason: 'missing_attachment',
            });
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
            logger.debug('Toloka candidate skipped', {
              ...requestContext(request),
              topicId: candidate.topicId,
              title: candidate.title,
              reason: 'torbox_uncached',
              infoHash: torrent.infoHash,
            });
            continue;
          }
          const selectedFiles = selectVideoFiles(torrent.files, request, {
            minVideoBytes: config.minVideoBytes,
          });
          const matchedFiles = selectedFiles
            .filter((file) => matchTorBoxFile(cachedEntry.files || [], file.path, file.size));
          if (!matchedFiles.length) {
            logger.debug('Toloka candidate skipped', {
              ...requestContext(request),
              topicId: candidate.topicId,
              title: candidate.title,
              reason: 'no_matching_files',
              selectedFiles: selectedFiles.map((file) => file.path).slice(0, 5),
            });
            continue;
          }
          const acceptedReleases = matchedFiles.map((file) => ({
            topicId: candidate.topicId,
            attachmentId: attachment.id,
            infoHash: torrent.infoHash,
            torrentName: torrent.name,
            path: file.path,
            size: file.size,
            releaseTitle: candidate.title || topic.title || torrent.name,
            seeds: candidate.seeds,
            leeches: candidate.leeches,
          }));
          releases.push(...acceptedReleases);
          logger.debug('Toloka candidate accepted', {
            ...requestContext(request),
            topicId: candidate.topicId,
            title: candidate.title,
            infoHash: torrent.infoHash,
            releaseCount: acceptedReleases.length,
            files: acceptedReleases.map((release) => release.path).slice(0, 5),
          });
        } catch (error) {
          degraded = degraded || isDegradedDiscoveryError(error);
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
      const response = degraded && !releases.length
        ? markDegraded(releases)
        : releases;
      if (!(degraded && !releases.length)) {
        searchCache.set(cacheKey, response, ttl);
      }
      logger.debug('Discovery completed', {
        ...requestContext(request),
        releaseCount: releases.length,
        topicFetches,
        torrentDownloads,
        degraded,
        cacheTtlMs: ttl,
      });
      return response;
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
      logger.debug('Alternate title lookup returned no titles', requestContext(request));
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

function requestContext(request) {
  return {
    imdbId: request.imdbId,
    type: request.type,
    ...(request.type === 'series' && {
      season: request.season,
      episode: request.episode,
    }),
  };
}

function summarizeCandidates(candidates) {
  return candidates.slice(0, 5).map((candidate) => ({
    topicId: candidate.topicId,
    title: candidate.title,
    seeds: candidate.seeds,
  }));
}

function isDegradedDiscoveryError(error) {
  return [
    'TolokaAuthenticationError',
    'TolokaRequestError',
    'DependencyError',
  ].includes(error?.name);
}

function markDegraded(releases) {
  Object.defineProperty(releases, 'degraded', {
    value: true,
    enumerable: false,
  });
  return releases;
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

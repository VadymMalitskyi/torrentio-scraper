import { hasExactImdbMatch } from '../clients/toloka.js';
import { matchTorBoxFile, torrentStatus } from '../clients/torbox.js';

export function createPlaybackService({
  config,
  toloka,
  torbox,
  torrentCache,
}) {
  return {
    async resolve(selection, userIp) {
      let torrent = torrentCache.get(selection.infoHash);
      if (!torrent) {
        const topic = await toloka.getTopic(selection.topicId);
        if (!hasExactImdbMatch(topic, selection.imdbId)) {
          throw new PlaybackError('IMDB_MISMATCH');
        }
        const attachment = topic.attachments.find((item) => item.id === selection.attachmentId)
          || toloka.attachmentForId(selection.attachmentId);
        torrent = await toloka.downloadTorrent(attachment);
        if (torrent.infoHash !== selection.infoHash) {
          throw new PlaybackError('TORRENT_HASH_CHANGED');
        }
        torrentCache.set(torrent.infoHash, torrent, config.torrentCacheTtlMs);
      }

      let torboxTorrent = await torbox.ensureCachedTorrent(torrent);
      let status = torrentStatus(torboxTorrent);
      if (status === 'downloading' && torboxTorrent?.id) {
        torboxTorrent = await waitForReadyTorrent(torbox, torboxTorrent.id);
        status = torrentStatus(torboxTorrent);
      }
      if (status === 'uncached') {
        throw new PlaybackError('TORBOX_UNCACHED');
      }
      if (status !== 'ready') {
        throw new PlaybackError('TORBOX_FAILED');
      }

      const file = matchTorBoxFile(torboxTorrent.files || [], selection.path, selection.size);
      if (!file) {
        throw new PlaybackError('FILE_NOT_FOUND');
      }
      const url = await torbox.requestDownloadUrl(torboxTorrent.id, file.id, userIp);
      return { status: 'ready', url };
    },
  };
}

async function waitForReadyTorrent(torbox, torrentId, attempts = 5, delayMs = 1000) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await torbox.list({ id: torrentId, bypassCache: true });
    if (torrentStatus(latest) === 'ready') {
      return latest;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return latest;
}

export class PlaybackError extends Error {
  constructor(code) {
    super('Playback could not be resolved');
    this.name = 'PlaybackError';
    this.code = code;
  }
}

import parseTorrent from 'parse-torrent';

export async function parseTorrentBytes(bytes, {
  contentType,
  maxBytes = 10 * 1024 * 1024,
} = {}) {
  const buffer = Buffer.from(bytes);
  if (!buffer.length || buffer.length > maxBytes) {
    throw new InvalidTorrentError('Torrent metainfo size is invalid');
  }
  if (contentType?.includes('text/html') || looksLikeHtml(buffer)) {
    throw new InvalidTorrentError('Received HTML instead of torrent metainfo');
  }

  let parsed;
  try {
    parsed = await parseTorrent(buffer);
  } catch {
    throw new InvalidTorrentError('Torrent metainfo could not be parsed');
  }

  return {
    bytes: buffer,
    infoHash: parsed.infoHash.toLowerCase(),
    name: parsed.name,
    private: Boolean(parsed.private),
    totalSize: parsed.length,
    trackers: (parsed.announce || []).map(trackerHostname).filter(Boolean),
    files: parsed.files.map((file) => ({
      path: file.path.replaceAll('\\', '/'),
      size: file.length,
    })),
  };
}

function looksLikeHtml(buffer) {
  const prefix = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  return prefix.startsWith('<!doctype html') || prefix.startsWith('<html');
}

function trackerHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

export class InvalidTorrentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidTorrentError';
  }
}

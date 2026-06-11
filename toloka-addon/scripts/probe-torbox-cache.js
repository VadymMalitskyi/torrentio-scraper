import { loadSeedingProbeConfig } from '../src/config.js';
import { TolokaClient } from '../src/clients/toloka.js';
import { TorBoxClient, matchTorBoxFile, torrentStatus } from '../src/clients/torbox.js';
import { createLogger } from '../src/observability/logger.js';

const topicId = requiredPositiveInteger('TOLOKA_TOPIC_ID');
const attachmentId = optionalPositiveInteger('TOLOKA_ATTACHMENT_ID');
const config = loadSeedingProbeConfig();
const logger = createLogger({ level: config.logLevel });
const toloka = new TolokaClient({
  baseUrl: config.tolokaBaseUrl,
  username: config.tolokaUsername,
  password: config.tolokaPassword,
  timeoutMs: config.httpTimeoutMs,
  maxTorrentBytes: config.maxTorrentBytes,
  logger,
});
const torbox = new TorBoxClient({
  baseUrl: config.torboxBaseUrl,
  token: config.torboxApiToken,
  timeoutMs: config.httpTimeoutMs,
});

const topic = await toloka.getTopic(topicId);
const attachment = attachmentId
  ? topic.attachments.find((item) => item.id === attachmentId)
  : topic.attachments[0];
if (!attachment) {
  throw new Error('Requested Toloka torrent attachment was not found');
}
const torrent = await toloka.downloadTorrent(attachment);
console.log(JSON.stringify({
  stage: 'torrent-parsed',
  infoHash: torrent.infoHash,
  name: torrent.name,
  private: torrent.private,
  totalSize: torrent.totalSize,
  fileCount: torrent.files.length,
  trackerHosts: torrent.trackers,
}));

const cachedEntry = await torbox.getCachedEntry(torrent.infoHash);
console.log(JSON.stringify({
  stage: 'torbox-cache',
  cached: Boolean(cachedEntry),
  fileCount: cachedEntry?.files?.length || 0,
}));
if (!cachedEntry) {
  process.exit(0);
}

const item = await torbox.ensureCachedTorrent(torrent);
const status = torrentStatus(item);
console.log(JSON.stringify({
  stage: 'torbox-item',
  id: item?.id,
  status,
  downloadState: item?.download_state,
}));
if (status !== 'ready') {
  throw new Error(`Cached torrent did not become ready: ${item?.download_state || 'uncached'}`);
}

const target = torrent.files
  .filter((file) => /\.(mkv|mp4|avi|webm|m2ts)$/i.test(file.path))
  .sort((a, b) => b.size - a.size)[0];
const file = target && matchTorBoxFile(item.files || [], target.path, target.size);
if (!file) {
  throw new Error('Could not match the cached TorBox file to the Toloka torrent file');
}
const url = await torbox.requestDownloadUrl(item.id, file.id);
console.log(JSON.stringify({
  stage: 'download-link',
  success: true,
  protocol: new URL(url).protocol,
  hostname: new URL(url).hostname,
}));

function requiredPositiveInteger(name) {
  const value = optionalPositiveInteger(name);
  if (!value) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalPositiveInteger(name) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

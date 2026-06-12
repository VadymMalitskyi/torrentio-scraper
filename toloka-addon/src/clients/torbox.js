const READY_STATES = new Set(['uploading', 'completed', 'cached', 'pausedup', 'forcedup', 'stalledup']);
const DOWNLOADING_STATES = new Set([
  'downloading', 'metadl', 'checkingresumedata', 'stalleddl', 'forceddl',
  'queued', 'checkingdl', 'allocating',
]);
const FAILED_STATES = new Set(['error', 'missingfiles', 'unknown']);

export class TorBoxClient {
  #baseUrl;
  #token;
  #timeoutMs;
  #fetch;
  #materializePromises = new Map();

  constructor({ baseUrl, token, timeoutMs = 15000, fetchImpl = fetch }) {
    this.#baseUrl = baseUrl;
    this.#token = token;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImpl;
  }

  async list({ id, bypassCache = false } = {}) {
    const url = new URL(`${this.#baseUrl}/torrents/mylist`);
    url.searchParams.set('bypass_cache', String(bypassCache));
    if (id !== undefined) {
      url.searchParams.set('id', String(id));
    }
    const data = await this.#json(url, {
      headers: this.#headers(),
    });
    return data ?? (id === undefined ? [] : undefined);
  }

  async findByHash(infoHash, { bypassCache = false } = {}) {
    const torrents = await this.list({ bypassCache });
    const normalized = infoHash.toLowerCase();
    return torrents
      .filter((torrent) => torrentMatchesHash(torrent, normalized))
      .sort((a, b) => Number(isFailedState(a.download_state)) - Number(isFailedState(b.download_state)))[0];
  }

  async checkCached(hashes) {
    const url = new URL(`${this.#baseUrl}/torrents/checkcached`);
    url.searchParams.set('format', 'list');
    url.searchParams.set('list_files', 'true');
    const data = await this.#json(url, {
      method: 'POST',
      headers: {
        ...this.#headers(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ hashes }),
    });
    return Array.isArray(data) ? data : [];
  }

  async getCachedEntry(infoHash) {
    const entries = await this.checkCached([infoHash]);
    const normalized = infoHash.toLowerCase();
    return entries.find((entry) => entry.hash?.toLowerCase() === normalized);
  }

  async ensureCachedTorrent(torrent) {
    const existing = await this.findByHash(torrent.infoHash);
    if (existing) {
      return existing;
    }
    if (!this.#materializePromises.has(torrent.infoHash)) {
      this.#materializePromises.set(
        torrent.infoHash,
        this.#createIfCached(torrent).finally(() => this.#materializePromises.delete(torrent.infoHash)),
      );
    }
    return this.#materializePromises.get(torrent.infoHash);
  }

  async requestDownloadUrl(torrentId, fileId, userIp) {
    const url = new URL(`${this.#baseUrl}/torrents/requestdl`);
    url.searchParams.set('token', this.#token);
    url.searchParams.set('torrent_id', String(torrentId));
    url.searchParams.set('file_id', String(fileId));
    url.searchParams.set('redirect', 'false');
    url.searchParams.set('append_name', 'true');
    if (userIp && !isPrivateIp(userIp)) {
      url.searchParams.set('user_ip', userIp);
    }
    const data = await this.#json(url, { headers: this.#headers() });
    if (typeof data !== 'string' || !data.startsWith('https://')) {
      throw new TorBoxError('INVALID_DOWNLOAD_URL');
    }
    return data;
  }

  async #createIfCached(torrent) {
    const form = new FormData();
    form.append('file', new Blob([torrent.bytes], { type: 'application/x-bittorrent' }), `${torrent.infoHash}.torrent`);
    form.append('seed', '3');
    form.append('allow_zip', 'false');
    form.append('add_only_if_cached', 'true');
    const url = `${this.#baseUrl}/torrents/createtorrent`;
    let data;
    try {
      data = await this.#json(url, {
        method: 'POST',
        headers: this.#headers(),
        body: form,
      });
    } catch (error) {
      if (error instanceof TorBoxError && error.code === 'DUPLICATE_ITEM') {
        const duplicate = await this.findByHash(torrent.infoHash, { bypassCache: true });
        if (duplicate) {
          return duplicate;
        }
      }
      if (error instanceof TorBoxError && error.code === 'DOWNLOAD_SERVER_ERROR') {
        return undefined;
      }
      throw error;
    }
    if (data?.torrent_id) {
      return this.list({ id: data.torrent_id, bypassCache: true });
    }
    if (data?.queued_id) {
      return {
        id: data.queued_id,
        hash: torrent.infoHash,
        download_state: 'queued',
        files: [],
      };
    }
    const created = await this.findByHash(torrent.infoHash, { bypassCache: true });
    if (created) {
      return created;
    }
    return undefined;
  }

  async #json(url, options = {}) {
    const response = await this.#fetch(url, {
      ...options,
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new TorBoxError('INVALID_RESPONSE', response.status);
    }
    if (!response.ok || !body?.success) {
      throw new TorBoxError(body?.error || 'REQUEST_FAILED', response.status);
    }
    return body.data;
  }

  #headers() {
    return { authorization: `Bearer ${this.#token}` };
  }
}

export function torrentStatus(torrent) {
  if (!torrent) {
    return 'uncached';
  }
  const state = normalizeState(torrent?.download_state);
  if (torrent?.download_finished && Array.isArray(torrent.files) && torrent.files.length) {
    return 'ready';
  }
  if (READY_STATES.has(state) && Array.isArray(torrent?.files) && torrent.files.length) {
    return 'ready';
  }
  if (FAILED_STATES.has(state)) {
    return 'failed';
  }
  if (DOWNLOADING_STATES.has(state) || torrent?.active) {
    return 'downloading';
  }
  return 'failed';
}

export function matchTorBoxFile(files, expectedPath, expectedSize) {
  const target = normalizePath(expectedPath);
  const normalized = files.map((file) => ({
    file,
    path: normalizePath(file.name || file.absolute_path || file.short_name),
    size: Number(file.size || 0),
  }));
  const exact = normalized.filter((item) => item.path === target && item.size === expectedSize);
  if (exact.length === 1) {
    return exact[0].file;
  }
  const suffix = normalized.filter((item) => (
    item.size === expectedSize
    && (item.path.endsWith(`/${target}`) || target.endsWith(`/${item.path}`))
  ));
  if (suffix.length === 1) {
    return suffix[0].file;
  }
  const basename = target.split('/').pop();
  const fallback = normalized.filter((item) => (
    item.size === expectedSize && item.path.split('/').pop() === basename
  ));
  return fallback.length === 1 ? fallback[0].file : undefined;
}

function torrentMatchesHash(torrent, hash) {
  return torrent?.hash?.toLowerCase() === hash
    || torrent?.alternative_hashes?.some((alternative) => alternative.toLowerCase() === hash);
}

function normalizeState(value) {
  return String(value || '').toLowerCase().replaceAll(' ', '');
}

function isFailedState(value) {
  return FAILED_STATES.has(normalizeState(value));
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function isPrivateIp(ip) {
  return /^(?:::ffff:)?(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)|^::1$/.test(ip);
}

export class TorBoxError extends Error {
  constructor(code, status) {
    super('TorBox request failed');
    this.name = 'TorBoxError';
    this.code = code;
    this.status = status;
  }
}

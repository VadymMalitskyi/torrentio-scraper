import * as cheerio from 'cheerio';
import { CookieHttpClient } from './http.js';
import { parseTorrentBytes } from '../domain/torrent.js';

const TOPIC_ID = /(?:viewtopic\.php\?[^#]*\bt=|(?:^|\/)t)(\d+)/i;
const ATTACHMENT_ID = /(?:dl|download)\.php\?[^#]*\bid=(\d+)/i;
const IMDB_ID = /\btt\d{5,10}\b/gi;

export class TolokaClient {
  #baseUrl;
  #username;
  #password;
  #http;
  #logger;
  #loginPromise;
  #authenticated = false;
  #maxTorrentBytes;

  constructor({
    baseUrl,
    username,
    password,
    timeoutMs,
    maxTorrentBytes,
    logger,
    http = new CookieHttpClient({ timeoutMs }),
  }) {
    this.#baseUrl = baseUrl;
    this.#username = username;
    this.#password = password;
    this.#http = http;
    this.#logger = logger;
    this.#maxTorrentBytes = maxTorrentBytes;
  }

  async login() {
    if (this.#authenticated) {
      return;
    }
    if (!this.#loginPromise) {
      this.#loginPromise = this.#performLogin().finally(() => {
        this.#loginPromise = undefined;
      });
    }
    return this.#loginPromise;
  }

  async search(query) {
    const url = new URL('/tracker.php', this.#baseUrl);
    url.searchParams.set('nm', query);
    const response = await this.#authenticatedRequest(url);
    return parseSearchResults(await response.text(), this.#baseUrl);
  }

  async getTopic(topicUrlOrId) {
    const url = typeof topicUrlOrId === 'number'
      ? new URL(`/t${topicUrlOrId}`, this.#baseUrl)
      : new URL(topicUrlOrId, this.#baseUrl);
    const response = await this.#authenticatedRequest(url);
    return parseTopicPage(await response.text(), url.href);
  }

  attachmentForId(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new TolokaParseError('Torrent attachment ID is invalid');
    }
    return {
      id,
      url: new URL(`/dl.php?id=${id}`, this.#baseUrl).href,
    };
  }

  async downloadTorrent(topicOrAttachment, expectedAttachmentId) {
    let attachment = topicOrAttachment;
    if (typeof topicOrAttachment === 'number' || typeof topicOrAttachment === 'string') {
      const topic = await this.getTopic(topicOrAttachment);
      attachment = expectedAttachmentId
        ? topic.attachments.find((item) => item.id === expectedAttachmentId)
        : topic.attachments[0];
    }
    if (!attachment?.url) {
      throw new TolokaParseError('Torrent attachment was not found');
    }

    const response = await this.#authenticatedRequest(attachment.url);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > this.#maxTorrentBytes) {
      throw new TolokaParseError('Torrent attachment is too large');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return parseTorrentBytes(bytes, {
      contentType: response.headers.get('content-type'),
      maxBytes: this.#maxTorrentBytes,
    });
  }

  async #performLogin() {
    await this.#http.request(new URL('/login.php', this.#baseUrl));
    const form = new URLSearchParams({
      username: this.#username,
      password: this.#password,
      autologin: 'on',
      ssl: 'on',
      redirect: '',
      login: 'Вхід',
    });
    const response = await this.#http.request(new URL('/login.php', this.#baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const html = await response.text();
    if (!response.ok || isFailedLoginPage(html)) {
      this.#authenticated = false;
      throw new TolokaAuthenticationError();
    }
    const homeResponse = await this.#http.request(new URL('/', this.#baseUrl));
    const homeHtml = await homeResponse.text();
    if (!homeResponse.ok || !isAuthenticatedPage(homeHtml)) {
      this.#authenticated = false;
      throw new TolokaAuthenticationError();
    }
    this.#authenticated = true;
    this.#logger.info('Toloka login succeeded');
  }

  async #authenticatedRequest(url, options) {
    await this.login();
    for (const delayMs of [0, 750, 2000]) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      let response = await this.#http.request(url, options);
      if (await responseIsLoginPage(response)) {
        this.#authenticated = false;
        await this.login();
        response = await this.#http.request(url, options);
        if (await responseIsLoginPage(response)) {
          throw new TolokaAuthenticationError();
        }
      }
      if (response.ok) {
        return response;
      }
      if (!shouldRetry(response.status)) {
        throw new TolokaRequestError(response.status);
      }
    }
    throw new TolokaRequestError(429);
  }
}

export function parseSearchResults(html, baseUrl = 'https://toloka.to') {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();
  $('td.topictitle a, a.topictitle, a[href*="viewtopic.php"], a[href^="/t"], a[href^="t"]').each((_, element) => {
    const href = $(element).attr('href');
    const topicId = extractId(href, TOPIC_ID);
    if (!topicId || seen.has(topicId)) {
      return;
    }
    const row = $(element).closest('tr');
    const attachment = row.find('a[href*="dl.php?id="], a[href*="download.php?id="]').first();
    const cells = row.find('td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
    candidates.push({
      topicId,
      url: new URL(href, baseUrl).href,
      title: $(element).text().replace(/\s+/g, ' ').trim(),
      attachmentId: extractId(attachment.attr('href'), ATTACHMENT_ID),
      attachmentUrl: attachment.attr('href')
        ? new URL(attachment.attr('href'), baseUrl).href
        : undefined,
      seeds: extractMetric(row, ['seed', 'seeder', 'розда']),
      leeches: extractMetric(row, ['leech', 'leecher', 'завантаж']),
      cells,
    });
    seen.add(topicId);
  });
  return candidates;
}

export function parseTopicPage(html, pageUrl = 'https://toloka.to/') {
  const $ = cheerio.load(html);
  const imdbIds = new Set();
  const attachments = new Map();
  $('a').each((_, element) => {
    const href = $(element).attr('href') || '';
    for (const imdbId of href.match(IMDB_ID) || []) {
      imdbIds.add(imdbId.toLowerCase());
    }
    const attachmentId = extractId(href, ATTACHMENT_ID);
    if (attachmentId) {
      attachments.set(attachmentId, {
        id: attachmentId,
        url: new URL(href, pageUrl).href,
        label: $(element).text().replace(/\s+/g, ' ').trim(),
      });
    }
  });
  for (const imdbId of $.root().text().match(IMDB_ID) || []) {
    imdbIds.add(imdbId.toLowerCase());
  }
  const topicId = extractId(pageUrl, TOPIC_ID);
  return {
    topicId,
    title: $('h1').first().text().trim()
      || $('a.maintitle').first().text().trim()
      || $('title').text().trim(),
    imdbIds: [...imdbIds],
    attachments: [...attachments.values()],
  };
}

export function hasExactImdbMatch(topic, imdbId) {
  return topic.imdbIds.includes(imdbId.toLowerCase());
}

function extractMetric(row, tokens) {
  for (const token of tokens) {
    const cell = row.find(`[class*="${token}" i], [title*="${token}" i]`).first();
    const match = cell.text().match(/\d+/);
    if (match) {
      return Number(match[0]);
    }
  }
  return undefined;
}

function extractId(value, pattern) {
  const match = String(value || '').match(pattern);
  return match ? Number(match[1]) : undefined;
}

function shouldRetry(status) {
  return [429, 502, 503, 504].includes(status);
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isLoginForm(html) {
  return /<form[^>]+(?:name|action)=["'][^"']*login/i.test(html)
    && /name=["']password["']/i.test(html);
}

function isAuthenticatedPage(html) {
  return /login\.php\?[^"']*logout=true/i.test(html)
    || /name=["']logout["']/i.test(html);
}

function isFailedLoginPage(html) {
  return /Такий псевдонім не існує, або не збігається пароль/i.test(html)
    || /Спробувати ще раз/i.test(html);
}

async function responseIsLoginPage(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return false;
  }
  const html = await response.clone().text();
  return isLoginForm(html);
}

export class TolokaAuthenticationError extends Error {
  constructor() {
    super('Toloka authentication failed');
    this.name = 'TolokaAuthenticationError';
  }
}

export class TolokaRequestError extends Error {
  constructor(status) {
    super('Toloka request failed');
    this.name = 'TolokaRequestError';
    this.status = status;
  }
}

export class TolokaParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TolokaParseError';
  }
}

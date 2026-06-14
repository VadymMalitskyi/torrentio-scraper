export class WikidataClient {
  #baseUrl;
  #timeoutMs;

  constructor({ baseUrl = 'https://www.wikidata.org/w/api.php', timeoutMs = 15000 } = {}) {
    this.#baseUrl = baseUrl;
    this.#timeoutMs = timeoutMs;
  }

  async getTitlesByImdbId(imdbId) {
    const entityId = await this.#findEntityId(imdbId);
    if (!entityId) {
      return [];
    }

    const url = new URL(this.#baseUrl);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', entityId);
    url.searchParams.set('props', 'labels|aliases|claims');
    url.searchParams.set('languages', 'en|uk');
    url.searchParams.set('format', 'json');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new DependencyError('Wikidata', response.status);
    }

    const body = await response.json();
    const entity = body?.entities?.[entityId];
    if (!entity || !hasMatchingImdbId(entity.claims, imdbId)) {
      return [];
    }

    const titles = [
      ...Object.values(entity.labels || {}).map((label) => label?.value),
      ...Object.values(entity.aliases || {}).flatMap((entries) => entries.map((entry) => entry?.value)),
    ]
      .map(normalizeTitle)
      .filter(Boolean);

    return [...new Set(titles)];
  }

  async #findEntityId(imdbId) {
    const url = new URL(this.#baseUrl);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', imdbId);
    url.searchParams.set('format', 'json');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new DependencyError('Wikidata', response.status);
    }

    const body = await response.json();
    const result = body?.query?.search?.find((entry) => /^Q\d+$/.test(entry?.title || ''));
    return result?.title;
  }
}

function hasMatchingImdbId(claims, imdbId) {
  return (claims?.P345 || []).some((claim) => (
    String(claim?.mainsnak?.datavalue?.value || '').toLowerCase() === imdbId.toLowerCase()
  ));
}

function normalizeTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class DependencyError extends Error {
  constructor(service, status) {
    super(`${service} request failed`);
    this.name = 'DependencyError';
    this.service = service;
    this.status = status;
  }
}

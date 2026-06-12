export class CinemetaClient {
  constructor({ baseUrl, timeoutMs = 15000 }) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async getMeta(type, imdbId) {
    const response = await fetch(`${this.baseUrl}/meta/${type}/${imdbId}.json`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new DependencyError('Cinemeta', response.status);
    }
    const body = await response.json();
    if (!body?.meta?.id) {
      throw new DependencyError('Cinemeta', 502);
    }
    return body.meta;
  }
}

export class DependencyError extends Error {
  constructor(service, status) {
    super(`${service} request failed`);
    this.name = 'DependencyError';
    this.service = service;
    this.status = status;
  }
}

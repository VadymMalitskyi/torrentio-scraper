import { CookieJar } from 'tough-cookie';

export class CookieHttpClient {
  #jar;
  #timeoutMs;
  #userAgent;

  constructor({
    jar = new CookieJar(),
    timeoutMs = 15000,
    userAgent = 'TolokaStremioAddon/0.1 (+personal-use)',
  } = {}) {
    this.#jar = jar;
    this.#timeoutMs = timeoutMs;
    this.#userAgent = userAgent;
  }

  async request(url, options = {}) {
    return this.#requestWithRedirects(new URL(url), options, 0);
  }

  async cookieCount(url) {
    return (await this.#jar.getCookies(url)).length;
  }

  async #requestWithRedirects(url, options, redirectCount) {
    if (redirectCount > 5) {
      throw new Error('Too many redirects');
    }
    const headers = new Headers(options.headers);
    headers.set('user-agent', this.#userAgent);
    const cookie = await this.#jar.getCookieString(url.href);
    if (cookie) {
      headers.set('cookie', cookie);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
      signal: options.signal || AbortSignal.timeout(this.#timeoutMs),
    });
    for (const setCookie of response.headers.getSetCookie()) {
      await this.#jar.setCookie(setCookie, url.href);
    }

    if (isRedirect(response.status) && response.headers.has('location')) {
      const nextUrl = new URL(response.headers.get('location'), url);
      const switchToGet = response.status === 303
        || ((response.status === 301 || response.status === 302)
          && String(options.method || 'GET').toUpperCase() === 'POST');
      return this.#requestWithRedirects(nextUrl, {
        ...options,
        method: switchToGet ? 'GET' : options.method,
        body: switchToGet ? undefined : options.body,
      }, redirectCount + 1);
    }
    return response;
  }
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

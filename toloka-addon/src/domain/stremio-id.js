const MOVIE_ID = /^(tt\d+)$/i;
const SERIES_ID = /^(tt\d+):(\d+):(\d+)$/i;

export function parseStremioId(type, id) {
  if (type === 'movie') {
    const match = id.match(MOVIE_ID);
    if (!match) {
      throw new InvalidStremioIdError();
    }
    return { type, imdbId: match[1].toLowerCase() };
  }

  if (type === 'series') {
    const match = id.match(SERIES_ID);
    if (!match) {
      throw new InvalidStremioIdError();
    }
    return {
      type,
      imdbId: match[1].toLowerCase(),
      season: Number(match[2]),
      episode: Number(match[3]),
    };
  }

  throw new InvalidStremioIdError();
}

export class InvalidStremioIdError extends Error {
  constructor() {
    super('Unsupported Stremio ID');
    this.name = 'InvalidStremioIdError';
  }
}

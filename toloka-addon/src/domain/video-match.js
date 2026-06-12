import path from 'node:path';

const VIDEO_EXTENSIONS = new Set([
  '.3g2', '.3gp', '.avi', '.flv', '.m2ts', '.m4v', '.mkv', '.mk3d', '.mov',
  '.mp2', '.mp4', '.mpe', '.mpeg', '.mpg', '.mpv', '.mts', '.ogm', '.ts',
  '.webm', '.wmv',
]);
const EXCLUDED = /\b(sample|trailer|teaser|extra|extras|featurette|bonus)\b/i;

export function selectVideoFiles(files, request, { minVideoBytes = 100 * 1024 * 1024 } = {}) {
  const videos = files
    .map(normalizeFile)
    .filter((file) => VIDEO_EXTENSIONS.has(path.extname(file.path).toLowerCase()))
    .filter((file) => file.size >= minVideoBytes)
    .filter((file) => !EXCLUDED.test(file.path));

  if (request.type === 'movie') {
    return videos.sort((a, b) => b.size - a.size).slice(0, 1);
  }

  return videos.filter((file) => matchesEpisode(file.path, request.season, request.episode));
}

export function matchesEpisode(filename, season, episode) {
  const normalized = filename.replace(/[._-]+/g, ' ');
  const patterns = [
    new RegExp(`(?:^|\\D)s0*${season}e0*${episode}(?:\\D|$)`, 'i'),
    new RegExp(`(?:^|\\D)0*${season}x0*${episode}(?:\\D|$)`, 'i'),
  ];
  if (patterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const multiEpisode = new RegExp(
    `(?:^|\\D)s0*${season}e0*(\\d+)(?:\\s*(?:e|-|to)\\s*0*(\\d+))+(?:\\D|$)`,
    'i',
  );
  const range = normalized.match(multiEpisode);
  if (range) {
    const first = Number(range[1]);
    const last = Number(range[2]);
    return episode >= Math.min(first, last) && episode <= Math.max(first, last);
  }

  const seasonDirectory = new RegExp(`(?:^|[/\\\\])(?:season|сезон)\\s*0*${season}(?:[/\\\\])`, 'i');
  const episodeToken = new RegExp(`(?:^|\\D)(?:e|ep|episode|серія)?\\s*0*${episode}(?:\\D|$)`, 'i');
  return seasonDirectory.test(filename) && episodeToken.test(path.basename(normalized));
}

function normalizeFile(file) {
  return {
    path: String(file.path || file.name || '').replaceAll('\\', '/').replace(/^\/+/, ''),
    size: Number(file.size || file.length || 0),
  };
}

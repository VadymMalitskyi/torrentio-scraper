export function buildSearchQueries(meta, request = { type: 'movie' }) {
  const context = buildTitleContext(meta);

  if (request.type === 'series') {
    return buildSeriesQueries(context.titles, request.season, request.episode, context.year);
  }

  const queries = [];
  for (const title of context.titles.slice(0, 6)) {
    if (context.year) {
      queries.push(`${title} ${context.year}`);
    }
  }
  queries.push(...context.titles.slice(0, 4));
  return [...new Set(queries)];
}

export function narrowTolokaCandidates(
  candidates,
  request,
  meta = {},
  { fallbackCount = 2, limit = candidates.length } = {},
) {
  const context = buildTitleContext(meta);
  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    score: scoreCandidateTitle(candidate.title, request, context),
    seeds: Number(candidate.seeds || 0),
  }));

  scored.sort((left, right) => (
    right.score - left.score
    || right.seeds - left.seeds
    || left.index - right.index
  ));

  if (request.type !== 'series') {
    return scored.slice(0, limit).map((item) => item.candidate);
  }

  const strong = scored.filter((item) => item.score > 0);
  if (!strong.length) {
    return scored.slice(0, limit).map((item) => item.candidate);
  }

  const fallback = scored.filter((item) => item.score <= 0).slice(0, fallbackCount);
  return [...strong, ...fallback].slice(0, limit).map((item) => item.candidate);
}

function normalizeYear(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match?.[0];
}

function buildTitleContext(meta = {}) {
  const titles = [
    meta.name,
    meta.originalName,
    meta.originalTitle,
    ...(Array.isArray(meta.aliases) ? meta.aliases : []),
  ]
    .flatMap((title) => titleVariants(title))
    .filter(Boolean);

  const uniqueTitles = [];
  const seen = new Set();
  for (const title of titles) {
    const key = title.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTitles.push(title);
    }
  }

  return {
    titles: uniqueTitles,
    normalizedTitles: uniqueTitles.map((title) => normalizeCandidateTitle(title)).filter(Boolean),
    year: normalizeYear(meta.releaseInfo || meta.year || meta.released),
  };
}

function buildSeriesQueries(titles, season, episode, year) {
  const queries = [];
  for (const title of titles.slice(0, 4)) {
    if (season) {
      queries.push(`${title} Season ${season}`);
    }
    if (year) {
      queries.push(`${title} ${year}`);
    }
    queries.push(title);
  }
  return [...new Set(queries)];
}

function titleVariants(title) {
  const base = normalizeTitle(title);
  if (!base) {
    return [];
  }

  const variants = [base];
  const withoutBracketed = normalizeTitle(base.replace(/\s*[\[(].*?[\])]\s*/g, ' '));
  if (withoutBracketed && withoutBracketed !== base) {
    variants.push(withoutBracketed);
  }

  const withoutPunctuation = normalizeTitle(base.replace(/[:\-–—/\\.,!?]+/g, ' '));
  if (withoutPunctuation && withoutPunctuation !== base) {
    variants.push(withoutPunctuation);
  }

  const withoutSequelMarker = normalizeTitle(
    base.replace(/\b(?:\d+|[IVX]+)\s*[:\-–—]\s*/gi, ' '),
  );
  if (withoutSequelMarker && !variants.includes(withoutSequelMarker)) {
    variants.push(withoutSequelMarker);
  }

  const subtitle = extractSubtitle(base);
  if (subtitle && !variants.includes(subtitle)) {
    variants.push(subtitle);
  }

  return variants;
}

function extractSubtitle(title) {
  const match = title.match(/[(:\-–—]\s*([^()\[\]]{3,})$/);
  return normalizeTitle(match?.[1]);
}

function normalizeTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreSeriesCandidateTitle(title, season, episode) {
  const normalized = normalizeCandidateTitle(title);
  let score = 0;

  if (hasExplicitEpisodeMatch(normalized, season, episode)) {
    score += 120;
  }
  if (hasSeasonMatch(normalized, season)) {
    score += 30;
  }
  if (hasRequestedSeasonRange(normalized, season)) {
    score += 15;
  }
  if (hasMultiSeasonPack(normalized)) {
    score -= 20;
  }
  if (mentionsDifferentSeason(normalized, season)) {
    score -= 15;
  }
  return score;
}

function scoreCandidateTitle(title, request, context) {
  let score = scoreTitleMatch(title, context.normalizedTitles);
  score += scoreYearMatch(title, context.year);
  if (request.type === 'series') {
    score += scoreSeriesCandidateTitle(title, request.season, request.episode);
  }
  return score;
}

function normalizeCandidateTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTitleMatch(title, normalizedTitles) {
  const normalizedCandidate = normalizeCandidateTitle(title);
  let best = 0;

  for (const normalizedTitle of normalizedTitles) {
    if (!normalizedTitle) {
      continue;
    }
    if (normalizedCandidate === normalizedTitle) {
      best = Math.max(best, 80);
      continue;
    }
    if (containsWholePhrase(normalizedCandidate, normalizedTitle)) {
      best = Math.max(best, 60);
      continue;
    }

    const tokens = significantTokens(normalizedTitle);
    if (!tokens.length) {
      continue;
    }
    const matched = tokens.filter((token) => containsWholePhrase(normalizedCandidate, token)).length;
    if (matched === tokens.length) {
      best = Math.max(best, 45 + tokens.length * 5);
    } else if (matched >= Math.ceil(tokens.length * 0.6)) {
      best = Math.max(best, 20 + matched * 5);
    }
  }

  return best;
}

function scoreYearMatch(title, year) {
  if (!year) {
    return 0;
  }
  const candidateYear = normalizeYear(title);
  if (!candidateYear) {
    return 0;
  }
  return candidateYear === year ? 15 : -10;
}

function significantTokens(title) {
  return title.split(' ').filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function containsWholePhrase(text, phrase) {
  return new RegExp(`(?:^|\\b)${escapeRegExp(phrase)}(?:\\b|$)`, 'i').test(text);
}

function hasExplicitEpisodeMatch(title, season, episode) {
  const patterns = [
    new RegExp(`(?:^|\\D)s0*${season}\\s*e0*${episode}(?:\\D|$)`, 'i'),
    new RegExp(`(?:^|\\D)0*${season}\\s*x\\s*0*${episode}(?:\\D|$)`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(title));
}

function hasSeasonMatch(title, season) {
  const patterns = [
    new RegExp(`(?:^|\\D)s(?:eason)?\\s*0*${season}(?:\\D|$)`, 'i'),
    new RegExp(`(?:^|\\D)season\\s*0*${season}(?:\\D|$)`, 'i'),
    new RegExp(`(?:^|\\D)seasons\\s*0*${season}(?:\\D|$)`, 'i'),
    new RegExp(`(?:^|\\D)сезон\\s*0*${season}(?:\\D|$)`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(title));
}

function hasRequestedSeasonRange(title, season) {
  return extractSeasonRanges(title).some(([start, end]) => season >= start && season <= end);
}

function hasMultiSeasonPack(title) {
  return extractSeasonRanges(title).some(([start, end]) => end > start);
}

function mentionsDifferentSeason(title, season) {
  const seasons = extractMentionedSeasons(title);
  return seasons.length > 0 && !seasons.includes(season) && !hasRequestedSeasonRange(title, season);
}

function extractMentionedSeasons(title) {
  const values = new Set();
  const patterns = [
    /\bs(?:eason)?\s*0*(\d{1,2})(?:\b|e)/gi,
    /\bseasons?\s*0*(\d{1,2})\b/gi,
    /\bсезон\s*0*(\d{1,2})\b/gi,
    /\b(\d{1,2})x\d{1,2}\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of title.matchAll(pattern)) {
      values.add(Number(match[1]));
    }
  }
  return [...values];
}

function extractSeasonRanges(title) {
  const ranges = [];
  const patterns = [
    /\bseasons?\s*0*(\d{1,2})\s*[-–—]\s*0*(\d{1,2})\b/gi,
    /\bсезон(?:и)?\s*0*(\d{1,2})\s*[-–—]\s*0*(\d{1,2})\b/gi,
    /\bs(?:eason)?\s*0*(\d{1,2})\s*[-–—]\s*0*(\d{1,2})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of title.matchAll(pattern)) {
      ranges.push([Number(match[1]), Number(match[2])]);
    }
  }
  return ranges;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

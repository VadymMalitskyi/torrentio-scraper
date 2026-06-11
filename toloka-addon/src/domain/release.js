export function buildSearchQueries(meta) {
  const year = normalizeYear(meta.releaseInfo || meta.year || meta.released);
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
  const queries = [];
  for (const title of uniqueTitles.slice(0, 6)) {
    if (year) {
      queries.push(`${title} ${year}`);
    }
  }
  queries.push(...uniqueTitles.slice(0, 2));
  return [...new Set(queries)];
}

function normalizeYear(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match?.[0];
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

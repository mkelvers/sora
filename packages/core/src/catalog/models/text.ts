/** Normalizers for AniList's text and date formats. */

/**
 * Removes AniList's HTML markup and trailing source attributions.
 *
 * AniList synopses may contain `<br>`, `<i>`, and HTML entities even with
 * `asHtml: false`, and often end with `(Source: Crunchyroll)`.
 */
export function plainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rsquo|lsquo|rdquo|ldquo);/gi, decodeEntity)
    .replace(/\n*[([]\s*(?:source|written by)\s*:[^)\]]*[)\]]\s*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“"
};

function decodeEntity(entity: string, body: string) {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
  }

  if (body.startsWith("#")) {
    return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
  }

  return namedEntities[body.toLowerCase()] ?? entity;
}

/** Formats an AniList fuzzy date as the most precise ISO 8601 prefix available. */
export function fuzzyDate(date: {
  year: number | null;
  month: number | null;
  day: number | null;
}) {
  if (!date.year) {
    return null;
  }

  const year = String(date.year).padStart(4, "0");
  if (!date.month) {
    return year;
  }

  const month = `${year}-${String(date.month).padStart(2, "0")}`;
  return date.day ? `${month}-${String(date.day).padStart(2, "0")}` : month;
}

export function fromUnixSeconds(seconds: number) {
  return new Date(seconds * 1_000).toISOString();
}

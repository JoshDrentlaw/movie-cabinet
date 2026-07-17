/**
 * Deterministic ("idempotent") IDs for movies and booklets.
 *
 * The same title + year + format always produces the same ID, no matter
 * when or how many times it is entered. That means:
 *  - re-adding a movie never creates a duplicate row
 *  - a printed QR label stays valid forever, even if the database is rebuilt
 */

/** Normalize free text so trivial differences don't change the ID. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    // strip diacritics (é -> e)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // treat any punctuation/whitespace run as a single space
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function shortHash(input: string, length: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Movie ID: "m" + 12 hex chars derived from normalized title|year|format.
 * Format is part of the identity because a DVD and a Blu-ray of the same
 * film are two different physical items with two different locations.
 */
export async function movieId(
  title: string,
  year?: number | string | null,
  format?: string | null,
): Promise<string> {
  const key = [
    normalizeText(title),
    year ? String(year).trim() : "",
    format ? normalizeText(format) : "",
  ].join("|");
  return "m" + (await shortHash(key, 12));
}

/** Booklet ID: "b" + 10 hex chars derived from the normalized booklet name. */
export async function bookletId(name: string): Promise<string> {
  return "b" + (await shortHash(normalizeText(name), 10));
}

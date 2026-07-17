/**
 * TMDB (The Movie Database) integration — free API, get a key at
 * https://www.themoviedb.org/settings/api and set TMDB_API_KEY.
 * Everything degrades gracefully to manual entry when no key is set.
 */

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";

export interface SearchResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
}

export interface MovieDetails {
  tmdb_id: number;
  title: string;
  year: number | null;
  genres: string[];
  runtime: number | null;
  overview: string | null;
  poster_url: string | null;
  director: string | null;
}

export function tmdbKey(): string | undefined {
  return Deno.env.get("TMDB_API_KEY") || undefined;
}

async function tmdbFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const key = tmdbKey();
  if (!key) throw new Error("TMDB_API_KEY is not set");
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // v4 keys are long JWTs sent as a bearer token; v3 keys go in the query string
  const headers: HeadersInit = {};
  if (key.length > 40) headers["Authorization"] = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function searchMovies(query: string): Promise<SearchResult[]> {
  const data = (await tmdbFetch("/search/movie", { query, include_adult: "false" })) as {
    results: {
      id: number;
      title: string;
      release_date?: string;
      overview?: string;
      poster_path?: string | null;
    }[];
  };
  return data.results.slice(0, 10).map((r) => ({
    tmdb_id: r.id,
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    overview: r.overview ?? "",
    poster_url: r.poster_path ? IMG + r.poster_path : null,
  }));
}

export async function movieDetails(tmdbId: number): Promise<MovieDetails> {
  const d = (await tmdbFetch(`/movie/${tmdbId}`, { append_to_response: "credits" })) as {
    id: number;
    title: string;
    release_date?: string;
    genres?: { name: string }[];
    runtime?: number | null;
    overview?: string | null;
    poster_path?: string | null;
    credits?: { crew?: { job: string; name: string }[] };
  };
  return {
    tmdb_id: d.id,
    title: d.title,
    year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    genres: (d.genres ?? []).map((g) => g.name),
    runtime: d.runtime ?? null,
    overview: d.overview ?? null,
    poster_url: d.poster_path ? IMG + d.poster_path : null,
    director: d.credits?.crew?.find((c) => c.job === "Director")?.name ?? null,
  };
}

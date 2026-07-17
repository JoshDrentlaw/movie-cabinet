import { DatabaseSync } from "node:sqlite";

export interface Movie {
  id: string;
  title: string;
  year: number | null;
  format: string;
  genre: string;
  genres: string[];
  director: string | null;
  runtime: number | null;
  overview: string | null;
  poster_url: string | null;
  tmdb_id: number | null;
  booklet_id: string | null;
  slot: number | null;
  created_at: string;
  updated_at: string;
}

export interface Booklet {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export type MovieInput = Omit<Movie, "created_at" | "updated_at" | "booklet_id" | "slot"> & {
  booklet_id?: string | null;
  slot?: number | null;
};

export class Catalog {
  db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS booklets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER,
        format TEXT NOT NULL DEFAULT 'DVD',
        genre TEXT NOT NULL DEFAULT 'Uncategorized',
        genres TEXT NOT NULL DEFAULT '[]',
        director TEXT,
        runtime INTEGER,
        overview TEXT,
        poster_url TEXT,
        tmdb_id INTEGER,
        booklet_id TEXT REFERENCES booklets(id) ON DELETE SET NULL,
        slot INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_movies_genre ON movies(genre);
      CREATE INDEX IF NOT EXISTS idx_movies_booklet ON movies(booklet_id);
    `);
  }

  private rowToMovie(row: Record<string, unknown>): Movie {
    return { ...row, genres: JSON.parse((row.genres as string) ?? "[]") } as Movie;
  }

  /** Insert or update by deterministic ID — re-adding a movie is a no-op update. */
  upsertMovie(m: MovieInput): Movie {
    this.db
      .prepare(`
        INSERT INTO movies (id, title, year, format, genre, genres, director, runtime,
                            overview, poster_url, tmdb_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, year = excluded.year, format = excluded.format,
          genre = excluded.genre, genres = excluded.genres, director = excluded.director,
          runtime = excluded.runtime, overview = excluded.overview,
          poster_url = excluded.poster_url, tmdb_id = excluded.tmdb_id,
          updated_at = datetime('now')
      `)
      .run(
        m.id,
        m.title,
        m.year,
        m.format,
        m.genre || "Uncategorized",
        JSON.stringify(m.genres ?? []),
        m.director,
        m.runtime,
        m.overview,
        m.poster_url,
        m.tmdb_id,
      );
    return this.getMovie(m.id)!;
  }

  getMovie(id: string): Movie | null {
    const row = this.db.prepare("SELECT * FROM movies WHERE id = ?").get(id);
    return row ? this.rowToMovie(row as Record<string, unknown>) : null;
  }

  listMovies(filter?: { genre?: string; booklet_id?: string; ids?: string[] }): Movie[] {
    let sql = "SELECT * FROM movies";
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter?.genre) {
      where.push("genre = ?");
      params.push(filter.genre);
    }
    if (filter?.booklet_id) {
      where.push("booklet_id = ?");
      params.push(filter.booklet_id);
    }
    if (filter?.ids?.length) {
      where.push(`id IN (${filter.ids.map(() => "?").join(",")})`);
      params.push(...filter.ids);
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToMovie(r));
  }

  countMovies(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM movies").get() as { n: number }).n;
  }

  setLocation(movieId: string, bookletId: string | null, slot: number | null): void {
    this.db
      .prepare(
        "UPDATE movies SET booklet_id = ?, slot = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(bookletId, slot, movieId);
  }

  deleteMovie(id: string): void {
    this.db.prepare("DELETE FROM movies WHERE id = ?").run(id);
  }

  upsertBooklet(b: { id: string; name: string; description?: string | null }): Booklet {
    this.db
      .prepare(`
        INSERT INTO booklets (id, name, description) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
      `)
      .run(b.id, b.name, b.description ?? null);
    return this.getBooklet(b.id)!;
  }

  getBooklet(id: string): Booklet | null {
    const row = this.db.prepare("SELECT * FROM booklets WHERE id = ?").get(id);
    return row ? (row as unknown as Booklet) : null;
  }

  listBooklets(): (Booklet & { movie_count: number })[] {
    return this.db
      .prepare(`
        SELECT b.*, COUNT(m.id) AS movie_count
        FROM booklets b LEFT JOIN movies m ON m.booklet_id = b.id
        GROUP BY b.id ORDER BY b.name COLLATE NOCASE
      `)
      .all() as unknown as (Booklet & { movie_count: number })[];
  }

  deleteBooklet(id: string): void {
    this.db.prepare("UPDATE movies SET booklet_id = NULL, slot = NULL WHERE booklet_id = ?").run(
      id,
    );
    this.db.prepare("DELETE FROM booklets WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}

/** Catalog-style sort key: ignores leading "The", "A", "An". */
export function sortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

/** Group movies by primary genre, each group sorted alphabetically (article-insensitive). */
export function groupByGenre(movies: Movie[]): Map<string, Movie[]> {
  const groups = new Map<string, Movie[]>();
  for (const m of movies) {
    const g = m.genre || "Uncategorized";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title)));
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

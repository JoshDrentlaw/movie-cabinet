# 🎬 Movie Cabinet

App for cataloging a physical movie collection that moved from a big cabinet into
sleeved booklets. Movies are grouped by genre and sorted alphabetically (ignoring
"The"/"A"/"An"), every movie gets a permanent ID and a printable QR label, and every
booklet gets a QR cover label — scan either one with a phone to see where a movie
lives or what a booklet contains.

## Features

- **Add movies fast** — with a free [TMDB](https://www.themoviedb.org) API key, type a
  title and pick a match: genre, year, director, runtime, poster and synopsis fill in
  automatically. Manual entry works without a key.
- **Browse by genre, alphabetically** — the classic catalog view, with a live filter box.
- **Idempotent IDs** — a movie's ID is derived from its normalized title + year + format
  (`m` + 12 hex chars). Entering the same movie twice never duplicates it, and a printed
  QR label stays valid forever — even if the database is rebuilt from scratch. A DVD and
  a Blu-ray of the same film are distinct items (different IDs), since they live in
  different sleeves.
- **Booklets & slots** — create one entry per physical booklet, assign each movie a
  booklet and slot number.
- **QR labels** — print label sheets for movie sleeves and booklet covers.
  Scanning a movie's QR shows "📖 Westerns A–L, slot 7"; scanning a booklet's QR lists
  everything filed inside it.
- **Simple family login** — set `AUTH_PASSWORD` and the app requires one shared
  password. Signing in sets a year-long cookie, so each device only asks once —
  after that, scanning a QR goes straight to the movie. Leave it unset for
  passwordless local use.

## Running it

Requires [Deno](https://deno.com) 2.x — nothing else. The database is a single SQLite
file created at `data/catalog.db`.

```sh
deno task start          # serves on http://localhost:8000
```

Optional environment variables:

| Variable        | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `TMDB_API_KEY`  | Enables title search + auto-fill. Free key: themoviedb.org → Settings → API  |
| `AUTH_PASSWORD` | Enables login with this shared password (leave unset for local use)          |
| `BASE_URL`      | Absolute URL baked into QR codes (e.g. `https://movies.example.com`)         |
| `PORT`          | Listen port (default 8000)                                                   |
| `DB_PATH`       | SQLite file location (default `data/catalog.db`)                             |

**Important for QR codes:** phones scanning a label need to reach the server, so host it
somewhere stable and set `BASE_URL` to that address before printing labels. The easiest
option is a ~$5/month VPS — see **[deploy/DEPLOY.md](deploy/DEPLOY.md)** for a 15-minute
walkthrough (setup script, systemd, automatic HTTPS via Caddy, backups). Because IDs are
deterministic, printed labels survive database rebuilds and server moves as long as the
domain stays the same.

## Development

```sh
deno task dev     # auto-reload on change
deno task test    # unit tests (IDs, database, sorting)
deno check src/main.ts
```

## How the pieces fit

| File            | Role                                                        |
| --------------- | ----------------------------------------------------------- |
| `src/main.ts`   | HTTP server and routes (`Deno.serve`)                       |
| `src/db.ts`     | SQLite storage (`node:sqlite`), genre grouping, sorting     |
| `src/id.ts`     | Deterministic movie/booklet IDs (SHA-256 of normalized key) |
| `src/tmdb.ts`   | TMDB search + details (optional)                            |
| `src/qr.ts`     | QR code SVG rendering                                       |
| `src/views.ts`  | Server-rendered HTML pages                                  |
| `static/`       | Stylesheet, incl. print layout for label sheets             |

QR codes encode short URLs (`/m/<id>`, `/b/<id>`) that redirect to the movie or booklet
page, keeping the codes small and easy to scan.

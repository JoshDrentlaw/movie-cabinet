import {
  authEnabled,
  checkPassword,
  clearSessionCookie,
  isAuthorized,
  sessionCookie,
  sessionToken,
} from "./auth.ts";
import { Catalog, groupByGenre, sortTitle } from "./db.ts";
import { bookletId, movieId } from "./id.ts";
import { movieDetails, searchMovies, tmdbKey } from "./tmdb.ts";
import { qrSvg } from "./qr.ts";
import * as views from "./views.ts";

const FORMATS = ["DVD", "Blu-ray", "4K UHD", "VHS", "Other"];

const dbPath = Deno.env.get("DB_PATH") ?? "data/catalog.db";
await Deno.mkdir(dbPath.includes("/") ? dbPath.slice(0, dbPath.lastIndexOf("/")) : ".", {
  recursive: true,
});
const catalog = new Catalog(dbPath);

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

function notFound(what: string): Response {
  return html(views.layout("Not found", `<h1>Not found</h1><p>${views.esc(what)}</p>`), 404);
}

/** True when the original request was HTTPS (directly or via a reverse proxy). */
function isSecure(req: Request): boolean {
  return req.headers.get("x-forwarded-proto") === "https" ||
    new URL(req.url).protocol === "https:";
}

/** Absolute base URL for QR codes: BASE_URL env if set, else derived from the request. */
function baseUrl(req: Request): string {
  const configured = Deno.env.get("BASE_URL");
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${isSecure(req) ? "https" : "http"}://${url.host}`;
}

/** Only ever redirect back to a local path, never an absolute URL. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

async function createMovieFromForm(form: FormData): Promise<string> {
  const tmdbIdRaw = form.get("tmdb_id");
  const format = String(form.get("format") || "DVD");

  if (tmdbIdRaw) {
    const details = await movieDetails(Number(tmdbIdRaw));
    const id = await movieId(details.title, details.year, format);
    catalog.upsertMovie({
      id,
      title: details.title,
      year: details.year,
      format,
      genre: details.genres[0] ?? "Uncategorized",
      genres: details.genres,
      director: details.director,
      runtime: details.runtime,
      overview: details.overview,
      poster_url: details.poster_url,
      tmdb_id: details.tmdb_id,
    });
    return id;
  }

  const title = String(form.get("title") || "").trim();
  if (!title) throw new Error("Title is required");
  const yearRaw = String(form.get("year") || "").trim();
  const year = yearRaw ? Number(yearRaw) : null;
  const genre = String(form.get("genre") || "").trim() || "Uncategorized";
  const id = await movieId(title, year, format);
  catalog.upsertMovie({
    id,
    title,
    year,
    format,
    genre,
    genres: genre !== "Uncategorized" ? [genre] : [],
    director: String(form.get("director") || "").trim() || null,
    runtime: null,
    overview: null,
    poster_url: null,
    tmdb_id: null,
  });
  return id;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // static (public — the login page needs the stylesheet)
  if (path.startsWith("/static/")) {
    try {
      const file = await Deno.readFile("." + path);
      const type = path.endsWith(".css") ? "text/css" : "application/octet-stream";
      return new Response(file, { headers: { "content-type": type } });
    } catch {
      return notFound(path);
    }
  }

  // login / logout
  if (path === "/login" && method === "GET") {
    if (!authEnabled() || (await isAuthorized(req))) return redirect("/");
    return html(
      views.loginPage(safeNext(url.searchParams.get("next")), url.searchParams.has("failed")),
    );
  }

  if (path === "/login" && method === "POST") {
    const form = await req.formData();
    const next = safeNext(String(form.get("next") || "/"));
    if (await checkPassword(String(form.get("password") || ""))) {
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          "set-cookie": sessionCookie(await sessionToken(), isSecure(req)),
        },
      });
    }
    // slow down guessing a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return redirect(`/login?failed=1&next=${encodeURIComponent(next)}`);
  }

  if (path === "/logout" && method === "POST") {
    return new Response(null, {
      status: 303,
      headers: { location: "/login", "set-cookie": clearSessionCookie(isSecure(req)) },
    });
  }

  // everything else requires a session when a password is configured
  if (authEnabled() && !(await isAuthorized(req))) {
    return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
  }

  // home: genres, alphabetical within each
  if (path === "/" && method === "GET") {
    const movies = catalog.listMovies();
    const groups = groupByGenre(movies);
    const bookletNames = new Map(catalog.listBooklets().map((b) => [b.id, b.name]));
    return html(views.homePage(groups, movies.length, bookletNames));
  }

  if (path === "/add" && method === "GET") {
    return html(views.addPage(Boolean(tmdbKey()), FORMATS));
  }

  if (path === "/api/search" && method === "GET") {
    const q = url.searchParams.get("q")?.trim();
    if (!q) return Response.json([]);
    try {
      return Response.json(await searchMovies(q));
    } catch (err) {
      return new Response(String(err), { status: 502 });
    }
  }

  if (path === "/movies" && method === "POST") {
    try {
      const id = await createMovieFromForm(await req.formData());
      return redirect(`/movies/${id}?added=1`);
    } catch (err) {
      return html(
        views.layout("Error", `<h1>Could not add movie</h1><p>${views.esc(String(err))}</p>`),
        400,
      );
    }
  }

  // short QR-target paths redirect to the full pages
  let match = path.match(/^\/m\/(m[0-9a-f]+)$/);
  if (match) return redirect(`/movies/${match[1]}`);
  match = path.match(/^\/b\/(b[0-9a-f]+)$/);
  if (match) return redirect(`/booklets/${match[1]}`);

  match = path.match(/^\/movies\/([\w-]+)$/);
  if (match && method === "GET") {
    const movie = catalog.getMovie(match[1]);
    if (!movie) return notFound(`No movie with ID ${match[1]}`);
    const booklet = movie.booklet_id ? catalog.getBooklet(movie.booklet_id) : null;
    return html(
      views.moviePage(movie, booklet, catalog.listBooklets(), url.searchParams.has("added")),
    );
  }

  match = path.match(/^\/movies\/([\w-]+)\/location$/);
  if (match && method === "POST") {
    const movie = catalog.getMovie(match[1]);
    if (!movie) return notFound(`No movie with ID ${match[1]}`);
    const form = await req.formData();
    const bId = String(form.get("booklet_id") || "") || null;
    const slotRaw = String(form.get("slot") || "").trim();
    catalog.setLocation(movie.id, bId, bId && slotRaw ? Number(slotRaw) : null);
    return redirect(`/movies/${movie.id}`);
  }

  match = path.match(/^\/movies\/([\w-]+)\/delete$/);
  if (match && method === "POST") {
    catalog.deleteMovie(match[1]);
    return redirect("/");
  }

  if (path === "/booklets" && method === "GET") {
    return html(views.bookletsPage(catalog.listBooklets()));
  }

  if (path === "/booklets" && method === "POST") {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim();
    if (!name) return html(views.layout("Error", "<h1>Booklet name is required</h1>"), 400);
    const id = await bookletId(name);
    catalog.upsertBooklet({ id, name, description: String(form.get("description") || "") || null });
    return redirect(`/booklets/${id}`);
  }

  match = path.match(/^\/booklets\/([\w-]+)$/);
  if (match && method === "GET") {
    const booklet = catalog.getBooklet(match[1]);
    if (!booklet) return notFound(`No booklet with ID ${match[1]}`);
    const movies = catalog.listMovies({ booklet_id: booklet.id });
    movies.sort((a, b) =>
      (a.slot ?? Infinity) - (b.slot ?? Infinity) ||
      sortTitle(a.title).localeCompare(sortTitle(b.title))
    );
    return html(views.bookletPage(booklet, movies));
  }

  match = path.match(/^\/booklets\/([\w-]+)\/delete$/);
  if (match && method === "POST") {
    catalog.deleteBooklet(match[1]);
    return redirect("/booklets");
  }

  // QR SVGs — encode short absolute URLs (/m/:id, /b/:id)
  match = path.match(/^\/qr\/movie\/([\w-]+)\.svg$/);
  if (match) {
    const svg = await qrSvg(`${baseUrl(req)}/m/${match[1]}`);
    return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
  }
  match = path.match(/^\/qr\/booklet\/([\w-]+)\.svg$/);
  if (match) {
    const svg = await qrSvg(`${baseUrl(req)}/b/${match[1]}`);
    return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
  }

  // printable label sheets
  if (path === "/print/movies" && method === "GET") {
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
    const genre = url.searchParams.get("genre") ?? undefined;
    const movies = catalog.listMovies({ ids, genre });
    movies.sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title)));
    const labels = movies.map((m) => ({
      qrPath: `/qr/movie/${m.id}.svg`,
      title: m.title + (m.year ? ` (${m.year})` : ""),
      subtitle: [m.format, m.genre].filter(Boolean).join(" · "),
      id: m.id,
    }));
    return html(views.printPage("Movie labels", labels));
  }

  if (path === "/print/booklets" && method === "GET") {
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
    let booklets = catalog.listBooklets();
    if (ids?.length) booklets = booklets.filter((b) => ids.includes(b.id));
    const labels = booklets.map((b) => ({
      qrPath: `/qr/booklet/${b.id}.svg`,
      title: b.name,
      subtitle: `${b.movie_count} movie${b.movie_count === 1 ? "" : "s"}`,
      id: b.id,
    }));
    return html(views.printPage("Booklet labels", labels));
  }

  return notFound(path);
}

const port = Number(Deno.env.get("PORT") ?? 8000);
Deno.serve({ port }, (req) =>
  handle(req).catch((err) => {
    console.error(err);
    return html(
      views.layout("Error", `<h1>Something went wrong</h1><p>${views.esc(String(err))}</p>`),
      500,
    );
  }));

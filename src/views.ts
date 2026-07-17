import type { Booklet, Movie } from "./db.ts";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Movie Cabinet</title>
<link rel="stylesheet" href="/static/styles.css">
</head>
<body>
<header class="topbar no-print">
  <a class="brand" href="/">🎬 Movie Cabinet</a>
  <nav>
    <a href="/add">+ Add movie</a>
    <a href="/booklets">Booklets</a>
    <a href="/print/movies">Print labels</a>
    ${
    Deno.env.get("AUTH_PASSWORD")
      ? `<form method="post" action="/logout" class="logout-form"><button type="submit" class="linklike">Log out</button></form>`
      : ""
  }
  </nav>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

function locationChip(m: Movie, bookletName?: string | null): string {
  if (!m.booklet_id) return `<span class="chip chip-warn">no location</span>`;
  const label = bookletName ? esc(bookletName) : "booklet";
  const slot = m.slot != null ? ` · slot ${m.slot}` : "";
  return `<span class="chip chip-ok">📖 ${label}${slot}</span>`;
}

export function homePage(
  groups: Map<string, Movie[]>,
  total: number,
  bookletNames: Map<string, string>,
): string {
  const toc = [...groups.keys()]
    .map((g) => `<a href="#g-${esc(encodeURIComponent(g))}">${esc(g)}</a>`)
    .join(" ");
  const sections = [...groups.entries()]
    .map(
      ([genre, movies]) => `
<section class="genre" id="g-${esc(encodeURIComponent(genre))}">
  <h2>${esc(genre)} <span class="count">${movies.length}</span></h2>
  <ul class="movie-list">
    ${
        movies
          .map(
            (m) => `
    <li class="movie-row" data-title="${esc(m.title.toLowerCase())}">
      <a class="movie-link" href="/movies/${esc(m.id)}">
        <span class="movie-title">${esc(m.title)}</span>
        ${m.year ? `<span class="movie-year">(${m.year})</span>` : ""}
      </a>
      <span class="badge">${esc(m.format)}</span>
      ${locationChip(m, m.booklet_id ? bookletNames.get(m.booklet_id) : null)}
    </li>`,
          )
          .join("")
      }
  </ul>
</section>`,
    )
    .join("");

  const empty = `
<div class="empty">
  <p>No movies yet. <a href="/add">Add the first one</a> — if a TMDB API key is set,
  just type a title and everything else fills in automatically.</p>
</div>`;

  return layout(
    "Collection",
    `
<div class="page-head">
  <h1>Collection <span class="count">${total} movie${total === 1 ? "" : "s"}</span></h1>
  <input id="filter" type="search" placeholder="Filter titles…" autocomplete="off">
</div>
<p class="toc no-print">${toc}</p>
${total === 0 ? empty : sections}
<script>
const filter = document.getElementById("filter");
filter?.addEventListener("input", () => {
  const q = filter.value.trim().toLowerCase();
  document.querySelectorAll(".movie-row").forEach((row) => {
    row.hidden = q !== "" && !row.dataset.title.includes(q);
  });
  document.querySelectorAll(".genre").forEach((sec) => {
    sec.hidden = q !== "" && ![...sec.querySelectorAll(".movie-row")].some((r) => !r.hidden);
  });
});
</script>`,
  );
}

export function addPage(hasTmdb: boolean, formats: string[]): string {
  const formatOptions = formats
    .map((f) => `<option value="${esc(f)}">${esc(f)}</option>`)
    .join("");
  const search = hasTmdb
    ? `
<section class="card">
  <h2>Search TMDB</h2>
  <p class="hint">Type a title — pick a result and the genre, year, poster and director fill in automatically.</p>
  <input id="q" type="search" placeholder="e.g. The Great Escape" autocomplete="off" autofocus>
  <label class="inline-label">Format
    <select id="search-format">${formatOptions}</select>
  </label>
  <div id="results"></div>
</section>
<script>
const q = document.getElementById("q");
const results = document.getElementById("results");
let timer;
q.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(search, 300);
});
async function search() {
  const query = q.value.trim();
  if (!query) { results.innerHTML = ""; return; }
  results.innerHTML = '<p class="hint">Searching…</p>';
  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(query));
    if (!res.ok) throw new Error(await res.text());
    const items = await res.json();
    if (items.length === 0) { results.innerHTML = '<p class="hint">No results.</p>'; return; }
    results.innerHTML = items.map((r) => \`
      <form method="post" action="/movies" class="result-row">
        <input type="hidden" name="tmdb_id" value="\${r.tmdb_id}">
        \${r.poster_url ? \`<img src="\${r.poster_url}" alt="" class="poster-sm">\` : '<div class="poster-sm poster-blank"></div>'}
        <div class="result-info">
          <strong>\${escHtml(r.title)}</strong> \${r.year ? "(" + r.year + ")" : ""}
          <p class="hint clamp">\${escHtml(r.overview)}</p>
        </div>
        <button type="submit">Add</button>
      </form>\`).join("");
    results.querySelectorAll("form").forEach((f) => {
      f.addEventListener("submit", () => {
        const fmt = document.createElement("input");
        fmt.type = "hidden"; fmt.name = "format";
        fmt.value = document.getElementById("search-format").value;
        f.appendChild(fmt);
      });
    });
  } catch (err) {
    results.innerHTML = '<p class="error">Search failed: ' + escHtml(String(err)) + "</p>";
  }
}
function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
</script>`
    : `
<section class="card">
  <h2>Automatic lookup is off</h2>
  <p class="hint">Set the <code>TMDB_API_KEY</code> environment variable (free key from
  <a href="https://www.themoviedb.org/settings/api">themoviedb.org</a>) to search by title and
  auto-fill genre, year, poster and director. Until then, use the manual form below.</p>
</section>`;

  return layout(
    "Add movie",
    `
<h1>Add a movie</h1>
${search}
<section class="card">
  <h2>Manual entry</h2>
  <form method="post" action="/movies" class="stack">
    <label>Title <input name="title" required></label>
    <label>Year <input name="year" type="number" min="1880" max="2100"></label>
    <label>Genre <input name="genre" placeholder="e.g. Western"></label>
    <label>Format <select name="format">${formatOptions}</select></label>
    <label>Director <input name="director"></label>
    <button type="submit">Add movie</button>
  </form>
</section>`,
  );
}

export function moviePage(
  m: Movie,
  booklet: Booklet | null,
  booklets: Booklet[],
  added: boolean,
): string {
  const location = m.booklet_id && booklet
    ? `<p class="location-line">📖 <strong>${esc(booklet.name)}</strong>${
      m.slot != null ? `, slot <strong>${m.slot}</strong>` : ""
    } <a class="hint" href="/booklets/${esc(booklet.id)}">(open booklet)</a></p>`
    : `<p class="location-line chip-warn-text">No location assigned yet.</p>`;

  const bookletOptions = booklets
    .map(
      (b) =>
        `<option value="${esc(b.id)}" ${b.id === m.booklet_id ? "selected" : ""}>${
          esc(b.name)
        }</option>`,
    )
    .join("");

  return layout(
    m.title,
    `
${
      added
        ? `<p class="flash">✅ Saved. Same movie entered twice always gets the same ID, so nothing duplicates.</p>`
        : ""
    }
<div class="movie-detail">
  ${
      m.poster_url
        ? `<img class="poster" src="${esc(m.poster_url)}" alt="Poster for ${esc(m.title)}">`
        : ""
    }
  <div>
    <h1>${esc(m.title)} ${m.year ? `<span class="movie-year">(${m.year})</span>` : ""}</h1>
    <p>
      <span class="badge">${esc(m.format)}</span>
      ${m.genres.map((g) => `<span class="chip">${esc(g)}</span>`).join(" ")}
    </p>
    ${m.director ? `<p>Directed by ${esc(m.director)}</p>` : ""}
    ${m.runtime ? `<p>${m.runtime} min</p>` : ""}
    ${m.overview ? `<p class="overview">${esc(m.overview)}</p>` : ""}

    <h2>Where is it?</h2>
    ${location}
    <form method="post" action="/movies/${esc(m.id)}/location" class="inline-form no-print">
      <label>Booklet
        <select name="booklet_id">
          <option value="">— none —</option>
          ${bookletOptions}
        </select>
      </label>
      <label>Slot <input name="slot" type="number" min="1" value="${
      m.slot ?? ""
    }" style="width:5em"></label>
      <button type="submit">Save location</button>
    </form>
    ${
      booklets.length === 0
        ? `<p class="hint no-print">No booklets yet — <a href="/booklets">create one</a> first.</p>`
        : ""
    }

    <h2>QR label</h2>
    <div class="qr-block">
      <img src="/qr/movie/${esc(m.id)}.svg" alt="QR code for ${esc(m.title)}" class="qr">
      <div>
        <p class="hint">Scanning this opens this page and shows the location.<br>ID: <code>${
      esc(m.id)
    }</code></p>
        <a class="button" href="/print/movies?ids=${esc(m.id)}">Print this label</a>
      </div>
    </div>

    <form method="post" action="/movies/${esc(m.id)}/delete" class="no-print"
          onsubmit="return confirm('Remove ${esc(m.title)} from the catalog?')">
      <button class="danger" type="submit">Delete movie</button>
    </form>
  </div>
</div>`,
  );
}

export function bookletsPage(booklets: (Booklet & { movie_count: number })[]): string {
  const rows = booklets
    .map(
      (b) => `
    <li class="movie-row">
      <a class="movie-link" href="/booklets/${esc(b.id)}">
        <span class="movie-title">📖 ${esc(b.name)}</span>
      </a>
      <span class="count">${b.movie_count} movie${b.movie_count === 1 ? "" : "s"}</span>
    </li>`,
    )
    .join("");
  return layout(
    "Booklets",
    `
<h1>Booklets</h1>
<p class="hint">One entry per physical sleeved booklet. Print a QR label for the cover of each —
scanning it lists everything inside.</p>
<section class="card">
  <form method="post" action="/booklets" class="inline-form">
    <label>Name <input name="name" required placeholder="e.g. Westerns A–L"></label>
    <label>Notes <input name="description" placeholder="optional"></label>
    <button type="submit">Create booklet</button>
  </form>
</section>
${booklets.length ? `<ul class="movie-list">${rows}</ul>` : `<p class="empty">No booklets yet.</p>`}
${
      booklets.length
        ? `<p><a class="button" href="/print/booklets">Print all booklet labels</a></p>`
        : ""
    }`,
  );
}

export function bookletPage(b: Booklet, movies: Movie[]): string {
  const rows = movies
    .map(
      (m) => `
    <li class="movie-row">
      <span class="slot-num">${m.slot != null ? m.slot : "–"}</span>
      <a class="movie-link" href="/movies/${esc(m.id)}">
        <span class="movie-title">${esc(m.title)}</span>
        ${m.year ? `<span class="movie-year">(${m.year})</span>` : ""}
      </a>
      <span class="badge">${esc(m.format)}</span>
    </li>`,
    )
    .join("");
  return layout(
    b.name,
    `
<h1>📖 ${esc(b.name)}</h1>
${b.description ? `<p class="hint">${esc(b.description)}</p>` : ""}
<div class="qr-block">
  <img src="/qr/booklet/${esc(b.id)}.svg" alt="QR code for ${esc(b.name)}" class="qr">
  <div>
    <p class="hint">Put this QR on the booklet cover — scanning it opens this list.<br>ID: <code>${
      esc(b.id)
    }</code></p>
    <a class="button" href="/print/booklets?ids=${esc(b.id)}">Print this label</a>
  </div>
</div>
<h2>Contents <span class="count">${movies.length}</span></h2>
${
      movies.length
        ? `<ul class="movie-list">${rows}</ul>`
        : `<p class="empty">Nothing filed here yet. Assign movies from their detail pages.</p>`
    }
<form method="post" action="/booklets/${esc(b.id)}/delete" class="no-print"
      onsubmit="return confirm('Delete this booklet? Movies inside will be marked as having no location.')">
  <button class="danger" type="submit">Delete booklet</button>
</form>`,
  );
}

export function loginPage(next: string, failed: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Movie Cabinet</title>
<link rel="stylesheet" href="/static/styles.css">
</head>
<body class="login-body">
<main class="login-main">
  <section class="card login-card">
    <h1>🎬 Movie Cabinet</h1>
    ${failed ? `<p class="error">That password didn't match — try again.</p>` : ""}
    <form method="post" action="/login" class="stack">
      <input type="hidden" name="next" value="${esc(next)}">
      <label>Family password
        <input name="password" type="password" required autofocus autocomplete="current-password">
      </label>
      <button type="submit">Sign in</button>
    </form>
    <p class="hint">You'll stay signed in on this device, so you should only ever see this once.</p>
  </section>
</main>
</body>
</html>`;
}

export interface Label {
  qrPath: string;
  title: string;
  subtitle: string;
  id: string;
}

export function printPage(heading: string, labels: Label[]): string {
  const cells = labels
    .map(
      (l) => `
  <div class="label">
    <img src="${esc(l.qrPath)}" alt="">
    <div class="label-text">
      <strong>${esc(l.title)}</strong>
      <span>${esc(l.subtitle)}</span>
      <code>${esc(l.id)}</code>
    </div>
  </div>`,
    )
    .join("");
  return layout(
    heading,
    `
<div class="no-print page-head">
  <h1>${esc(heading)} <span class="count">${labels.length}</span></h1>
  <button onclick="print()" class="button">🖨 Print</button>
</div>
<p class="hint no-print">Use your browser's print dialog. Labels are sized for standard
address-label sheets (3 columns); adjust print scale if needed.</p>
<div class="label-sheet">${cells}</div>`,
  );
}

import { assertEquals } from "jsr:@std/assert@1";
import { Catalog, groupByGenre, sortTitle } from "../src/db.ts";
import { bookletId, movieId } from "../src/id.ts";

function memCatalog(): Catalog {
  return new Catalog(":memory:");
}

async function sampleMovie(catalog: Catalog, title: string, genre: string, year = 1970) {
  const id = await movieId(title, year, "DVD");
  return catalog.upsertMovie({
    id,
    title,
    year,
    format: "DVD",
    genre,
    genres: [genre],
    director: null,
    runtime: null,
    overview: null,
    poster_url: null,
    tmdb_id: null,
  });
}

Deno.test("upsert with the same deterministic ID never duplicates", async () => {
  const c = memCatalog();
  await sampleMovie(c, "Rio Bravo", "Western", 1959);
  await sampleMovie(c, "Rio Bravo", "Western", 1959);
  assertEquals(c.countMovies(), 1);
  c.close();
});

Deno.test("location assignment and booklet contents", async () => {
  const c = memCatalog();
  const movie = await sampleMovie(c, "Jaws", "Thriller", 1975);
  const bId = await bookletId("Thrillers");
  c.upsertBooklet({ id: bId, name: "Thrillers" });

  c.setLocation(movie.id, bId, 12);
  const stored = c.getMovie(movie.id)!;
  assertEquals(stored.booklet_id, bId);
  assertEquals(stored.slot, 12);
  assertEquals(c.listMovies({ booklet_id: bId }).length, 1);

  // deleting the booklet clears locations but keeps movies
  c.deleteBooklet(bId);
  assertEquals(c.getMovie(movie.id)!.booklet_id, null);
  assertEquals(c.countMovies(), 1);
  c.close();
});

Deno.test("sortTitle ignores leading articles", () => {
  const titles = ["The Zulu", "An Apple", "Matrix", "A Bug's Life"].sort((a, b) =>
    sortTitle(a).localeCompare(sortTitle(b))
  );
  assertEquals(titles, ["An Apple", "A Bug's Life", "Matrix", "The Zulu"]);
});

Deno.test("groupByGenre sorts genres and titles alphabetically", async () => {
  const c = memCatalog();
  await sampleMovie(c, "The Searchers", "Western", 1956);
  await sampleMovie(c, "High Noon", "Western", 1952);
  await sampleMovie(c, "Airplane!", "Comedy", 1980);

  const groups = groupByGenre(c.listMovies());
  assertEquals([...groups.keys()], ["Comedy", "Western"]);
  assertEquals(groups.get("Western")!.map((m) => m.title), ["High Noon", "The Searchers"]);
  c.close();
});

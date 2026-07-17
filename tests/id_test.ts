import { assertEquals, assertNotEquals } from "@std/assert";
import { bookletId, movieId, normalizeText } from "../src/id.ts";

Deno.test("normalizeText collapses punctuation, case and diacritics", () => {
  assertEquals(normalizeText("The Good, the Bad and the Ugly!"), "the good the bad and the ugly");
  assertEquals(normalizeText("  Amélie  "), "amelie");
  assertEquals(normalizeText("WALL·E"), "wall e");
});

Deno.test("movieId is idempotent across trivial input differences", async () => {
  const a = await movieId("The Great Escape", 1963, "DVD");
  const b = await movieId("  the great escape ", "1963", "dvd");
  assertEquals(a, b);
  assertEquals(a.length, 13);
  assertEquals(a[0], "m");
});

Deno.test("movieId distinguishes year and format", async () => {
  const dvd = await movieId("True Grit", 1969, "DVD");
  const remake = await movieId("True Grit", 2010, "DVD");
  const bluray = await movieId("True Grit", 1969, "Blu-ray");
  assertNotEquals(dvd, remake);
  assertNotEquals(dvd, bluray);
});

Deno.test("bookletId is deterministic", async () => {
  assertEquals(await bookletId("Westerns A–L"), await bookletId("westerns a l"));
  assertEquals((await bookletId("Comedies"))[0], "b");
});

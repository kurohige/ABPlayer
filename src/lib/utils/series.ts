/**
 * Series shelves (UI refresh, backlog #7).
 *
 * Books that belong to a named series are shown together, in reading order,
 * with the next one to read marked. Everything without a series falls into a
 * single trailing group.
 */
import type { BookMeta, UserBookData } from "../types";
import { naturalCompare } from "./sort";

export interface SeriesGroup {
  /** null for the trailing "everything else" group. */
  series: string | null;
  books: BookMeta[];
  finished: number;
  /** filePath of the first unfinished book in reading order, if any. */
  nextUp: string | null;
}

function orderOf(ud: UserBookData | undefined): number | null {
  const n = ud?.seriesOrder;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Group by `series`, ordered by `seriesOrder` and then by title. Books with a
 * number come before books without one, so a half-numbered series still reads
 * top-to-bottom. Series are ordered by name; standalone books come last.
 */
export function groupBySeries(
  books: BookMeta[],
  userData: Record<string, UserBookData>,
  titleOf: (book: BookMeta) => string,
): SeriesGroup[] {
  const bySeries = new Map<string, BookMeta[]>();
  const loose: BookMeta[] = [];

  for (const book of books) {
    const name = userData[book.filePath]?.series?.trim();
    if (!name) {
      loose.push(book);
      continue;
    }
    const bucket = bySeries.get(name);
    if (bucket) bucket.push(book);
    else bySeries.set(name, [book]);
  }

  const groups: SeriesGroup[] = [];

  for (const name of [...bySeries.keys()].sort((a, b) => naturalCompare(a, b))) {
    const ordered = [...bySeries.get(name)!].sort((a, b) => {
      const ao = orderOf(userData[a.filePath]);
      const bo = orderOf(userData[b.filePath]);
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return naturalCompare(titleOf(a), titleOf(b));
    });

    const finished = ordered.filter(
      (b) => userData[b.filePath]?.status === "finished",
    ).length;
    const nextUp =
      ordered.find((b) => userData[b.filePath]?.status !== "finished")?.filePath ?? null;

    groups.push({ series: name, books: ordered, finished, nextUp });
  }

  if (loose.length > 0) {
    groups.push({
      series: null,
      books: loose,
      finished: loose.filter((b) => userData[b.filePath]?.status === "finished").length,
      nextUp: null,
    });
  }

  return groups;
}

/** "7 books · 3 finished" for a shelf header. */
export function seriesMeta(group: SeriesGroup): string {
  const books = `${group.books.length} book${group.books.length === 1 ? "" : "s"}`;
  return group.finished > 0 ? `${books} · ${group.finished} finished` : books;
}

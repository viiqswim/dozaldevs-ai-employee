export async function paginateCursor<T extends { uid: string }>(
  firstPageUrl: string,
  headers: Record<string, string>,
  extractPage: (json: unknown) => { items: T[]; nextCursor: string | undefined },
): Promise<T[]> {
  const seenUids = new Set<string>();
  const all: T[] = [];
  let cursor: string | undefined;

  for (;;) {
    const url = cursor ? `${firstPageUrl}&_cursor=${encodeURIComponent(cursor)}` : firstPageUrl;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as unknown;
    const { items, nextCursor } = extractPage(json);
    let hasNew = false;
    for (const item of items) {
      if (item.uid && !seenUids.has(item.uid)) {
        seenUids.add(item.uid);
        all.push(item);
        hasNew = true;
      }
    }
    cursor = nextCursor;
    if (!hasNew || !cursor) break;
  }

  return all;
}

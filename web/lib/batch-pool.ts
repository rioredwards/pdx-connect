/**
 * Run async work with a max concurrency. Order of `results` matches `items`.
 * `onItemDone` is called as each item finishes (for progress UI); results are
 * in index order, not completion order.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onItemDone?: (index: number, result: R) => void,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, n));
  const results: R[] = new Array(n);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= n) return;
      const r = await fn(items[i]!, i);
      results[i] = r;
      onItemDone?.(i, r);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

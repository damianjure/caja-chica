## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-08-01 - Avoid chained array methods on large datasets
**Learning:** In utility functions processing large arrays like `history: Movimiento[]` (e.g., aggregations in `summary.ts`), using chained array methods like `.filter().filter().forEach()` creates unnecessary iterations over the entire dataset and allocates intermediate arrays for each step, increasing memory overhead and processing time.
**Action:** Replace chained array methods with a single `for...of` loop using `continue` for filtering conditions. This reduces the time complexity overhead and prevents intermediate array allocations, ensuring optimal performance on large datasets.

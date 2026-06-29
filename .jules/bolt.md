## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-06-29 - Array Operations in Dashboard Aggregations
**Learning:** In React components and utility functions processing large arrays (like `history: Movimiento[]`), using chained higher-order array methods like `.filter().forEach()` or `.filter().filter().forEach()` creates unnecessary intermediate array allocations and causes multiple iterations over the data. This adds GC pressure and blocks the main thread in synchronous transformations.
**Action:** Always replace chained array iterators with a single `for...of` loop with `continue` statements for early return/filtering.

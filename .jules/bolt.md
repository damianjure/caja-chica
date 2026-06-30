## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-11-20 - Array operations on large datasets
**Learning:** Using chained array operations like `.filter().filter().forEach()` or `.filter().map()` creates intermediate arrays for every method call, which causes GC pressure and reduces performance on very large dataset arrays like `history: Movimiento[]`.
**Action:** Always prefer a single `for...of` loop or `.reduce()` when doing multiple transformations over large arrays, to avoid unnecessary intermediate array allocations and to reduce iteration overhead.

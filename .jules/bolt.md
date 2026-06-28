## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-06-25 - Avoid array method chaining for large datasets
**Learning:** Chaining array methods like `.filter().filter().forEach()` on large arrays such as `history: Movimiento[]` creates intermediate array allocations that increase iteration overhead and memory usage unnecessarily in this TypeScript/Vite application.
**Action:** Replace array chains with single `for...of` loops when processing large collections, using `continue` to skip items that don't meet conditions, significantly reducing memory allocation overhead.

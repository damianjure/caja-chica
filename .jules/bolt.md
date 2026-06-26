## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2024-06-26 - Array Iteration Allocation Overhead
**Learning:** Chaining array methods like `.filter().forEach()` on potentially large dataset arrays (like `history: Movimiento[]`) in dashboard aggregation functions creates unnecessary intermediate array allocations, adding memory pressure and iteration overhead.
**Action:** Use single `for...of` loops instead of chained functional array methods for data aggregations on large datasets to prevent intermediate allocations and achieve O(N) iteration efficiently.

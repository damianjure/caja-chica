## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-07-01 - Avoid Array Method Chaining for Large Iterations
**Learning:** Chaining array methods like `.filter().filter().forEach()` on large datasets like the `history` array in `summary.ts` creates multiple intermediate array allocations and incurs unnecessary iteration overhead.
**Action:** Use a single `for...of` loop with early `continue` statements instead of chained `.filter()` operations when doing data transformations on large dataset arrays to prevent blocking main thread and improve execution performance.

## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2025-02-20 - Array operations optimization for large datasets
**Learning:** In utility functions dealing with large dataset arrays like `history: Movimiento[]`, chaining array methods like `.filter().forEach()` creates intermediate array allocations and causes iteration overhead.
**Action:** Use a single `for...of` loop instead of chained methods to prevent unnecessary array creations and to make iteration faster and more memory-efficient.

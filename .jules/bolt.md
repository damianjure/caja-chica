## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-06-27 - Preventing Intermediate Allocations in Array Transformations
**Learning:** Chaining array methods like `.filter().forEach()` on large arrays (such as the `history` dataset) causes the JavaScript engine to allocate and populate intermediate arrays, which increases memory usage and iteration overhead.
**Action:** Use a single `for...of` loop with early returns/`continue` statements instead of chaining array methods when iterating over large datasets.

## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2024-06-25 - Optimizing chained array methods in aggregations
**Learning:** Chaining array methods like `.filter().forEach()` on large datasets like `history: Movimiento[]` creates intermediate arrays and causes multiple passes over the data, resulting in unnecessary memory allocation and CPU overhead during dashboard aggregations.
**Action:** When processing large arrays like movement history, use a single `for...of` loop with `continue` statements instead of chaining `.filter()` and other array iteration methods to reduce memory allocation and GC pressure.

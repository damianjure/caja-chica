## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-06-11 - Array Chaining Overhead in Loops
**Learning:** Chaining array methods like `.filter().forEach()` or `.filter().map()` on large datasets (such as `history: Movimiento[]`) creates unnecessary intermediate array allocations and iterations, which can cause significant performance overhead in hot paths and synchronous component bodies.
**Action:** Always replace chained array iterators with single `for...of` loops using early returns (`continue`) to prevent intermediate allocations and reduce iteration overhead.

## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2024-05-24 - Remove Intermediate Array Allocations
**Learning:** In heavily used summary generator functions (like those in `src/dashboard/summary.ts`), using array method chains (`.filter().forEach()`) on large datasets (like `history: Movimiento[]`) creates intermediate arrays, adding garbage collection and iteration overhead.
**Action:** Replace functional array iteration chains with single `for...of` loops and `continue` statements to process large lists efficiently in one pass.

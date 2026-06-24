## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2024-06-22 - Optimize array iterations in summary.ts
**Learning:** Chained array methods like `.filter().forEach()` or `.filter().map()` create unnecessary intermediate arrays and multiple iteration passes, which can become a bottleneck when processing large collections of dashboard transactions.
**Action:** Replace these chains with single `for...of` loops and early `continue` statements to process items in a single pass without allocating intermediate memory.

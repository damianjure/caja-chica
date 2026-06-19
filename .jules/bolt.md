## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2024-06-11 - Optimizing Array Traversals
**Learning:** In `src/dashboard/summary.ts`, dashboard summary aggregations mapped over the entire movement history array multiple times by chaining `.filter()` and `.forEach()`. This creates intermediate arrays and forces multiple full traversals of the data.
**Action:** Replaced chained array methods with single `for...of` loops in data-heavy aggregation functions to traverse the list exactly once and eliminate intermediate memory allocation overhead.

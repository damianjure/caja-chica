## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2026-06-13 - Deferring expensive filters in search inputs
**Learning:** In `useMovementsFilter.ts`, the search text from a text input synchronously filtered the `movimientos` array via a `useMemo`. This causes UI blocking during fast typing, especially with large datasets.
**Action:** Use `useDeferredValue` to decouple the immediate state update of the text input (`searchText`) from the expensive re-filtering logic (`deferredSearchText`), keeping the UI responsive without sacrificing functionality.

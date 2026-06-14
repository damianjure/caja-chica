## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-10-25 - Search Filtering Optimization using useDeferredValue
**Learning:** When filtering large arrays based on continuous text input (like search bars), triggering the full array filter (including date checking and mapping) on every keystroke causes perceptible lag and main-thread blocking. A single `useMemo` combining base filters and search text exacerbates this.
**Action:** Split base filters (dropdowns) from text-based filters into two separate `useMemo` hooks. Then, wrap the `searchText` state with `useDeferredValue` so React can prioritize the search input's rendering and perform the heavy array filtering in the background.
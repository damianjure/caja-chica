## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-11-20 - Sorting ISO Dates
**Learning:** `new Date()` parsing inside `.sort()` is extremely expensive ($O(N \log N)$ cost). Supabase provides `created_at` as UTC ISO 8601 strings (e.g., `2024-05-15T12:00:00Z`). These are naturally sortable lexicographically. Direct string comparison (`a < b ? 1 : a > b ? -1 : 0`) provides a ~10x speedup with identical results. However, be careful modifying date bucketing functions (like extracting month/year), as `new Date()` naturally handles the local timezone which string slicing drops.
**Action:** Use ternary string comparison when sorting arrays by UTC ISO date strings from the database.

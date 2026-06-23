## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.
## 2025-01-20 - Fast ISO 8601 Date Handling
**Learning:** Instantiating `new Date()` objects within tight `.sort()` or `.forEach()` loops iterating over the large `history: Movimiento[]` array creates a major performance bottleneck (~10x slower). Supabase `created_at` fields are UTC ISO 8601 strings (e.g., '2025-01-20T...').
**Action:** Use `.slice(0, 7)` to extract YYYY-MM periods directly from the ISO string instead of mapping through `new Date().getFullYear()`. When sorting, use lexical comparison operators (`a.created_at < b.created_at ? 1 : -1`) rather than computing and comparing `.getTime()` stamps.

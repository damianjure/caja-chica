## 2024-06-10 - Memoizing Dashboard Aggregations
**Learning:** In React components dealing with large datasets (like `DashboardApp` and its `history` array), complex aggregations, filtering, and mapping operations run synchronously on the main thread during every render. If not memoized, this causes significant UI blocking.
**Action:** Always identify expensive array transformations inside component bodies and wrap them in `useMemo` with precise dependency arrays. Document the impact of the optimization with a code comment.

## 2024-08-01 - Lexical Sorting of ISO 8601 Timestamps
**Learning:** Supabase returns timestamps as UTC ISO 8601 strings (e.g., `YYYY-MM-DDTHH:mm:ss.sssZ`). In sorting operations over large data arrays (like `Movimiento` history), instantiating `new Date(string).getTime()` during each comparison becomes a massive bottleneck. Lexical string comparisons (`<` and `>`) yield the exact same ordering for ISO 8601 strings but run ~5.5x faster in Node/V8 tight loops.
**Action:** Never instantiate `Date` objects in Array.prototype.sort() for Supabase timestamps. Use lexical comparison operators `(b < a ? -1 : (b > a ? 1 : 0))` instead.

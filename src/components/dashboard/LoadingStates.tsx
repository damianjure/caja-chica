function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[var(--app-surface-2)] ${className}`} />;
}

// Mirrors the real landing (Resumen) layout so the load doesn't reflow into a
// different shape: header bar → hero metric → 2 secondary cards → chips → Pulso
// chart → 2-col charts. Tonal surfaces (theme-aware), never hardcoded grays.
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-14 w-full rounded-2xl" />
      <SkeletonBlock className="h-4 w-44 rounded-md" />

      {/* Hero metric */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-6 py-5 space-y-3">
        <SkeletonBlock className="h-3 w-32 rounded-md" />
        <SkeletonBlock className="h-9 w-44 rounded-md" />
      </div>

      {/* Two secondary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-4 space-y-3">
            <SkeletonBlock className="h-3 w-20 rounded-md" />
            <SkeletonBlock className="h-6 w-24 rounded-md" />
          </div>
        ))}
      </div>

      {/* Chips */}
      <div className="flex gap-2">
        <SkeletonBlock className="h-7 w-24 rounded-full" />
        <SkeletonBlock className="h-7 w-20 rounded-full" />
        <SkeletonBlock className="h-7 w-28 rounded-full" />
      </div>

      {/* Pulso chart (full width) */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-6 space-y-4">
        <SkeletonBlock className="h-5 w-40 rounded-md" />
        <SkeletonBlock className="h-3 w-56 max-w-full rounded-md" />
        <SkeletonBlock className="h-48 w-full rounded-lg" />
      </div>

      {/* Two-up charts (stack on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-6 space-y-4">
            <SkeletonBlock className="h-5 w-36 rounded-md" />
            <SkeletonBlock className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionLoadingState({ message = 'Cargando datos...' }: { message?: string }) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-6 py-12 text-center shadow-[var(--app-shadow-sm)]">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--app-border)] border-t-[var(--app-strong-surface)]" />
      <p className="text-sm font-medium text-[var(--app-text-1)]">{message}</p>
      <p className="mt-1 text-sm text-[var(--app-text-3)]">Estamos armando la vista para que cargue prolija y sin saltos.</p>
    </div>
  );
}

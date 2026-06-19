function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--app-surface-2)] ${className}`} />;
}

// Mirrors the real ResumenTab layout:
// 4-KPI grid → actividad reciente → 2-col charts → proyección
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* 4-KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-4 space-y-3">
            <SkeletonBlock className="h-3 w-24 rounded-md" />
            <SkeletonBlock className="h-7 w-32 rounded-md" />
            <SkeletonBlock className="h-3 w-16 rounded-md" />
          </div>
        ))}
      </div>

      {/* Actividad reciente */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-5 space-y-4">
        <SkeletonBlock className="h-4 w-36 rounded-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <SkeletonBlock className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <SkeletonBlock className="h-3 w-48 rounded-md" />
              <SkeletonBlock className="h-2.5 w-16 rounded-md" />
            </div>
            <SkeletonBlock className="h-4 w-20 rounded-md shrink-0" />
          </div>
        ))}
      </div>

      {/* 2-col charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-6 space-y-4">
            <SkeletonBlock className="h-4 w-36 rounded-md" />
            <SkeletonBlock className="h-3 w-56 max-w-full rounded-md" />
            <SkeletonBlock className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* Proyección */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-6 py-6 space-y-4">
        <SkeletonBlock className="h-4 w-44 rounded-md" />
        <SkeletonBlock className="h-3 w-72 max-w-full rounded-md" />
        <div className="grid grid-cols-2 gap-4">
          <SkeletonBlock className="h-16 w-full rounded-xl" />
          <SkeletonBlock className="h-16 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <SkeletonBlock className="h-3 w-10 rounded-md shrink-0" />
              <SkeletonBlock className="h-3 flex-1 rounded-md" />
              <SkeletonBlock className="h-3 w-20 rounded-md shrink-0" />
            </div>
          ))}
        </div>
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

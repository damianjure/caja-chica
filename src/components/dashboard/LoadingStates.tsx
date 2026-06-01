function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200/80 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-10 w-72" />
          <SkeletonBlock className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-3">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-10 w-24" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <SkeletonBlock className="h-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index}>
            <SkeletonBlock className="h-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
            <SkeletonBlock className="mb-4 h-6 w-48" />
            <SkeletonBlock className="mb-8 h-4 w-72 max-w-full" />
            <SkeletonBlock className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionLoadingState({ message = 'Cargando datos...' }: { message?: string }) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--app-border)] border-t-[var(--app-strong-surface)]" />
      <p className="text-sm font-medium text-[var(--app-text-1)]">{message}</p>
      <p className="mt-1 text-sm text-[var(--app-text-3)]">Estamos armando la vista para que cargue prolija y sin saltos.</p>
    </div>
  );
}

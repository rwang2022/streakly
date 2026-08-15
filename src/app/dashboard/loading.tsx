export default function Loading() {
  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
      <div className="mx-auto max-w-md animate-pulse">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="mt-2 h-7 w-40 rounded bg-surface-2" />

        <div className="mt-8 flex flex-col items-center rounded-3xl border border-border bg-surface p-8">
          <div className="h-[220px] w-[220px] rounded-full bg-surface-2" />
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <div className="h-16 rounded-2xl bg-surface-2" />
            <div className="h-16 rounded-2xl bg-surface-2" />
          </div>
        </div>

        <div className="mt-6 h-14 rounded-2xl bg-surface-2" />
      </div>
    </main>
  );
}

export default function Loading() {
  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <div className="mx-auto max-w-md">
        <div className="h-4 w-24 rounded skeleton" />
        <div className="mt-2 h-7 w-40 rounded skeleton" />

        <div className="mt-8 flex flex-col items-center rounded-3xl border border-border bg-surface p-8">
          <div className="h-[220px] w-[220px] rounded-full skeleton" />
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <div className="h-16 rounded-2xl skeleton" />
            <div className="h-16 rounded-2xl skeleton" />
          </div>
        </div>

        <div className="mt-6 h-14 rounded-2xl skeleton" />
      </div>
    </main>
  );
}

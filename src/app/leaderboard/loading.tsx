export default function Loading() {
  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
      <div className="mx-auto max-w-md animate-pulse">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="mt-2 h-4 w-56 rounded bg-surface-2" />
        <div className="mt-5 flex gap-2">
          <div className="h-8 w-20 rounded-full bg-surface-2" />
          <div className="h-8 w-20 rounded-full bg-surface-2" />
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[70px] rounded-2xl bg-surface-2" />
          ))}
        </div>
      </div>
    </main>
  );
}

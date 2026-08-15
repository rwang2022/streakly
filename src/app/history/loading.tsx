export default function Loading() {
  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
      <div className="mx-auto max-w-md">
        <div className="h-7 w-32 rounded skeleton" />
        <div className="mt-2 h-4 w-24 rounded skeleton" />
        <div className="mt-6 h-40 rounded-2xl skeleton" />
        <div className="mt-8 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl skeleton" />
          ))}
        </div>
      </div>
    </main>
  );
}

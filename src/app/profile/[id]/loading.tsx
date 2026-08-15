export default function Loading() {
  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
      <div className="mx-auto max-w-md">
        <div className="h-4 w-16 rounded skeleton" />
        <div className="mt-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full skeleton" />
          <div>
            <div className="h-5 w-32 rounded skeleton" />
            <div className="mt-1.5 h-3.5 w-20 rounded skeleton" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="h-16 rounded-2xl skeleton" />
          <div className="h-16 rounded-2xl skeleton" />
          <div className="h-16 rounded-2xl skeleton" />
        </div>
        <div className="mt-8 h-40 rounded-2xl skeleton" />
      </div>
    </main>
  );
}

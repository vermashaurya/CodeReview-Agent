import type { ReactElement } from "react";

export default function HomePage(): ReactElement {
  return (
    <main className="min-h-screen px-6 py-16">
      <section className="mx-auto max-w-5xl rounded-3xl border border-border/80 bg-white/80 p-10 shadow-sm backdrop-blur">
        <div className="mb-8 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-700">
          ICRA Dashboard
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Production-grade AI code reviews with GitHub-native feedback loops.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Phase 1 scaffold is in place. The dashboard layer will surface repositories,
          review trends, and structured findings as the backend pipeline comes online.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Backend</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">Hono + Bun</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Storage</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">Postgres + pgvector</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Queue</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">Redis + BullMQ</p>
          </div>
        </div>
      </section>
    </main>
  );
}

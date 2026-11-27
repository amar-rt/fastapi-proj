import type { ReactNode } from "react";

export function Badge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const green = "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  const amber = "bg-amber-50 text-amber-700 ring-amber-600/20";
  const red = "bg-rose-50 text-rose-700 ring-rose-600/20";
  const colors: Record<string, string> = {
    new: "bg-slate-50 text-slate-600 ring-slate-500/20",
    prepared: "bg-sky-50 text-sky-700 ring-sky-600/20",
    in_progress: amber,
    completed: "bg-violet-50 text-violet-700 ring-violet-600/20",
    decided: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    next_round: green, selected: green, matched: green,
    hold: amber, partial: amber,
    reject: red, rejected: red, missing: red,
  };
  return <span className={`badge ${colors[value] ?? "bg-slate-50 text-slate-600 ring-slate-500/20"}`}>{value.replace("_", " ")}</span>;
}

export const SCALE: Record<number, string> = { 1: "Poor", 2: "Basic", 3: "Good", 4: "Strong", 5: "Expert" };

export function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const c = score >= 4 ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : score >= 3 ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
    : score >= 2 ? "bg-amber-50 text-amber-700 ring-amber-600/20"
    : "bg-rose-50 text-rose-700 ring-rose-600/20";
  return (
    <span className={`badge tabular-nums font-semibold ${c}`} title={SCALE[Math.round(score)]}>
      {Number(score).toFixed(score % 1 ? 1 : 0)} / 5
    </span>
  );
}

export function ErrorBox({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 text-sm">{error}</div>;
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-lg text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-100 border-t-accent" />
      {label}
    </span>
  );
}

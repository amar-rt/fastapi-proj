import type { ReactNode } from "react";

export function Badge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const colors: Record<string, string> = {
    new: "bg-slate-100 text-slate-700",
    prepared: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    completed: "bg-violet-100 text-violet-800",
    decided: "bg-slate-200 text-slate-800",
    next_round: "bg-green-100 text-green-800",
    selected: "bg-green-100 text-green-800",
    hold: "bg-amber-100 text-amber-800",
    reject: "bg-red-100 text-red-800",
    rejected: "bg-red-100 text-red-800",
    matched: "bg-green-100 text-green-800",
    partial: "bg-amber-100 text-amber-800",
    missing: "bg-red-100 text-red-800",
  };
  return <span className={`badge ${colors[value] ?? "bg-slate-100"}`}>{value.replace("_", " ")}</span>;
}

export const SCALE: Record<number, string> = { 1: "Poor", 2: "Basic", 3: "Good", 4: "Strong", 5: "Expert" };

export function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const c = score >= 4 ? "bg-green-600" : score >= 3 ? "bg-blue-600" : score >= 2 ? "bg-amber-500" : "bg-red-600";
  return (
    <span className={`badge text-white ${c}`} title={SCALE[Math.round(score)]}>
      {Number(score).toFixed(score % 1 ? 1 : 0)} / 5
    </span>
  );
}

export function ErrorBox({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-2 text-sm">{error}</div>;
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-lg">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy" />
      {label}
    </span>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, download, type JD, type User } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorBox, ScorePill, Spinner } from "../components/ui";

type Row = {
  interview_id: string; name: string; email: string; role: string; interviewer: string | null; status: string;
  created_at: string; pre_match_percent: number | null; match_percent: number | null; overall_score: number | null;
  ai_recommendation: string | null; decision: string | null; overrides_ai: boolean | null;
};

const EMPTY = {
  q: "", jd_id: "", status: "", decision: "",
  // advanced (behind "More filters")
  interviewer_id: "", recommendation: "", min_score: "", min_match: "",
  date_from: "", date_to: "", skill: "", skill_min: "", disagreement: "",
};
type Filters = typeof EMPTY;
const ADVANCED: (keyof Filters)[] = [
  "interviewer_id", "recommendation", "min_score", "min_match", "date_from", "date_to", "skill", "skill_min", "disagreement",
];

export default function Candidates() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_user";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [jds, setJds] = useState<JD[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);
  const advancedCount = ADVANCED.filter((k) => filters[k]).length;
  const anyActive = Object.values(filters).some(Boolean);

  useEffect(() => {
    api<JD[]>("/jds").then(setJds).catch(() => {});
    api<User[]>("/users").then(setUsers).catch(() => {});
    api("/rubric").then((r) => setAreas(Object.keys(r.areas))).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setError(null);
      api<Row[]>(`/candidates?${qs}`).then(setRows).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [qs]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target as HTMLInputElement;
    setFilters({ ...filters, [k]: t.type === "checkbox" ? (t.checked ? "true" : "") : t.value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500">{rows ? `${rows.length} ${rows.length === 1 ? "candidate" : "candidates"}` : " "}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary"
            onClick={() => download(`/candidates/export.csv?${qs}`, "l1-candidates.csv").catch((e) => setError(e.message))}>
            Export CSV
          </button>
          {isSuper && <Link to="/candidates/new" className="btn-primary">+ Add candidate</Link>}
        </div>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-56">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.47 9.77l3.63 3.63a.75.75 0 1 0 1.06-1.06l-3.63-3.63A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
            <input className="input pl-9" placeholder="Search name or email" value={filters.q} onChange={set("q")} />
          </div>
          <select className="input w-auto" value={filters.jd_id} onChange={set("jd_id")}>
            <option value="">All roles</option>
            {jds.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input w-auto" value={filters.status} onChange={set("status")}>
            <option value="">Any status</option>
            {["new", "prepared", "in_progress", "completed", "decided"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select className="input w-auto" value={filters.decision} onChange={set("decision")}>
            <option value="">Any decision</option>
            <option value="selected">Selected</option>
            <option value="rejected">Rejected</option>
          </select>
          <button className={showMore || advancedCount ? "btn-secondary border-indigo-200 text-indigo-700" : "btn-secondary"}
            onClick={() => setShowMore(!showMore)}>
            More filters
            {advancedCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">{advancedCount}</span>
            )}
            <span className={`transition ${showMore ? "rotate-180" : ""}`}>▾</span>
          </button>
          {anyActive && <button className="btn-ghost" onClick={() => setFilters(EMPTY)}>Clear</button>}
        </div>

        {showMore && (
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            {isSuper && (
              <Field label="Interviewer">
                <select className="input" value={filters.interviewer_id} onChange={set("interviewer_id")}>
                  <option value="">Anyone</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="AI recommendation">
              <select className="input" value={filters.recommendation} onChange={set("recommendation")}>
                <option value="">Any</option>
                <option value="next_round">Next round</option>
                <option value="hold">Hold</option>
                <option value="reject">Reject</option>
              </select>
            </Field>
            <Field label="Min. overall score">
              <input className="input" type="number" step="0.5" min={1} max={5} placeholder="1–5" value={filters.min_score} onChange={set("min_score")} />
            </Field>
            <Field label="Min. JD match %">
              <input className="input" type="number" min={0} max={100} placeholder="0–100" value={filters.min_match} onChange={set("min_match")} />
            </Field>
            <Field label="Added from">
              <input className="input" type="date" value={filters.date_from} onChange={set("date_from")} />
            </Field>
            <Field label="Added to">
              <input className="input" type="date" value={filters.date_to} onChange={set("date_to")} />
            </Field>
            <Field label="Skill score at least">
              <div className="flex gap-2">
                <select className="input" value={filters.skill} onChange={set("skill")}>
                  <option value="">Skill…</option>
                  {areas.map((a) => <option key={a}>{a}</option>)}
                </select>
                <input className="input w-20" type="number" min={1} max={5} placeholder="1–5" value={filters.skill_min} onChange={set("skill_min")} />
              </div>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={!!filters.disagreement} onChange={set("disagreement")} />
              Only where the decision overrode the AI
            </label>
          </div>
        )}
      </div>

      <ErrorBox error={error} />
      <div className="card p-0 overflow-x-auto">
        {!rows ? (
          <div className="p-6"><Spinner label="Loading…" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th>Candidate</th><th>Role</th><th>Interviewer</th><th>Date</th><th>Match</th>
                <th>Score</th><th>AI rec.</th><th>Decision</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const match = r.match_percent ?? r.pre_match_percent;
                return (
                  <tr key={r.interview_id} className="hover:bg-indigo-50/40 transition">
                    <td>
                      <Link className="font-medium text-slate-900 hover:text-accent" to={`/interviews/${r.interview_id}`}>{r.name}</Link>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </td>
                    <td className="text-slate-700">{r.role}</td>
                    <td>{r.interviewer ?? <span className="text-amber-600">Unassigned</span>}</td>
                    <td className="text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>{match != null ? <MatchBar value={match} /> : <span className="text-slate-400">—</span>}</td>
                    <td><ScorePill score={r.overall_score != null ? Number(r.overall_score) : null} /></td>
                    <td><Badge value={r.ai_recommendation} /></td>
                    <td className="whitespace-nowrap">
                      <Badge value={r.decision} />
                      {r.overrides_ai && <span className="ml-1.5 text-xs text-amber-600" title="Decision overrode the AI recommendation">overrode AI</span>}
                    </td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No candidates match.{anyActive && <button className="ml-2 text-accent hover:underline" onClick={() => setFilters(EMPTY)}>Clear filters</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function MatchBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-indigo-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

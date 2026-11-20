import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { api, type User } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorBox, ScorePill, Section, Spinner } from "../components/ui";

export type Question = {
  id: string; section: "intro" | "technical" | "wrapup"; text: string; skill: string | null;
  difficulty: string | null; expected_answer: string | null; follow_ups: string[]; sort_order: number; source: string;
  transcript?: string | null; score?: number | null; reasoning?: string | null; evidence?: string | null; ai_follow_up?: string | null;
};

const SECTIONS = { intro: "1. Introduction and current role", technical: "2. Technical", wrapup: "3. Wrap-up" } as const;

export default function InterviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [duration, setDuration] = useState(45);

  const load = useCallback(() => {
    api(`/interviews/${id}`)
      .then((d) => { setData(d); if (d.interview.duration_min) setDuration(d.interview.duration_min); })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try { await fn(); load(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  if (!data) return error ? <ErrorBox error={error} /> : <Spinner label="Loading…" />;
  const { interview: iv, candidate, jd, analysis, questions, evaluation, decisions, interviewer } = data;
  const editable = ["new", "prepared"].includes(iv.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-accent">← Candidates</Link>
          <h1 className="text-2xl font-semibold">{candidate.name}</h1>
          <div className="text-sm text-slate-600">{jd.title} · {candidate.email} · <Badge value={iv.status} /></div>
        </div>
        <div className="flex gap-2 items-center">
          {["prepared", "in_progress"].includes(iv.status) && questions.length > 0 && (
            <Link to={`/interviews/${id}/run`} className="btn-primary">
              {iv.status === "in_progress" ? "Resume interview" : "Start interview"}
            </Link>
          )}
        </div>
      </div>
      <ErrorBox error={error} />

      {user?.role === "super_user" && <AssignBox interviewId={iv.id} current={interviewer?.id} onDone={load} />}

      {/* ---------- 1. Pre-interview ---------- */}
      <Section title="Pre-interview brief" actions={
        editable && (
          <button className="btn-secondary" disabled={!!busy}
            onClick={() => run("analyze", () => api(`/interviews/${id}/analyze`, { method: "POST" }))}>
            {busy === "analyze" ? <Spinner label="Analysing CV vs JD…" /> : analysis ? "Re-run analysis" : "Run CV vs JD analysis"}
          </button>
        )
      }>
        {!analysis ? <p className="text-sm text-slate-500">Not analysed yet.</p> : (
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="space-y-2">
              <div className="text-4xl font-bold">{analysis.match_percent}%</div>
              <div className="text-sm text-slate-500">overall JD match</div>
              <p className="text-sm">{analysis.summary}</p>
            </div>
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="w-full">
                <thead><tr><th>Skill</th><th>Status</th><th>Years</th><th>Note</th></tr></thead>
                <tbody>
                  {(analysis.skill_breakdown ?? []).map((s: any, i: number) => (
                    <tr key={i}><td>{s.skill}</td><td><Badge value={s.status} /></td><td>{s.years ?? "—"}</td><td className="text-slate-600">{s.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="font-medium mb-1">Highlights</h3>
              <ul className="list-disc pl-5 text-sm space-y-1">{(analysis.highlights ?? []).map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
            </div>
            <div className="lg:col-span-2">
              <h3 className="font-medium mb-1 text-red-700">Red flags to probe</h3>
              <ul className="list-disc pl-5 text-sm space-y-1">{(analysis.red_flags ?? []).map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
            </div>
          </div>
        )}
      </Section>

      {/* ---------- Questions ---------- */}
      <Section title={`Questions (${questions.length})`} actions={
        editable && (
          <div className="flex gap-2 items-center">
            <select className="input w-auto" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option>
            </select>
            <button className="btn-secondary" disabled={!!busy}
              onClick={() => run("gen", () => api(`/interviews/${id}/questions/generate`, { body: { duration_min: duration } }))}>
              {busy === "gen" ? <Spinner label="Generating…" /> : questions.length ? "Regenerate AI questions" : "Generate questions"}
            </button>
          </div>
        )
      }>
        {!analysis && editable && questions.length === 0 && (
          <p className="text-sm text-slate-500">Tip: run the analysis first so questions probe gaps and red flags.</p>
        )}
        {(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map((sec) => {
          const qs: Question[] = questions.filter((q: Question) => q.section === sec);
          return (
            <div key={sec} className="space-y-2">
              <h3 className="font-medium text-slate-700 mt-2">{SECTIONS[sec]}</h3>
              {qs.map((q, i) => (
                <QuestionCard key={q.id} q={q} editable={editable} onChange={load} onError={setError}
                  onMove={editable ? (dir) => {
                    const ids = qs.map((x) => x.id);
                    const j = i + dir;
                    if (j < 0 || j >= ids.length) return;
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                    run("reorder", () => api(`/interviews/${id}/questions/reorder`, { body: { ids } }));
                  } : undefined} />
              ))}
              {editable && <AddQuestion interviewId={iv.id} section={sec} onDone={load} onError={setError} />}
            </div>
          );
        })}
      </Section>

      {/* ---------- 3. Report ---------- */}
      {["completed", "decided"].includes(iv.status) && (
        <Section title="L1 report" actions={
          <button className="btn-secondary" disabled={!!busy}
            onClick={() => run("eval", () => api(`/interviews/${id}/evaluate`, { method: "POST" }))}>
            {busy === "eval" ? <Spinner label="Scoring…" /> : evaluation ? "Re-run evaluation" : "Generate report"}
          </button>
        }>
          {evaluation ? <Report ev={evaluation} threshold={Number(jd.pass_threshold)} /> : <p className="text-sm text-slate-500">No report yet.</p>}
        </Section>
      )}

      {["completed", "decided"].includes(iv.status) && evaluation && (
        <DecisionBox interviewId={iv.id} aiRec={evaluation.ai_recommendation} decisions={decisions} onDone={load} />
      )}

      <details className="card">
        <summary className="cursor-pointer font-semibold">CV text ({candidate.cv_filename})</summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-700 font-sans">{candidate.cv_text}</pre>
      </details>
    </div>
  );
}

function AssignBox({ interviewId, current, onDone }: { interviewId: string; current?: string; onDone: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api<User[]>("/users").then((u) => setUsers(u.filter((x) => x.active))); }, []);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-600">Interviewer:</span>
      <select className="input w-auto" value={current ?? ""}
        onChange={(e) => api(`/interviews/${interviewId}/assign`, { method: "PUT", body: { interviewer_id: e.target.value || null } }).then(onDone)}>
        <option value="">Unassigned</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </div>
  );
}

function QuestionForm({ initial, onSave, onCancel }: { initial: Partial<Question>; onSave: (q: Partial<Question>) => void; onCancel: () => void }) {
  const [q, setQ] = useState<Partial<Question>>({ follow_ups: [], ...initial });
  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-blue-50/40 p-3">
      <textarea className="input" placeholder="Question" value={q.text ?? ""} onChange={(e) => setQ({ ...q, text: e.target.value })} />
      <div className="grid sm:grid-cols-2 gap-2">
        <input className="input" placeholder="Skill area" value={q.skill ?? ""} onChange={(e) => setQ({ ...q, skill: e.target.value })} />
        <select className="input" value={q.difficulty ?? ""} onChange={(e) => setQ({ ...q, difficulty: e.target.value || null })}>
          <option value="">Difficulty…</option><option>easy</option><option>medium</option><option>hard</option>
        </select>
      </div>
      <textarea className="input" placeholder="Expected answer outline (key points)" value={q.expected_answer ?? ""}
        onChange={(e) => setQ({ ...q, expected_answer: e.target.value })} />
      <textarea className="input" placeholder="Follow-ups, one per line" value={(q.follow_ups ?? []).join("\n")}
        onChange={(e) => setQ({ ...q, follow_ups: e.target.value.split("\n") })} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!q.text || q.text.length < 3}
          onClick={() => onSave({ ...q, follow_ups: (q.follow_ups ?? []).map((f) => f.trim()).filter(Boolean) })}>Save</button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function QuestionCard({ q, editable, onChange, onError, onMove }: {
  q: Question; editable: boolean; onChange: () => void; onError: (e: string) => void; onMove?: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <QuestionForm initial={q} onCancel={() => setEditing(false)} onSave={(body) =>
      api(`/interviews/questions/${q.id}`, { method: "PUT", body: { ...body, section: q.section, sort_order: q.sort_order } })
        .then(() => { setEditing(false); onChange(); }).catch((e) => onError(e.message))} />;
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-1">
      <div className="flex gap-3 justify-between">
        <div className="font-medium">{q.text}</div>
        {editable && (
          <div className="flex gap-1 shrink-0 text-sm">
            {onMove && <button className="px-1 text-slate-500 hover:text-slate-900" title="Move up" onClick={() => onMove(-1)}>↑</button>}
            {onMove && <button className="px-1 text-slate-500 hover:text-slate-900" title="Move down" onClick={() => onMove(1)}>↓</button>}
            <button className="px-2 text-accent" onClick={() => setEditing(true)}>Edit</button>
            <button className="px-2 text-red-600" onClick={() => {
              if (confirm("Delete this question?")) api(`/interviews/questions/${q.id}`, { method: "DELETE" }).then(onChange).catch((e) => onError(e.message));
            }}>Delete</button>
          </div>
        )}
      </div>
      <div className="text-xs text-slate-500 flex gap-2 flex-wrap">
        {q.skill && <span>{q.skill}</span>}{q.difficulty && <span>· {q.difficulty}</span>}<span>· {q.source}</span>
      </div>
      {q.expected_answer && <div className="text-sm text-slate-700"><b>Expected:</b> {q.expected_answer}</div>}
      {q.follow_ups?.length > 0 && <div className="text-sm text-slate-600"><b>Follow-ups:</b> {q.follow_ups.join(" · ")}</div>}
      {q.transcript && (
        <div className="mt-2 rounded bg-slate-50 p-2 text-sm space-y-1">
          <div className="flex items-center gap-2"><ScorePill score={q.score} /> <span className="text-slate-600">{q.reasoning}</span></div>
          <div className="text-slate-800 whitespace-pre-line">{q.transcript}</div>
        </div>
      )}
    </div>
  );
}

function AddQuestion({ interviewId, section, onDone, onError }: { interviewId: string; section: Question["section"]; onDone: () => void; onError: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="text-sm text-accent" onClick={() => setOpen(true)}>+ Add question</button>;
  return <QuestionForm initial={{ section }} onCancel={() => setOpen(false)} onSave={(body) =>
    api(`/interviews/${interviewId}/questions`, { body: { ...body, section } })
      .then(() => { setOpen(false); onDone(); }).catch((e) => onError(e.message))} />;
}

function Report({ ev, threshold }: { ev: any; threshold: number }) {
  const scored = (ev.skill_scores ?? []).filter((s: any) => s.score != null);
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Overall weighted score" value={ev.overall_score != null ? `${Number(ev.overall_score).toFixed(2)} / 5` : "—"}
          sub={`Pass threshold ${threshold.toFixed(1)}`} />
        <Stat label="Updated JD match" value={ev.match_percent != null ? `${ev.match_percent}%` : "—"} sub="CV + interview" />
        <Stat label="AI recommendation" value={<Badge value={ev.ai_recommendation} />} sub={`Confidence ${ev.confidence ?? "—"}%`} />
        <div className="text-sm text-slate-700">{ev.reason}</div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {scored.length >= 3 && (
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={scored}>
                <PolarGrid />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 5]} tickCount={6} />
                <Radar dataKey="score" stroke="#2f6fed" fill="#2f6fed" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th>Skill</th><th>Score</th><th>Comment & evidence</th></tr></thead>
            <tbody>
              {(ev.skill_scores ?? []).map((s: any) => (
                <tr key={s.skill}>
                  <td className="whitespace-nowrap">{s.skill}</td>
                  <td><ScorePill score={s.score} /></td>
                  <td>{s.comment}{s.evidence && <div className="text-xs italic text-slate-500 mt-1">“{s.evidence}”</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <List title="Strengths" items={ev.strengths} />
        <List title="Gaps" items={ev.gaps} />
        <List title="Suggested L2 focus" items={ev.l2_focus} />
      </div>
    </div>
  );
}

const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div><div className="text-xs uppercase text-slate-500">{label}</div><div className="text-2xl font-semibold">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
);
const List = ({ title, items }: { title: string; items?: string[] }) => (
  <div><h3 className="font-medium mb-1">{title}</h3><ul className="list-disc pl-5 space-y-1">{(items ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
);

function DecisionBox({ interviewId, aiRec, decisions, onDone }: { interviewId: string; aiRec: string; decisions: any[]; onDone: () => void }) {
  const implied = aiRec === "next_round" ? "selected" : aiRec === "reject" ? "rejected" : null;
  const [decision, setDecision] = useState<string>(decisions[0]?.decision ?? implied ?? "selected");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const overrides = decision !== implied;

  async function submit() {
    setError(null);
    try { await api(`/interviews/${interviewId}/decision`, { body: { decision, reason } }); setReason(""); onDone(); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <Section title="Decision">
      <p className="text-sm text-slate-600">The AI recommends; you make the final call.</p>
      <ErrorBox error={error} />
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
        {["selected", "rejected"].map((d) => (
          <button key={d} onClick={() => setDecision(d)}
            className={`px-5 py-2 text-sm font-medium ${decision === d ? (d === "selected" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "bg-white"}`}>
            {d === "selected" ? "Selected for L2" : "Rejected"}
          </button>
        ))}
      </div>
      {overrides && <p className="text-sm text-amber-700">This differs from the AI recommendation ({aiRec.replace("_", " ")}); a reason is required.</p>}
      <textarea className="input" placeholder={overrides ? "Reason (required)" : "Reason (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-primary" disabled={overrides && !reason.trim()} onClick={submit}>Save decision</button>
      {decisions.length > 0 && (
        <div className="text-sm">
          <h3 className="font-medium mt-3 mb-1">Decision history</h3>
          <ul className="space-y-1">
            {decisions.map((d) => (
              <li key={d.id}><Badge value={d.decision} /> by {d.decided_by_name} on {new Date(d.decided_at).toLocaleString()}
                {d.overrides_ai && <span className="text-amber-700"> · overrode AI</span>}{d.reason && <span className="text-slate-600"> · “{d.reason}”</span>}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

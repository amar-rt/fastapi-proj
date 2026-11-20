import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { ErrorBox, ScorePill, Spinner } from "../components/ui";
import type { Question } from "./InterviewDetail";

const SECTION_LABEL = { intro: "Introduction", technical: "Technical", wrapup: "Wrap-up" } as const;
const SECTIONS = ["intro", "technical", "wrapup"] as const;
const MAX_RECORDING_SEC = 6 * 60; // keeps each upload well under Vercel's 4.5 MB body limit
const CLOSING = "Thank you for your time. We will get back to you shortly.";

function pickMime(): { mime: string; ext: string } {
  const opts = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  return opts.find((o) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mime)) ?? { mime: "", ext: "webm" };
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function InterviewRun() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const load = useCallback(() => api(`/interviews/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-10">{error ? <ErrorBox error={error} /> : <Spinner label="Loading…" />}</div>;
  if (ended || ["completed", "decided"].includes(data.interview.status)) {
    return (
      <div className="min-h-screen grid place-items-center bg-navy px-4 text-center">
        <div className="space-y-6">
          <p className="text-2xl md:text-3xl font-semibold text-white italic">“{CLOSING}”</p>
          <Link to={`/interviews/${id}`} className="btn-secondary">Open the L1 report</Link>
        </div>
      </div>
    );
  }
  if (data.interview.status !== "in_progress") return <PreStart data={data} onStarted={load} />;
  return <Runner data={data} onEnded={() => setEnded(true)} />;
}

// ---------- Before the interview: duration, mode, consent, device check ----------

function PreStart({ data, onStarted }: { data: any; onStarted: () => void }) {
  const iv = data.interview;
  const [duration, setDuration] = useState<number>(iv.duration_min ?? 45);
  const [consent, setConsent] = useState(false);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});

  async function testMic() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128;
        setLevel(peak);
        if (peak > 0.05) setMicOk(true);
        raf = requestAnimationFrame(tick);
      };
      tick();
      stopRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
      setTimeout(() => setMicOk((ok) => ok ?? false), 5000);
    } catch {
      setMicOk(false);
      setError("Microphone blocked. Allow microphone access in the browser and retry.");
    }
  }
  useEffect(() => () => stopRef.current(), []);

  async function start() {
    stopRef.current();
    try {
      await api(`/interviews/${iv.id}/start`, { body: { duration_min: duration, mode: "assisted", consent } });
      onStarted();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="card max-w-xl mx-auto space-y-5">
        <Link to={`/interviews/${iv.id}`} className="text-sm text-accent">← Back</Link>
        <h1 className="text-2xl font-semibold">Start interview: {data.candidate.name}</h1>
        <ErrorBox error={error} />
        <div>
          <label className="label">Duration</label>
          <div className="flex gap-2">
            {[30, 45, 60].map((d) => (
              <button key={d} onClick={() => setDuration(d)} className={duration === d ? "btn-primary" : "btn-secondary"}>{d} min</button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Split: intro {Math.round(duration * 0.2)} · technical {Math.round(duration * 0.65)} · wrap-up {Math.round(duration * 0.15)} min
          </p>
        </div>
        <div>
          <label className="label">Mode</label>
          <div className="flex gap-2">
            <button className="btn-primary">Assisted</button>
            <button className="btn-secondary" disabled title="Coming in Phase 2">AI-led (Phase 2)</button>
          </div>
          <p className="text-xs text-slate-500 mt-1">You read the questions; the system records, transcribes and scores each answer.</p>
        </div>
        <div className="space-y-2">
          <label className="label">Device check</label>
          <div className="flex items-center gap-3">
            <button className="btn-secondary" onClick={testMic}>Test microphone</button>
            <div className="h-2 flex-1 rounded bg-slate-200 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(100, level * 250)}%` }} /></div>
            {micOk === true && <span className="text-green-700 text-sm">OK</span>}
            {micOk === false && <span className="text-red-700 text-sm">No input</span>}
          </div>
          <p className="text-xs text-slate-500">Ask the candidate to say a few words. If they join by phone or video call, keep the call audio on speaker near your microphone.</p>
        </div>
        <label className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 p-3">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>The candidate has agreed to the interview being recorded, transcribed and evaluated with AI assistance. A person makes the final decision.</span>
        </label>
        <button className="btn-primary w-full justify-center" disabled={!consent} onClick={start}>Start interview</button>
      </div>
    </div>
  );
}

// ---------- During the interview ----------

function Runner({ data, onEnded }: { data: any; onEnded: () => void }) {
  const iv = data.interview;
  const [questions, setQuestions] = useState<Question[]>(data.questions);
  const firstOpen = questions.findIndex((q) => !q.transcript);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen); // resume after the last answered question
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const autoWrapDone = useRef(false);

  const q = questions[idx];
  const totalSec = (iv.duration_min ?? 45) * 60;
  const startedMs = new Date(iv.started_at).getTime();
  const elapsed = (now - startedMs) / 1000;
  const remaining = totalSec - elapsed;

  const sectionEnds = useMemo(() => {
    const split = data.section_split as Record<string, number>;
    let acc = 0;
    return Object.fromEntries(SECTIONS.map((s) => [s, (acc += split[s] * totalSec)])) as Record<string, number>;
  }, [data.section_split, totalSec]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Auto-move to wrap-up when the technical budget is used up.
  useEffect(() => {
    if (!autoWrapDone.current && elapsed > sectionEnds.technical && q?.section !== "wrapup") {
      const w = questions.findIndex((x) => x.section === "wrapup");
      if (w >= 0) { autoWrapDone.current = true; setIdx(w); }
    }
  }, [elapsed, sectionEnds, q, questions]);

  async function end() {
    setEnding(true);
    setError(null);
    try {
      await api(`/interviews/${iv.id}/end`, { method: "POST" });
    } catch (e: any) {
      // Interview is saved as completed even if scoring failed; report can be re-run from the detail page.
      console.warn(e);
    }
    onEnded();
  }

  const answered = questions.filter((x) => x.transcript).length;
  const sectionRemaining = sectionEnds[q?.section ?? "intro"] - elapsed;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="font-semibold">{data.candidate.name} · {data.jd.title}</div>
          <div className="text-sm text-slate-300">{answered}/{questions.length} answered</div>
          <div className={`ml-auto font-mono text-lg ${remaining < 120 ? "text-red-300 animate-pulse" : ""}`}>
            {remaining > 0 ? `${fmt(remaining)} left` : "Time is up"}
          </div>
          <button className="btn-danger" disabled={ending} onClick={() => confirm("End the interview now?") && end()}>
            {ending ? "Ending…" : "End interview"}
          </button>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2 flex gap-2 text-xs">
          {SECTIONS.map((s) => {
            const first = questions.findIndex((x) => x.section === s);
            return (
              <button key={s} disabled={first < 0} onClick={() => setIdx(first)}
                className={`rounded px-2 py-1 ${q?.section === s ? "bg-white text-navy" : "bg-white/10 text-slate-200"}`}>
                {SECTION_LABEL[s]}
              </button>
            );
          })}
          <span className={`ml-2 self-center ${sectionRemaining < 60 ? "text-amber-300" : "text-slate-300"}`}>
            {sectionRemaining > 0 ? `section budget ${fmt(sectionRemaining)}` : "section over budget, move on"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid lg:grid-cols-[1fr_260px] gap-5">
        <div className="space-y-4">
          <ErrorBox error={error} />
          {remaining <= 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              Interview time is over. Finish the current answer, then press <b>End interview</b>.
            </div>
          )}
          {q && (
            <QuestionPanel key={q.id} q={q} index={idx} total={questions.length}
              onAnswered={(a) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, ...a } : x)))}
              onError={setError}
              onPrev={() => setIdx((i) => Math.max(0, i - 1))}
              onNext={() => setIdx((i) => Math.min(questions.length - 1, i + 1))} />
          )}
        </div>
        <aside className="card p-3 space-y-1 h-fit max-h-[75vh] overflow-y-auto">
          {questions.map((x, i) => (
            <button key={x.id} onClick={() => setIdx(i)}
              className={`w-full text-left text-xs rounded px-2 py-1.5 flex gap-2 ${i === idx ? "bg-blue-50 ring-1 ring-accent" : "hover:bg-slate-50"}`}>
              <span className="w-4 shrink-0">{x.transcript ? "✓" : i + 1}</span>
              <span className="line-clamp-2">{x.text}</span>
            </button>
          ))}
        </aside>
      </main>
    </div>
  );
}

function QuestionPanel({ q, index, total, onAnswered, onError, onPrev, onNext }: {
  q: Question; index: number; total: number;
  onAnswered: (a: Partial<Question>) => void; onError: (e: string | null) => void;
  onPrev: () => void; onNext: () => void;
}) {
  const [recording, setRecording] = useState<null | "answer" | "follow_up">(null);
  const [recSec, setRecSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const notesRef = useRef("");
  notesRef.current = notes; // read inside the recorder's onstop callback, which outlives this render
  const recRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<any>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSec((s) => {
      if (s + 1 >= MAX_RECORDING_SEC) recRef.current?.stop();
      return s + 1;
    }), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => { recRef.current?.state === "recording" && recRef.current.stop(); speechRef.current?.stop(); }, []);

  async function startRec(kind: "answer" | "follow_up") {
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const { mime, ext } = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        speechRef.current?.stop();
        setRecording(null);
        upload(new Blob(chunks, { type: mime || "audio/webm" }), ext, kind === "follow_up");
      };
      rec.start(1000);
      recRef.current = rec;
      setRecSec(0);
      setCaption("");
      setRecording(kind);
      startCaptions();
    } catch {
      onError("Microphone unavailable. Allow access, or type notes below instead.");
    }
  }

  // Free live captions using the browser's built-in speech recognition (Chrome/Edge). Whisper produces the stored transcript.
  function startCaptions() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const sr = new SR();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "en-IN";
    sr.onresult = (e: any) => setCaption(Array.from(e.results).map((r: any) => r[0].transcript).join(" "));
    sr.onerror = () => {};
    try { sr.start(); speechRef.current = sr; } catch {}
  }

  async function upload(blob: Blob, ext: string, append: boolean) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, `answer.${ext}`);
      if (notesRef.current.trim()) fd.append("transcript", notesRef.current.trim());
      if (append) fd.append("append", "true");
      const a = await api(`/interviews/questions/${q.id}/answer`, { body: fd });
      onAnswered({ transcript: a.transcript, score: a.score, reasoning: a.reasoning, evidence: a.evidence, ai_follow_up: a.follow_up });
      setNotes("");
    } catch (e: any) {
      onError(`${e.message}. You can retry, or type the answer and submit as notes.`);
    } finally {
      setUploading(false);
    }
  }

  async function submitNotes() {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("transcript", notes.trim());
      if (q.transcript) fd.append("append", "true");
      const a = await api(`/interviews/questions/${q.id}/answer`, { body: fd });
      onAnswered({ transcript: a.transcript, score: a.score, reasoning: a.reasoning, evidence: a.evidence, ai_follow_up: a.follow_up });
      setNotes("");
    } catch (e: any) { onError(e.message); } finally { setUploading(false); }
  }

  const busy = !!recording || uploading;
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Question {index + 1} of {total} · {SECTION_LABEL[q.section]}{q.skill && ` · ${q.skill}`}{q.difficulty && ` · ${q.difficulty}`}
        </div>
        <p className="text-xl font-medium leading-snug">{q.text}</p>
        <div className="flex flex-wrap gap-2 items-center pt-2">
          {!recording ? (
            <button className="btn-primary" disabled={uploading} onClick={() => startRec(q.transcript ? "follow_up" : "answer")}>
              ● {q.transcript ? "Record follow-up answer" : "Record answer"}
            </button>
          ) : (
            <button className="btn-danger" onClick={() => recRef.current?.stop()}>■ Stop ({fmt(recSec)})</button>
          )}
          {q.transcript && !recording && (
            <button className="btn-secondary" disabled={uploading} onClick={() => confirm("Replace the existing answer?") && startRec("answer")}>Re-record</button>
          )}
          {uploading && <Spinner label="Transcribing & scoring…" />}
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" disabled={busy || index === 0} onClick={onPrev}>← Prev</button>
            <button className="btn-secondary" disabled={busy || index === total - 1} onClick={onNext}>
              {q.transcript ? "Next →" : "Skip →"}
            </button>
          </div>
        </div>
        {recording && (
          <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 min-h-12">
            <span className="text-red-600 animate-pulse mr-2">● REC</span>{caption || <span className="text-slate-400">Listening… (live captions appear here in Chrome / Edge)</span>}
          </div>
        )}
        <div className="flex gap-2">
          <textarea className="input" rows={2} placeholder="Optional notes, or type the answer if audio fails" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn-secondary self-end" disabled={busy || !notes.trim()} onClick={submitNotes}>Submit notes</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="font-semibold">What a good answer covers</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {(q.expected_answer ?? "").split(/;|\n/).map((s) => s.trim()).filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div className="card space-y-2">
          <h3 className="font-semibold">Follow-ups</h3>
          {q.ai_follow_up && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-sm"><b>Suggested now:</b> {q.ai_follow_up}</div>
          )}
          <ul className="list-disc pl-5 text-sm space-y-1">{(q.follow_ups ?? []).map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      </div>

      {q.transcript && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2"><h3 className="font-semibold">Transcript</h3><ScorePill score={q.score} /></div>
          {q.reasoning && <p className="text-sm text-slate-600">{q.reasoning}</p>}
          <p className="text-sm whitespace-pre-line">{q.transcript}</p>
        </div>
      )}
    </div>
  );
}

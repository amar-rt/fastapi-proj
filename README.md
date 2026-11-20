# AI-Assisted L1 Interview System

Lets HR and non-technical interviewers run L1 technical interviews. The system prepares a brief,
generates tailored questions, records and transcribes each answer, scores it, and writes the report.
The interviewer always makes the final decision.

This is **Phase 1 (MVP)** of the proposal, built to run entirely on free tiers.

## Stack (all free)

| Layer | Choice | Free-tier notes |
|---|---|---|
| Hosting | **Vercel Hobby**: static React build + one Python serverless function | Hobby is for **non-commercial use** under Vercel's terms |
| Frontend | React 18 + TypeScript, Vite, Tailwind v4, Recharts | |
| Backend | FastAPI on the Vercel Python runtime (`api/index.py`) | 60 s max per request, 4.5 MB request body limit, no WebSockets |
| Relational + vector DB | **Neon Postgres** via Vercel Marketplace, with **pgvector** | 0.5 GB storage; one database covers both |
| LLM | **OpenAI open-weight `gpt-oss-120b` / `gpt-oss-20b`** served by **Groq** (free tier), called with the official `openai` SDK | Rate-limited per minute and per day |
| Speech-to-text | **Whisper large-v3-turbo** on Groq (free tier) | 25 MB per file; the app keeps each answer far below that |
| Live captions | Browser Web Speech API (Chrome / Edge) | Display only; Whisper produces the stored transcript |

> OpenAI's own API has **no free models**. Every OpenAI call is billed.
> Groq runs OpenAI's open-weight models and Whisper for free, behind an OpenAI-compatible API.
> To move to paid OpenAI later, change only the environment variables:
> `LLM_BASE_URL=https://api.openai.com/v1`, `LLM_MODEL_MAIN=gpt-4o-mini`, `STT_MODEL=whisper-1`.

### How the proposal's architecture was adapted for Vercel's free tier

| Proposal | This build | Why |
|---|---|---|
| Audio streamed over WebSocket | Each answer is recorded in the browser and uploaded when you press Stop | Vercel functions can't hold WebSockets |
| Self-hosted Whisper on a GPU | Whisper via the Groq API | No GPU on free hosting |
| Celery / ARQ + Redis workers | Each AI step is a separate short request (analysis, questions, per-answer score, report) | No background workers; every step fits in 60 s |
| CV / audio in object storage | CV text is stored in Postgres; audio is transcribed and then dropped | Vercel Blob's free tier is small. Add it in Phase 2 if you need recordings |
| Claude Sonnet / Haiku | gpt-oss-120b (analysis, questions, report) / gpt-oss-20b (per-answer scoring) | Free; the provider can be swapped with env vars |

**Data-protection note:** CVs (with name, email and phone redacted) and audio are sent to Groq for processing.
The proposal's "audio never leaves our servers" point does not hold on this free setup.
Check that this is acceptable under the DPDP Act / GDPR before using real candidate data.

## What's in the MVP

- Email/password login, roles (Super User, Interviewer), first-run Super User setup
- Job descriptions: must-have and nice-to-have skills, per-skill-area weights, pass threshold
- Add a candidate with a CV upload (PDF / DOCX / TXT), duplicate detection by email, interviewer assignment
- **Pre-interview:** CV vs. JD match %, skill-by-skill breakdown, highlights, red flags
- **Questions:** generated per section (intro / technical / wrap-up), each with skill, difficulty, expected-answer outline and follow-ups; edit, reorder, add and delete
- **Assisted interview:** 30 / 45 / 60 min with automatic section time split, consent capture, mic check, record → Whisper transcript → instant 1–5 score, AI-suggested follow-up, typed-notes fallback, resume after a dropped connection, auto-move to wrap-up, closing message
- **Report:** 1–5 score per skill area with comment and evidence, weighted overall score, updated match %, recommendation with confidence, strengths, gaps, L2 focus areas, skill radar chart
- **Decision:** Selected / Rejected toggle; a reason is required when you override the AI; full history kept
- Candidate list with all the proposal's filters (including AI vs. human disagreement), CSV export that opens in Excel
- Audit log; bias controls (identifiers redacted, prompts instructed to judge job-relevant content only)

## Setup

### 1. Accounts (free)
1. **Groq:** create an API key at https://console.groq.com/keys
2. **Vercel:** import this repo as a new project
3. **Neon:** in the Vercel project, open Storage → Create Database → Neon (Postgres). This adds `DATABASE_URL` to the project.

### 2. Create the tables
Paste `db/schema.sql` into the Neon SQL editor, or run:
```bash
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env    # fill in DATABASE_URL, JWT_SECRET, LLM_API_KEY
python scripts/init_db.py
```

### 3. Environment variables in Vercel (Project → Settings → Environment Variables)
`DATABASE_URL` (added by Neon; use the **pooled** URL), `JWT_SECRET`, `LLM_API_KEY`. Optional: `LLM_BASE_URL`, `LLM_MODEL_MAIN`, `LLM_MODEL_FAST`, `STT_MODEL`.

### 4. Deploy
Push to GitHub, and Vercel builds `frontend/` and deploys `api/index.py`. Open the site; the first visit asks you to create the Super User.

## Local development
```bash
# terminal 1: API on :8000
uvicorn --app-dir api _app.main:app --reload --port 8000
# terminal 2: UI on :5173 (proxies /api to :8000)
cd frontend && npm install && npm run dev
```
API docs: http://localhost:8000/api/docs

## Project layout
```
api/index.py              Vercel entrypoint
api/_app/main.py          FastAPI app
api/_app/routes/          auth, users/JDs/audit, candidates, interviews
api/_app/llm.py           OpenAI-SDK client (Groq by default): chat JSON + Whisper
api/_app/prompts.py       analysis / questions / per-answer / report prompts + redaction
api/_app/rubric.py        skill areas, default weights, weighted score
db/schema.sql             all 12 tables from the proposal (pgvector columns ready for Phase 3)
frontend/src/pages/       Candidates, CandidateNew, JobDescriptions, Users, AuditLog,
                          InterviewDetail (brief, questions, report, decision), InterviewRun
```

## Next phases
- **Phase 2:** AI-led mode (browser `speechSynthesis` reads questions aloud for free; end-of-speech detection with VAD), candidate join link, PDF report, dashboards
- **Phase 3:** question bank with pgvector similarity, calibration sampling, proctoring signals, retention job (Vercel Cron), AI cost tracking

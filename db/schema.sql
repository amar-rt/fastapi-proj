-- AI-Assisted L1 Interview System — schema for Neon Postgres (Vercel Marketplace, free tier)
-- Safe to re-run: every statement is idempotent.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          text NOT NULL CHECK (role IN ('super_user', 'interviewer')),
    sso_id        text,
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_descriptions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title          text NOT NULL,
    description    text NOT NULL,
    must_have      text[] NOT NULL DEFAULT '{}',
    nice_to_have   text[] NOT NULL DEFAULT '{}',
    skill_weights  jsonb NOT NULL DEFAULT '{}',   -- {"Communication": 1, "Database": 2, ...}
    pass_threshold numeric(3,2) NOT NULL DEFAULT 3.0,
    embedding      vector(384),                   -- reserved for Phase 3 semantic matching
    created_by     uuid REFERENCES users(id),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    email       text NOT NULL,
    phone       text,
    cv_filename text,
    cv_text     text NOT NULL,
    parsed_cv   jsonb,
    embedding   vector(384),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_uq ON candidates (lower(email));

CREATE TABLE IF NOT EXISTS interviews (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    jd_id           uuid NOT NULL REFERENCES job_descriptions(id),
    interviewer_id  uuid REFERENCES users(id),
    scheduled_at    timestamptz,
    duration_min    int CHECK (duration_min IN (30, 45, 60)),
    mode            text NOT NULL DEFAULT 'assisted' CHECK (mode IN ('assisted', 'ai_led')),
    status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'prepared', 'in_progress', 'completed', 'decided')),
    consent_at      timestamptz,
    recording_url   text,
    started_at      timestamptz,
    ended_at        timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interviews_interviewer_idx ON interviews (interviewer_id);

CREATE TABLE IF NOT EXISTS pre_interview_analysis (
    interview_id    uuid PRIMARY KEY REFERENCES interviews(id) ON DELETE CASCADE,
    match_percent   int,
    skill_breakdown jsonb,   -- [{skill, status: matched|partial|missing, note}]
    highlights      jsonb,   -- [string]
    red_flags       jsonb,   -- [string]
    summary         text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    section         text NOT NULL CHECK (section IN ('intro', 'technical', 'wrapup')),
    text            text NOT NULL,
    skill           text,
    difficulty      text CHECK (difficulty IN ('easy', 'medium', 'hard')),
    expected_answer text,
    follow_ups      jsonb NOT NULL DEFAULT '[]',
    sort_order      int NOT NULL DEFAULT 0,
    source          text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'bank')),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_interview_idx ON questions (interview_id, sort_order);

CREATE TABLE IF NOT EXISTS answers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  uuid NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
    interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    transcript   text NOT NULL,
    segments     jsonb,       -- whisper segments with timestamps
    duration_sec numeric,
    score        int CHECK (score BETWEEN 1 AND 5),
    reasoning    text,
    evidence     text,
    follow_up    text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluations (
    interview_id      uuid PRIMARY KEY REFERENCES interviews(id) ON DELETE CASCADE,
    skill_scores      jsonb NOT NULL,  -- [{skill, score, comment, evidence}]
    overall_score     numeric(3,2),
    match_percent     int,
    ai_recommendation text CHECK (ai_recommendation IN ('next_round', 'hold', 'reject')),
    confidence        int,
    reason            text,
    strengths         jsonb,
    gaps              jsonb,
    l2_focus          jsonb,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    decided_by   uuid NOT NULL REFERENCES users(id),
    decision     text NOT NULL CHECK (decision IN ('selected', 'rejected')),
    overrides_ai boolean NOT NULL,
    reason       text,
    decided_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_interview_idx ON decisions (interview_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS question_bank (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jd_id           uuid REFERENCES job_descriptions(id) ON DELETE SET NULL,
    skill           text,
    text            text NOT NULL,
    difficulty      text,
    expected_answer text,
    embedding       vector(384),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_flags (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    type         text NOT NULL,
    detail       text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id         bigserial PRIMARY KEY,
    user_id    uuid REFERENCES users(id),
    action     text NOT NULL,
    entity     text,
    entity_id  text,
    ip         text,
    created_at timestamptz NOT NULL DEFAULT now()
);

> **This is the developer / setup guide.** For the project pitch, see [README.md](README.md).

# Sentinel: AI Security Analyst

Sentinel is a small web app that lets a signed-in user submit a security task: paste source code, drop
in files, paste a **GitHub repo URL**, or describe a system to threat-model. They get back a graded,
triaged findings report (severity, CWE, location, impact, fix) as a shareable HTML document plus
machine-readable JSON, and can ask follow-ups (fixed code, tests, PR text) in the same agent session.

The agent runs on **HarnessRouter Cloud**. The product keeps its own UI, identity and routes; the
agent only does the bounded "analyze and report" job.

- **Agent harness:** `qwen` (Qwen Code CLI) · **model:** `qwen3.8-max`
- **Harness ID:** `chrn_01a74a33efe94123a15d3d8958abe16d` (Workspace: *Default Workspace*)
- **Frontend/stack:** Next.js (App Router, TypeScript) on Vercel; serverless, so **background mode + polling** (no streaming)

> Authorized, defensive and educational security use only. The agent refuses malware, attacks on
> systems the user doesn't own, mass targeting, phishing/credential harvesting, and detection
> evasion for malicious ends (see `harness-instructions.txt`).

## How it connects

```
Browser ──► Next.js API route (server, Node runtime)
              • authenticates the user (signed httpOnly cookie = the product `user` id)
              • maps the feature to its harness_id (from harnessrouter.json)
              • repo scans: fetch github.com/{owner}/{repo} as tar.gz (allowlisted, 25 MB cap)
                  → POST /v1/files (purpose=user_data) → attached to the task as an input_file
              • POST https://api.harnessrouter.ai/v1/responses
                  Authorization: Bearer $HR_API_KEY   (from the server env, never the browser)
                  { input, user, metadata.harness_id, background: true, budgets }
              • persists the task record (response id + session id) under the user
            ◄── returns only the product taskId + sanitized status/result
Browser ──► polls GET /api/tasks/:taskId   (server polls GET /v1/responses/:id until terminal)
              • while running: GET /v1/sessions/:id/turns → tool *names* → friendly activity labels
              • on completion: lists session files, reads the agent's manifest.json + findings.json
              • serves the HTML report via a signed, sandboxed preview, and files via owner-checked downloads
```

The browser never sees the API key, a `harness_id`, a `session_id`/`response_id`, a `download_url`,
account-wide lists, or raw upstream errors. One user request = one task (`input` is what the user
typed); a **follow-up** reuses the stored `previous_response_id` + `session_id` to continue the same
session. Because Vercel functions can't hold a minutes-long stream, tasks run with `background: true`
and the client polls; each poll also *recovers* a task (settles it from `GET /v1/responses/:id`).

## Project layout

| Path | What |
|---|---|
| `lib/harnessrouter.ts` | HarnessRouter Cloud client (vendored from the official skill, Apache-2.0). SSE/background, file uploads, signed previews. Server-only. |
| `lib/service.ts` | The feature's server logic: start/continue a task, attach repo archives, poll+settle, live progress, findings, sanitize results. Holds the harness_id. |
| `lib/github.ts` | SSRF-safe GitHub repo archive fetch (codeload tar.gz, 25 MB cap, gzip check; `git clone --depth 1` fallback for networks that block GitHub HTTP). |
| `lib/samples*.ts` | Three bundled, real Sentinel reports served read-only so visitors can explore a finished report instantly. |
| `lib/task-store.ts` | Per-user task records. In-memory for dev; TiDB Serverless (MySQL) or Vercel KV / Upstash in production (auto-selected by env). |
| `lib/session.ts` | The product `user` id: a signed, httpOnly cookie set by the server. |
| `lib/secrets.ts` | Stable cookie / preview-signing secrets. |
| `app/api/tasks/*` | Start, list, poll/detail, continue, download routes. |
| `app/api/samples/*`, `app/sample-preview/*` | Read-only sample report detail, downloads and preview. |
| `app/preview/[token]/[[...path]]/*` | Signed, sandboxed HTML report preview. |
| `app/page.tsx` | Client orchestrator: scans, polling, follow-up thread (with retry), samples. |
| `app/_ui/*` | UI components: command bar (paste, drop files, GitHub URL), live scan progress, report (grade, severity tiles, findings, full report, files), follow-up replies, sidebar. |
| `shared/*` | Isomorphic, dependency-free logic used by server and UI: types, findings normalization and security grade, tool-activity labels, safe Markdown parser, GitHub URL parsing, failed-run messages. |
| `tests/*` | `node --test` suites: adapter, product, shared. |
| `harnessrouter.json` | The reviewed copy of the harness config (id, name, base, model, instructions). Committed. |
| `harness-instructions.txt` | Editable source of the harness's standing instructions. |
| `.agents/skills/harnessrouter/` | The HarnessRouter integration skill (reference + scripts), vendored for later changes. |

## Prerequisites

- Node 22+ and **pnpm** (`corepack enable pnpm`)
- A HarnessRouter API key (`sk-hr-…`) for your Workspace

## Local development

1. **Install**

   ```bash
   pnpm install
   ```

2. **Provide the HarnessRouter key** (server-side, never in the browser or chat). This repo uses the
   HarnessRouter skill's key file: a gitignored, owner-only `.env.harnessrouter` holding exactly one
   line, `HR_API_KEY=sk-hr-…`. It is already set up in this checkout. To (re)set it:

   ```bash
   python3 .agents/skills/harnessrouter/scripts/key_setup.py check --project .
   ```

   Alternatively set a real `HR_API_KEY` environment variable; it takes precedence.

3. **Signing secrets.** For a stable dev experience, `.env.local` holds `COOKIE_SECRET` and
   `PREVIEW_SIGNING_SECRET` (gitignored). Without them the app still works in dev (it generates
   per-process values). Regenerate with `openssl rand -hex 24` / `openssl rand -hex 32`.

4. **Run**

   ```bash
   pnpm dev      # http://localhost:3000
   ```

5. **Test**

   ```bash
   pnpm test     # adapter, product and shared unit tests (node --test)
   pnpm build    # type-check + production build
   ```

## Deploy to Vercel

Set these in **Project → Settings → Environment Variables** (the `.env.harnessrouter` file is
gitignored and not deployed, so production reads the key from the env var):

| Variable | Required | Notes |
|---|---|---|
| `HR_API_KEY` | ✅ | `sk-hr-…`; server-only secret. |
| `COOKIE_SECRET` | ✅ | Stable random; else sessions break between invocations. |
| `PREVIEW_SIGNING_SECRET` | ✅ | 64 hex chars; else preview links break between invocations. |
| `DATABASE_URL` (TiDB Serverless) **or** `KV_REST_API_URL` + `KV_REST_API_TOKEN` | ▲ recommended | Durable task store. TiDB Serverless (MySQL-compatible, HTTP serverless driver) is preferred; Vercel KV / Upstash also supported. Without one, task records are in-memory and won't survive across serverless invocations. `DATABASE_URL` wins if both are set. The `sentinel_tasks` table is auto-created on first use. |
| `HR_TASK_TIMEOUT_SECONDS` / `HR_TASK_MAX_STEP` / `HR_TASK_MAX_COST_USD` | optional | Per-task budget ceilings (defaults 3600 / 200 / 4; thorough repo reviews on `qwen3.8-max` take 15-25 min). |

pnpm is auto-detected from `pnpm-lock.yaml`. See `.env.example`. `POST /api/tasks` sets
`maxDuration = 60` because a repo scan downloads and uploads the archive before the task starts; the
function needs outbound HTTPS to `codeload.github.com` (Vercel allows this by default).

## Security model

- The API key lives only in the server environment and is sent only to `https://api.harnessrouter.ai`.
  It is never in the browser bundle, logs, generated files, or `harnessrouter.json`.
- Every route authorizes the signed-in user against the task record. A `session_id`/`response_id`
  is never exposed and never used as authorization.
- Generated HTML is served only through a **signed, short-lived, task-scoped URL** with a strict
  sandbox CSP (`sandbox allow-scripts allow-forms`, no `allow-same-origin`), so it can't reach the
  product's cookies or origin. Downloads go through owner-checked routes; the key fetches bytes
  server-side.
- The task's `user` is set by the server from the session, never from user input, so one person's
  (future) memory never reaches another's task.
- GitHub URLs are parsed with strict allowlist patterns (owner, repo, ref, sub-path; no `..`, no
  leading `-`) and the fetch URL is rebuilt server-side for GitHub only. Redirects must stay on
  GitHub, and archives are size-capped and gzip-checked. The `git` fallback uses `execFile`
  (no shell) with validated arguments.
- The live activity feed exposes tool *names* mapped to fixed labels, never arguments or output.
  Agent Markdown is rendered without raw HTML and with `http(s)`-only links. A failed run shows a
  plain sentence built from the upstream error code, never upstream text.

## Changing the harness

Instructions live on the harness in HarnessRouter, not in app code. The reviewed copy is
`harnessrouter.json`. To change the harness, **fetch it live first** (it may have been edited in the
console), keep the `ETag`, update `harnessrouter.json`, then PUT with `If-Match`:

```bash
python3 .agents/skills/harnessrouter/scripts/harness_config.py update \
  --project . --harness-id chrn_01a74a33efe94123a15d3d8958abe16d \
  --instructions harness-instructions.txt
```

## Note

The key for this Workspace was shared in chat during setup; **rotate it** in the HarnessRouter
console (API Keys) and update `.env.harnessrouter` (locally) / `HR_API_KEY` (Vercel).
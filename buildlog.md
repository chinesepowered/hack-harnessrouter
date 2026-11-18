# Sentinel build log

A record of how we built Sentinel on HarnessRouter during the hackathon: what we did and when, the
real numbers from our agent runs, what broke and how we fixed it, and candid feedback on
HarnessRouter itself. Everything here comes from the actual build: the session history, git log,
and the HarnessRouter API responses for our runs.

- **Product:** Sentinel, an agentic security analyst. Paste code, drop in files, or paste a GitHub
  repo. A sandboxed agent audits it and returns a graded, triaged findings report with fixes, and
  you can ask the same agent for the hardened code.
- **Agent backend:** one HarnessRouter harness, `Security Analyst`
  (`chrn_01a74a33efe94123a15d3d8958abe16d`), base `qwen` (Qwen Code CLI), model `qwen3.8-max`,
  Workspace *Default Workspace*.
- **Stack:** Next.js 15 (App Router, TypeScript) for Vercel, TiDB Serverless for task records,
  ElevenLabs for the demo voiceover and music only.
- **Demo video:** [YouTube](https://www.youtube.com/watch?v=wMiJcJywn8Q) (about 2 minutes, real screen recordings).
- **How we built it:** the team directed an AI coding agent through HarnessRouter's own onboarding
  path: `agents.md` plus the integration Skill, vendored at `.agents/skills/harnessrouter/`.
- **Size:** 40 source files (about 4,500 lines of TypeScript and CSS, excluding bundled sample
  data), 28 unit tests, 12 commits.

---

## Timeline (Nov 18, 2026, UTC)

| Time | What happened |
|---|---|
| 02:10 | Kickoff with the HarnessRouter hackathon prompt. Read `agents.md` and the Skill (SKILL.md plus the API, runtime, files and security references). |
| 02:17 | Our coding assistant's own safety layer paused the session on a "cyber" flag and we had to resend the request. It happened again at 03:27. A small, real example of the over-refusal problem Sentinel is built to solve. |
| 02:25 | Stored the key in a gitignored, owner-only `.env.harnessrouter`. Discovery (`GET /v1/me`) answered 200 and reported `capabilities.memories: false`, so we send no `memory` field. |
| 02:30 | Created the harness with the Skill's `harness_config.py ensure`: name, base, model and standing instructions (output contract plus security guardrails and a `role_mismatch` rule). Saved the reviewed copy as `harnessrouter.json`. |
| 02:30-03:20 | Built the app: Next.js API routes call `POST /v1/responses` with `background: true` and poll `GET /v1/responses/{id}`. Added signed, sandboxed report previews, owner checks on every route, and a signed cookie id sent as `user`. |
| 03:05 | Bug: cookie and preview signatures failed between routes. Each route bundle had generated its own fallback secret. Fixed with one stable secrets module. |
| 03:18 | First real data on timing: thorough reviews on `qwen3.8-max` took about 4-20 minutes. One run finished in 1,069 s for $0.44; another hit our initial 20-minute cap and ended `incomplete`. We raised budgets to 3,600 s / 200 steps / $4. |
| 03:24 | Verified end to end through the app's own routes: a completed review (231 s, 10 findings, 2 Critical), preview 200 with the sandbox CSP, tampered token 404, another user 404, and no upstream ids in any response. |
| 03:30-04:14 | Judges README and the first demo video (slides plus UI stills). Merged to `main`. |
| 04:16-04:22 | Added TiDB Serverless as the durable store (HTTP serverless driver, so no connection pool to exhaust from Vercel functions). |
| 18:02-18:07 | Verified TiDB live: created the `harnessrouter` database and round-tripped a real task record through the app. |
| 18:50 | Started v2: rebuild the UI from scratch, add GitHub repo scanning, and make a demo video from real screen recordings. |
| 18:55-19:05 | Upgraded the harness instructions twice (richer `findings.json` schema, a follow-up rule that keeps the original report intact, and a rule for repo archives). Each change was fetch, ETag, `If-Match` PUT, read-back: status `UPDATED`, no live drift. Started real background runs while building. |
| 19:00-20:06 | New UI: command bar with GitHub URL detection, a live scan view fed by session turns, a report with an A-F grade, severity tiles and finding cards, the full report, files, one-click next steps and a follow-up thread. Repo scanning uploads the archive with `POST /v1/files` and attaches it as an `input_file`. |
| 20:00 | A repo follow-up failed after 38 minutes with `provider_error`. We used it to fix our failure UX (details below). |
| 20:06-20:45 | Merged the team's style pass (no em dashes), re-recorded the demo on the final build, generated captions from narration word timings, and shipped the video. |
| 20:47 | A second repo follow-up failed at 33.8 minutes with the same `provider_error`. This time the new failure UX handled it as designed: a plain message and a **Try again** button. |

---

## How Sentinel uses HarnessRouter

| HarnessRouter feature | What Sentinel does with it |
|---|---|
| Harness resource (`POST`/`GET`/`PUT /v1/harnesses`, `ETag` + `If-Match`) | The whole agent: base, model, instructions, guardrails, budgets. Updated twice after creation, with no app deploy. |
| `POST /v1/responses` with `background: true` | Every scan and follow-up. Serverless-friendly: the function returns in milliseconds. |
| `GET /v1/responses/{id}` | Polling, and recovery: every poll can settle a finished task even if the original request died. |
| `Idempotency-Key` | Sent with every new task and stored with the record, so retries never start a second run. |
| `POST /v1/files` + `input_file` | A pasted GitHub repo becomes one tarball upload (up to 25 MB) that appears in the agent's working directory. |
| `GET /v1/sessions/{id}/turns` | The live activity feed (tool names mapped to friendly labels, never arguments) and accurate "Completed in" times from `completed_at`. |
| `GET /v1/sessions/{id}/files`, `?changed=true`, file content | Reading `findings.json` and `manifest.json`, the sandboxed HTML preview, downloads, and separating follow-up outputs from the original report. |
| `previous_response_id` + `metadata.session_id` | Follow-ups ("show the fixed code") run in the same sandbox with the repo and the report still on disk. |
| `max_step`, `timeout_seconds`, `max_cost_usd`, `incomplete_details.reason` | Per-task ceilings, plus a "stopped early, partial results" state in the UI. |
| `POST /v1/responses/{id}/cancel` | Cancelling runs we started only to record the demo, so they don't burn their full budget. |
| `user` | The signed-in person's id on every task, set by the server, never by the browser. |

---

## Real runs

Durations are from turn timestamps. Spend is what `GET /v1/sessions/{id}` reports, which is the
**session total**, so a scan plus its follow-up share one number.

| Run | Input | Duration | Result | Tokens (in / out / cache read) | Session spend |
|---|---|---|---|---|---|
| Express API review (v1) | pasted file | 231 s and 1,069 s | 10 findings, 2 Critical | n/a | $0.44 (1,069 s run) |
| Container review | Dockerfile + compose | 13.7 min | 17 findings | 76k / 36k / 0.66M | $0.54 |
| Invoice API audit | pasted `app.py` | 14.3 min | 15 findings | 65k / 36k / 1.2M | $2.13 for both turns |
| ↳ follow-up: hardened code | same session | 23.7 min | 545-line drop-in, 41-test suite, 87 offline assertions passed | 135k / 60k / 3.4M | (included above) |
| `we45/Vulnerable-Flask-App` audit #1 | GitHub repo | 16.4 min | 20 findings, 5 Critical | 89k / 38k / 1.9M | $4.03 for both turns |
| ↳ follow-up: hardened code | same session | failed at 38.3 min | `provider_error` | 208k / 92k / 8.7M | (included above) |
| `we45/Vulnerable-Flask-App` audit #2 | GitHub repo | 25.5 min | 24 findings, 6 Critical, PoCs reproduced in the sandbox | 141k / 55k / 3.6M | $4.05 for both turns |
| ↳ follow-up: hardened code | same session | failed at 33.8 min | `provider_error` | 207k / 79k / 6.6M | (included above) |
| Audit #3 | GitHub repo | cancelled at ~7 min | used for the live-feed shot | n/a | n/a |

What this taught us about the product:
- **Per-task costs.** A single-file review costs roughly $0.50-0.75; a whole-repo audit with
  sandboxed proof-of-concept testing is roughly $1-2. Writing a full hardened version plus tests is
  the most expensive step. The per-turn figures are estimated from token shares, because spend is
  only reported per session.
- **Long follow-ups are fragile.** Writing a complete hardened version plus tests ran 24-38 minutes,
  and two of three such runs hit provider errors. In production we'd scope them smaller (one file
  or one finding at a time) and give them a tighter time budget.
- **Duration.** A task takes 4-26 minutes, so background mode is the only sane design on serverless,
  and the UI must make waiting feel productive (live activity, "you can leave this page").
- **Real work in the sandbox.** The agent ran the target code there: it rendered `{{7*7}}` as 49 to
  prove template injection, forged a JWT with the leaked key, and ran its own regression tests.
  That's the edge we were after.

---

## Problems we hit, and fixes

| Problem | Fix |
|---|---|
| Cookie and preview signatures failed between routes (each Next route bundle generated its own random fallback secret). | One shared secrets module, with stable `COOKIE_SECRET` and `PREVIEW_SIGNING_SECRET` env vars in production. |
| A review hit our 20-minute time cap and ended `incomplete`. | Budgets raised to 3,600 s / 200 steps / $4, configurable by env. The UI shows partial results instead of an error. |
| Task records live in memory by default, which breaks on serverless (polls land on other instances). | TiDB Serverless via its HTTP driver, with Vercel KV as a fallback. |
| The sandbox network blocks GitHub's archive host. | A `git clone --depth 1` fallback (validated args, no shell). On Vercel the archive path is used. |
| "Completed in" times were wrong when a task was settled late. | Use the turn's `completed_at` from the session turns. |
| A follow-up failed with `provider_error`. Our UI showed the agent's half-finished last sentence as the error, and blocked further follow-ups because the latest turn was not continuable. | Failed runs now show a plain sentence built from the error code. A **Try again** button re-asks from the last good turn, since HarnessRouter appends to the session either way. Failed scans can be re-run. |
| The report iframe flashed white before the agent's HTML loaded. | Keep the iframe hidden until `onLoad`, with a dark loading state. |
| Agent output is untrusted. | A safe Markdown renderer (no raw HTML, `http(s)` links only), schema normalization and length caps for findings, and labels built from tool names only. |

---

## Feedback for HarnessRouter

### What worked really well

1. **The harness as a resource.** Base, model, instructions, tools and budgets live on the server,
   and changes are `PUT` + `If-Match`. The Skill's `harness_config.py` does
   fetch-diff-PUT-read-back and reports drift (`live_changed_since_file`). We changed the agent's
   behavior twice mid-hackathon without touching app code. This is the strongest part
   of the product.
2. **Background mode plus polling.** It fits Vercel perfectly. Each poll is short, and polling
   doubles as crash recovery. The `Idempotency-Key` replay rules are precise and easy to implement
   correctly.
3. **Files in, files out.** `POST /v1/files` plus `input_file` took a whole repo tarball straight into
   the sandbox. Listing session files with `?changed=true` cleanly separated a follow-up's output
   from the original report.
4. **Sessions that remember the workspace.** Because a follow-up runs in the same sandbox, "now give
   me the fixed code" works with full context (the repo, the agent's own report, its scratch
   tests). That turned a one-shot scanner into a conversation.
5. **Budgets with reasons.** `incomplete_details.reason` let us turn "ran out of time" into a useful
   partial-results state instead of an error.
6. **The onboarding docs.** `agents.md`, the Skill references (the error table with retryable codes,
   `409 session_busy`, `412` handling) and the vendored Node adapter made an agent-driven
   integration fast and safe by default. Discovery (`/v1/me` capabilities) made feature gating
   explicit.
7. **Model routing.** Being able to pick `qwen3.8-max` on the Qwen Code CLI base is the entire
   business case for Sentinel: a model that does hands-on security work, with our guardrails kept
   on the harness.

### Friction and suggestions (most important first)

1. **Long runs can fail with no recovery.** Two of our three "hardened code" follow-ups died with
   `provider_error` ("Your model's provider failed during this task. Nothing was retried elsewhere.
   Try again."). They were also our longest runs: 33.8 and 38.3 minutes, about 200k input and
   6.6-8.7M cache-read tokens each. The one that finished took 23.7 minutes. That pattern suggests
   very long turns are fragile on this base and model. The files each run wrote stayed in the
   session, but the turn is just `failed`. We could not tell which step failed, or how much of
   the session's spend (about $2-3 of a $4 session) went to the failed turn. Suggestions:
   - transparent retry or failover for transient provider errors;
   - or a resume of a failed turn from its last completed step;
   - and the failing step, the spend so far and a retryable hint on the error object.
2. **Progress for background tasks.** `GET /v1/responses/{id}` carries no progress, so our live feed
   polls `/v1/sessions/{id}/turns` and maps tool names. A small `progress` block on the response
   (step count, current tool name, last activity time) would help. So would a cursor-based events
   endpoint (`GET /v1/responses/{id}/events?after=…`), which gives serverless apps streaming-like
   UX without holding a connection.
3. **Completion webhooks.** A 20-minute task polled from serverless means many short invocations,
   and nothing happens if no browser is open. A signed webhook on terminal status would let
   products settle results and notify users ("your audit is ready") without polling.
4. **Per-turn cost, as a number.** Spend is reported per session (cumulative across follow-ups), and
   `spend_usd` is a string on `GET /v1/sessions/{id}` but a number in other listings (the docs warn
   about this). A numeric `cost_usd` on each response would make per-scan metering exact; we had to
   estimate per-turn costs from token shares for our unit economics.
5. **`completed_at` on responses.** Responses carry `created_at` but no completion time. We read
   `completed_at` from the session's turns to show accurate durations.
6. **One status vocabulary.** Responses use `completed`, `failed`, `cancelled`; sessions and turns
   use `done`, `cancelled`. A single vocabulary, or one documented mapping table, would remove a
   class of bugs.
7. **Make follow-up continuation explicit.** A follow-up always continues after the session's latest
   turn, whatever `previous_response_id` names. That is sensible, but it surprised us while
   building "retry after a failed follow-up". Echoing a warning when `previous_response_id` isn't
   the latest turn would make it explicit, and first-class branching would be a welcome addition.
8. **Typical durations and costs per base and model.** Our tasks ran 4-26 minutes, and our first
   20-minute cap was too tight. Published typical ranges (or an estimate endpoint), plus guidance on
   `reasoning_effort` for speed versus depth, would help teams set budgets and UX expectations.
9. **Key handoff for cloud coding agents.** The onboarding asks the agent to open a secure secret
   prompt, but a cloud coding-agent session has no terminal prompt, so the key ended up pasted in
   chat. Our agent's safety layer also refused to run the downloaded `key_setup.py` against the
   secret. A documented non-interactive path would make agent onboarding smoother and safer: set
   an env var, then run a one-line `curl /v1/me` check that prints only the workspace. A browser or
   device-code key handoff would be even better.
10. **A hosted safe-render endpoint.** The adapter's signed-preview pattern worked well, but every
    product that shows agent-generated HTML has to rebuild the proxy, CSP sandbox and expiring
    tokens. A first-party, short-lived, CSP-sandboxed URL for a session file would save that work.
11. **Memory on Cloud.** Discovery reported `memories: false`, so returning users don't get memory
    yet. Discovery made that clear, and per-user memory (findings already triaged, accepted risks)
    would make Sentinel noticeably better for repeat scans.

---

## What we'd build next

- A GitHub App that scans every pull request and comments with the findings that matter.
- Completion notifications (webhooks plus email), so long audits don't need an open tab.
- Per-scan metering using per-turn costs, with team workspaces and a scan quota per seat.
- Re-scan diffs: what got fixed and what's new since the last audit, using per-user memory once
  Cloud supports it.

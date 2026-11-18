# Sentinel: 2-minute demo narration

Voiceover: ElevenLabs voice "Jessica" (young female). ElevenLabs is **not** a sponsor; used for
the demo voiceover only. Total runtime ~2:16.

| # | Visual | Narration |
|---|---|---|
| 1 | Title | Every developer ships bugs. Every bug-bounty hunter hunts them. But the AI tools that should help? The moment you ask them to actually analyze an exploit, they refuse. Meet Sentinel: the security analyst that does the work. |
| 2 | Problem | Here's the catch with security: it's dual-use. So the big Western models play it safe, and over-refuse. Ask one to trace an injection in your own code, and you get a lecture instead of an answer. |
| 3 | Our edge | Sentinel takes a different route, literally. Through HarnessRouter, we point the agent at an open model, Qwen 3.8 Max, that engages with hands-on security analysis instead of dodging it. Same guardrails… but it actually helps. That's our edge. |
| 4 | **App UI**: paste code | Using it is simple. Paste in code, a config, a Dockerfile, or logs. Here's a tiny Express server with a couple of classic mistakes. And hit Analyze. |
| 5 | **App UI**: analyzing | Behind the scenes, HarnessRouter spins up a sandboxed agent with a shell and file tools. It reads your code, reasons step by step, and writes a full report. A task can take minutes, so we run it in the background and poll. |
| 6 | **App UI**: the report | And here it is. Ten findings, ranked by severity. Two criticals: unauthenticated command injection, and SQL injection. Each with the exact line, why it matters, and the fix. Downloadable as a report, and as JSON. |
| 7 | Why HarnessRouter | The entire agent backend is one HarnessRouter harness. The model, the instructions, the tools, the safety rules: they live on the harness as a resource, not buried in our code. Swapping models, or tightening a guardrail, is a single API call. That's why we built on HarnessRouter. |
| 8 | Use cases / business | Two ways people use it, and pay for it. One: audit your own projects before they ship. Two: hunt bug bounties under authorization, where a single valid finding can pay for years of scans. Our team has been paid by OpenAI's own bug-bounty program. |
| 9 | Guardrails | And to be clear: Sentinel refuses malware, unauthorized access, and mass targeting. It's built for authorized, defensive security. Just without the false refusals. |
| 10 | Close | Sentinel. The security analyst that teams and hunters will actually pay for. Powered by HarnessRouter, and Qwen. |

Scenes 4-6 are the **actual product UI** (pasting code, the live "Analyzing…" state, and the real
generated security report rendered in the sandboxed preview). `sentinel-ui-walkthrough.mp4` is a
raw, silent screen recording of the same UI.

# Sentinel: 2-minute demo narration

Voiceover: ElevenLabs voice "Jessica" (young female). ElevenLabs is **not** a sponsor; it is used for
the demo voiceover and music bed only. Runtime is about 1:54. Captions are burned in and synced word by word to the
narration, and an instrumental music bed sits under the voice.

Every product scene is a **real screen recording** of the production build talking to
HarnessRouter. Nothing is mocked: the repo scans are live runs of `qwen3.8-max` on the public
[`we45/Vulnerable-Flask-App`](https://github.com/we45/Vulnerable-Flask-App) repository, and the
follow-up scene is a real run on an earlier scan of a pasted invoice API. The only
edit to time is the "25 minutes later" card, which skips the wait while the agent works.

| # | Visual | Narration |
|---|---|---|
| A | Title card | This is Sentinel: an AI security analyst that actually does the work. |
| B | The problem: a frontier model refusing to trace an injection in your own code | Ask most AI models to trace an exploit in your own code, and you'll get a lecture instead of an answer. Security is dual use, so they over-refuse. |
| C | Our edge: Sentinel → HarnessRouter → Qwen Code CLI on `qwen3.8-max` | Sentinel takes a different route. Through HarnessRouter, it runs Qwen 3.8 Max on the Qwen Code CLI: an agent that engages with real security work, inside our guardrails. |
| D | **App:** paste a GitHub URL, the repo chip appears, click *Scan repository* | Paste code, drop in files, or just paste a GitHub repo. Sentinel fetches it, and hands it to an isolated, sandboxed agent. |
| E | **App:** the live scan view; a real tool call lands in the activity feed | You can watch it work in real time. Every line here is a real tool call from the agent's sandbox: reading files, running checks, writing the report. |
| F | "25 minutes later…" | (music) |
| G | **App:** the report: grade F, 24 findings, Critical filter, an expanded finding with its fix | Here's the verdict. Twenty-four findings, six of them critical: remote code execution, SQL injection, a JWT bypass. Every finding has the exact file and line, the impact, and the fix. |
| H | **App:** the agent's full HTML report in the sandboxed preview, then the Files tab | Open the full report in a locked-down sandbox, or grab the machine-readable findings for your pipeline. |
| I | **App:** *Show the fixed code* on an earlier scan of a pasted invoice API, and the same agent's reply: a hardened drop-in with a regression suite and changelog | Then keep going. One click asks the same agent, in the same sandbox, for the hardened code, with a changelog. |
| J | Architecture: one HarnessRouter harness is the whole agent backend | Under the hood, the whole agent is a single HarnessRouter harness. The model, instructions, tools and guardrails live on the harness, not in our code. Our Next.js app on Vercel just starts tasks and polls, and TiDB keeps every scan. |
| K | The business: teams, bug-bounty hunters, unit economics | Teams pay for a security reviewer on tap. Bug bounty hunters pay because one valid finding covers years of scans. And our team has already been paid by OpenAI's bug bounty program. |
| L | Close | Sentinel. The security analyst that actually does the work. |

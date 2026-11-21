# Sentinel: pitch video v2 (1:36)

File: [`sentinel-pitch-v2.mp4`](sentinel-pitch-v2.mp4). A cinematic cold open (Wan 3.0 Prime via TokenRouter) cuts
straight into **real screen recordings** of the app, then the HarnessRouter and business beats, and closes on the
cinematic shield shot. Narration: ElevenLabs voice "Jessica"; captions are synced word by word.

| Time | Visual | Narration |
|---|---|---|
| 0:00 | Cinematic (Wan 3.0 Prime): 2:17 AM, an intrusion, his AI chat answers "REQUEST DENIED: I can't help with cybersecurity." Title: **HIS AI SAID NO.** | (sound design, no narration) |
| 0:10 | Cinematic: **SO HE SWITCHED.** He closes Claude and boots Sentinel; a teal shield and the SENTINEL interface tag CRITICAL findings. | (sound design) |
| 0:16 | White-flash match cut into the **real app**: paste a GitHub URL, the repo chip appears, *Scan repository*. | That's the movie. Here's the real thing. Sentinel does what Claude Code and Codex won't. Paste a GitHub repo, and a sandboxed Qwen agent on HarnessRouter starts hunting. |
| 0:28 | Real live scan view: a new tool call lands in the activity feed. | Every line here is a real tool call: reading code, running exploits, writing the report. |
| 0:35 | The real report: grade F, 24 findings, Critical filter, the SSTI finding verified with `{{7*7}}` = 49, and its fix. | Twenty-five minutes later: twenty-four findings, six critical. Remote code execution, SQL injection, a JWT bypass. The key ones are proven in the sandbox, and every finding comes with the exact file, line and fix. |
| 0:52 | The agent's full HTML report in the sandboxed preview, then the Files tab (`findings.json`). | A full report for your team, and JSON for your pipeline. |
| 0:59 | *Show the fixed code* and the same agent's reply: a hardened drop-in with a regression suite (an earlier scan of a pasted invoice API). | Then one click, and the same agent writes the hardened code and the tests. |
| 1:04 | Card: one harness is the whole agent backend; "75 min from the docs to a working agent". | The whole agent is one HarnessRouter harness: model, guardrails, sandbox and budgets. We went from the docs to a working agent in seventy-five minutes. |
| 1:14 | Card: $1-2 cost → $6 per repo audit, bug-bounty ROI, OpenAI bug-bounty badge. | A repo audit costs us one to two dollars, and sells for six. Bug bounty hunters pay, because one valid bug covers a year. And yes, we've been paid by OpenAI's bug bounty program. |
| 1:27 | Cinematic close: the network turns green, the shield over the city. Title: **SENTINEL**, "Does what Claude Code and Codex won't", HarnessRouter × Qwen 3.8 Max. | Sentinel. It does what Claude Code and Codex won't. |

## Full cut (2:24): `sentinel-pitch-full.mp4`

| Time | Visual | Narration |
|---|---|---|
| 0:00 | The full 30-second cinematic trailer. | (sound design) |
| 0:30 | Card: AI models over-refuse real security work (a frontier model refusing to trace an injection). | That's the movie. Here's the real problem: ask Claude Code or Codex to trace an exploit in your own code, and you get a lecture instead of an answer. Even while we built Sentinel, our coding assistant flagged us twice. |
| 0:44 | The real app: paste a GitHub URL, *Scan repository*. | Sentinel does what they won't. Paste a GitHub repo, and a sandboxed Qwen agent on HarnessRouter starts hunting. |
| 0:55 | Live scan, report, full report and files, as in v2. | v2 lines E, G, H |
| 1:25 | The fix follow-up, then a freeze-frame zoom on the agent's own test result, highlighted: "5 of 6 payloads bypassed the old f-string query, 0 of 6 reach a row through the new one". | Then one click, and the same agent writes the hardened code and the tests. It even checks its own fix: five of six injection payloads got through the old query, and none get through the new one. |
| 1:37 | Card: route the agent to a model that does the work (Sentinel → HarnessRouter → Qwen 3.8 Max), with the guardrails chip. | Why can Sentinel do this? It runs Qwen 3.8 Max on the Qwen Code CLI through HarnessRouter, a model that engages with real security work. And our guardrails live on the harness, so it still refuses malware and unauthorized targets. |
| 1:53 | HarnessRouter and business cards, as in v2. | v2 lines J, K |
| 2:15 | End card: Sentinel, "It does what Claude Code and Codex won't." | Sentinel: built in a day on HarnessRouter, already finding real bugs. It does what Claude Code and Codex won't. |

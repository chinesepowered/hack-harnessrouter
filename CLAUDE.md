# Sentinel

AI Security Analyst web app (Next.js App Router, TypeScript, Vercel). Package manager: **pnpm**.
Use **uv** for any Python work. The agent backend is HarnessRouter Cloud.

- `pnpm dev` / `pnpm build` / `pnpm test`
- Server code (anything under `lib/` and route handlers) is the only place the HarnessRouter key is
  used. Never import `lib/*` server modules into client components. Never expose the key, a
  `harness_id`, upstream ids, or `download_url`s to the browser.

<!-- harnessrouter:begin -->
Agent features run on HarnessRouter Cloud. The setups are in harnessrouter.json (harness_id, name,
base, model, instructions). Reuse them before creating new Harnesses. To change one, fetch it live,
update harnessrouter.json, PUT the whole Harness, and read it back. Every task sends the signed-in
end user's id as `user`. The API key is HR_API_KEY in the server environment (.env.harnessrouter
locally); never ask for it in chat.

Feature: "Security Analyst", harness_id chrn_01a74a33efe94123a15d3d8958abe16d, base qwen, model
qwen3.8-max, Workspace "Default Workspace". Deliverables are written under ./report/ in the agent's
workspace (entry index.html + findings.json + manifest.json). The server runs tasks in background
mode and polls GET /v1/responses/:id (serverless: no streaming). The integration skill is vendored
at .agents/skills/harnessrouter/; read its SKILL.md before changing the harness or the integration.
<!-- harnessrouter:end -->

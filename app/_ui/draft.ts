// Client-side composition of a scan request. Attached text files are read in the browser and
// inlined as labelled fences — nothing is uploaded until the user presses Analyze.

export interface Attachment {
  name: string;
  size: number;
  content: string;
}

const LANG: Record<string, string> = {
  py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
  yml: 'yaml', yaml: 'yaml', json: 'json', sh: 'bash', bash: 'bash', go: 'go', rb: 'ruby', java: 'java', php: 'php',
  rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', kt: 'kotlin', sql: 'sql', tf: 'hcl', dockerfile: 'dockerfile',
  html: 'html', xml: 'xml', toml: 'toml', ini: 'ini', env: 'bash', swift: 'swift', vue: 'vue', svelte: 'svelte',
};

export const MAX_FILE_BYTES = 300 * 1024;
export const MAX_FILES = 8;
export const MAX_INPUT_CHARS = 100_000;

function fence(a: Attachment): string {
  const ext = a.name.includes('.') ? a.name.split('.').pop()!.toLowerCase() : a.name.toLowerCase();
  return `File: ${a.name}\n\`\`\`${LANG[ext] || ''}\n${a.content.replace(/\s+$/, '')}\n\`\`\``;
}

export function composeInput(text: string, atts: Attachment[]): string {
  const t = text.trim();
  if (!atts.length) return t;
  const lead = t || 'Review these files for security vulnerabilities — rank findings by severity and give concrete fixes.';
  return `${lead}\n\n${atts.map(fence).join('\n\n')}`;
}

export async function readFiles(list: FileList | File[]): Promise<{ ok: Attachment[]; rejected: string[] }> {
  const ok: Attachment[] = [];
  const rejected: string[] = [];
  for (const f of Array.from(list).slice(0, MAX_FILES)) {
    if (f.size > MAX_FILE_BYTES) { rejected.push(`${f.name} (over ${MAX_FILE_BYTES / 1024} KB)`); continue; }
    try {
      const content = await f.text();
      if (content.includes('\u0000')) { rejected.push(`${f.name} (binary)`); continue; }
      ok.push({ name: f.name.replace(/[\r\n`]/g, '_').slice(0, 120), size: f.size, content });
    } catch {
      rejected.push(f.name);
    }
  }
  return { ok, rejected };
}

// ── examples (also the demo targets) ─────────────────────────────────────────────────────────
export const FLASK_APP = `# acme-billing/app.py — tiny invoice API (demo target with deliberate bugs)
import hashlib
import os
import sqlite3

import jwt
import requests
from flask import Flask, jsonify, request, send_file

app = Flask(__name__)
app.config["DEBUG"] = True
SECRET = "acme-dev-secret-2024"  # signs session tokens
db = sqlite3.connect("billing.db", check_same_thread=False)


def current_user():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    return jwt.decode(token, SECRET, algorithms=["HS256", "none"],
                      options={"verify_signature": False})


@app.post("/login")
def login():
    username = request.json["username"]
    password = request.json["password"]
    row = db.execute(
        f"SELECT id, pw_hash FROM users WHERE name = '{username}'"
    ).fetchone()
    if row and row[1] == hashlib.md5(password.encode()).hexdigest():
        return jsonify(token=jwt.encode({"uid": row[0]}, SECRET))
    return jsonify(error="bad credentials"), 401


@app.get("/invoices/<int:invoice_id>")
def get_invoice(invoice_id):
    current_user()  # make sure the caller is logged in
    invoice = db.execute(
        "SELECT * FROM invoices WHERE id = ?", (invoice_id,)
    ).fetchone()
    return jsonify(invoice)


@app.post("/webhooks/test")
def test_webhook():
    url = request.json["url"]
    resp = requests.get(url, timeout=5)
    return resp.text


@app.get("/export")
def export_csv():
    name = request.args.get("file")
    return send_file(os.path.join("/srv/exports", name))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
`;

const DOCKERFILE = `FROM node:18
WORKDIR /app
COPY . .
RUN npm install
ENV DATABASE_URL=postgres://admin:SuperSecret123@db:5432/prod
ENV NODE_ENV=development
USER root
EXPOSE 3000 9229
CMD ["node", "--inspect=0.0.0.0:9229", "server.js"]
`;

const COMPOSE = `services:
  web:
    build: .
    ports: ["3000:3000", "9229:9229"]
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  db:
    image: postgres:latest
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: SuperSecret123
`;

const att = (name: string, content: string): Attachment => ({ name, size: new Blob([content]).size, content });

export interface Example {
  key: string;
  title: string;
  blurb: string;
  icon: 'repo' | 'api' | 'box' | 'model';
  text: string;
  attachments: Attachment[];
}

export const EXAMPLES: Example[] = [
  { key: 'repo', title: 'Audit a GitHub repo', blurb: 'Paste a public repo URL — Sentinel fetches and audits it.', icon: 'repo',
    text: 'Audit this repo before we deploy it: https://github.com/we45/Vulnerable-Flask-App', attachments: [] },
  { key: 'flask', title: 'Flask invoice API', blurb: 'Auth, SQL injection, SSRF & path traversal in one file.', icon: 'api',
    text: 'Audit our invoice API before we ship — rank findings by severity and give concrete fixes.', attachments: [att('app.py', FLASK_APP)] },
  { key: 'docker', title: 'Container setup', blurb: 'Dockerfile + compose hardening before production.', icon: 'box',
    text: 'Review our container setup before we deploy to production.', attachments: [att('Dockerfile', DOCKERFILE), att('docker-compose.yml', COMPOSE)] },
  { key: 'model', title: 'Threat-model an API', blurb: 'Public REST API, JWT auth, uploads, Postgres.', icon: 'model',
    text: 'Threat-model a SaaS web app with a public REST API, JWT authentication, file uploads and a PostgreSQL database. Identify the main risks (mapped to OWASP) and the controls we should add.', attachments: [] },
];

// ── follow-up actions on a finished report ───────────────────────────────────────────────────
export const NEXT_STEPS = [
  { key: 'fix', title: 'Show the fixed code', blurb: 'A hardened drop-in replacement, with a changelog.',
    prompt: 'Show me the hardened, fixed version of the code as a complete drop-in replacement, and list what changed.' },
  { key: 'tests', title: 'Write regression tests', blurb: 'Tests that fail now and pass once fixed.',
    prompt: 'Write automated regression tests that prove the Critical and High findings are fixed — they should fail on the current code and pass once it is fixed.' },
  { key: 'pr', title: 'Draft the PR description', blurb: 'Summary, changes by finding, test plan.',
    prompt: 'Draft a pull request description for fixing these findings: a short summary, the changes grouped by finding ID, and a testing checklist.' },
  { key: 'explain', title: 'Explain the top risk', blurb: 'Plain-language walkthrough for the team.',
    prompt: 'Explain the single most severe finding in plain language for a non-security engineer: what it is, how it could be exploited, and why the fix works.' },
] as const;

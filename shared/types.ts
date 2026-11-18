// Isomorphic types shared by the server routes and the browser UI.
// These describe ONLY what the browser may see: never the API key, a harness_id, upstream
// response/session ids, or raw download_urls.

export type TaskStatus = 'starting' | 'in_progress' | 'completed' | 'incomplete' | 'failed' | 'cancelled';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type SeverityCounts = Record<Severity, number>;
export type Renderer = 'html' | 'markdown' | 'json' | 'code' | 'image' | 'pdf' | 'csv' | 'text' | 'file';

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  cwe: string;
  location: string;
  description: string;
  impact: string;
  recommendation: string;
  fix: string;
  references: string[];
}

export interface ClientFile {
  path: string;
  filename: string;
  bytes: number;
  kind: Renderer;
  downloadPath: string;
}

export type ActivityKind = 'plan' | 'read' | 'run' | 'search' | 'write' | 'other';

export interface Activity {
  kind: ActivityKind;
  label: string;
  count: number;
}

/** Live, sanitized agent progress (derived from the session's tool calls; no raw arguments). */
export interface Progress {
  phase: 'starting' | 'running';
  steps: number;
  stage: 0 | 1 | 2 | 3; // 0 sandbox · 1 reading · 2 analyzing · 3 writing the report
  activities: Activity[];
}

/** Where a scan's code came from (shown as a chip; safe to expose). */
export interface TaskSource {
  kind: 'github';
  repo: string; // owner/name
  ref: string | null;
  subpath?: string | null; // a folder inside the repo the scan focused on
}

export interface ClientDetail {
  source?: TaskSource;
  taskId: string;
  status: TaskStatus;
  input: string;
  createdAt: number;
  updatedAt: number;
  answer?: string;
  roleMismatch?: boolean;
  title?: string;
  summary?: string;
  incompleteReason?: string;
  canContinue: boolean;
  parentTaskId?: string;
  files: ClientFile[];
  previewUrl?: string;
  previewFilename?: string;
  findings?: Finding[];
  counts?: SeverityCounts;
  progress?: Progress;
  sample?: boolean;
}

export interface ClientSummary {
  source?: TaskSource;
  taskId: string;
  status: TaskStatus;
  createdAt: number;
  inputPreview: string;
  title?: string;
  parentTaskId?: string;
  counts?: SeverityCounts;
  sample?: boolean;
}

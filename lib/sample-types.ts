import type { TaskSource } from '../shared/types';

export interface SampleFile {
  path: string; // e.g. report/index.html
  filename: string;
  mediaType: string;
  bytes: number;
  b64: string;
}

/** A real, finished Sentinel analysis bundled with the app (read-only, public). */
export interface SampleRecord {
  id: string;
  title: string;
  summary: string;
  input: string;
  answer: string;
  createdAt: number;
  updatedAt: number;
  findingsRaw: unknown; // the agent's report/findings.json, normalized at load
  entry: string; // relative to report/, e.g. index.html
  files: SampleFile[];
  source?: TaskSource;
}

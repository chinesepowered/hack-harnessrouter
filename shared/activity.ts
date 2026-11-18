// Map the agent's raw tool names to friendly, sanitized activity labels for the live progress
// feed. Only the tool NAME is used, never its arguments or output.
import type { Activity, ActivityKind, Progress } from './types';

const RULES: Array<[RegExp, ActivityKind, string]> = [
  [/memor/i, 'other', 'Checking notes'],
  [/todo|tool_search|skill|plan/i, 'plan', 'Planning the review'],
  [/read|glob|grep|search_file|list|ls\b|cat|view|open/i, 'read', 'Reading the code'],
  [/write|edit|replace|patch|create_file|str_replace/i, 'write', 'Writing the report'],
  [/shell|bash|exec|command|terminal|run/i, 'run', 'Running analysis commands'],
  [/web|fetch|search|browse|extract/i, 'search', 'Looking up references'],
  [/agent|task|subagent|delegate/i, 'other', 'Delegating a sub-task'],
];

export function classifyTool(name: string): { kind: ActivityKind; label: string } {
  for (const [re, kind, label] of RULES) if (re.test(name)) return { kind, label };
  return { kind: 'other', label: 'Working' };
}

const STAGE: Record<ActivityKind, 0 | 1 | 2 | 3> = { plan: 1, read: 1, other: 1, run: 2, search: 2, write: 3 };

/** Build the browser-safe progress from the current turn's tool names and status. */
export function buildProgress(turnStatus: string | undefined, toolNames: string[]): Progress {
  const activities: Activity[] = [];
  let stage: 0 | 1 | 2 | 3 = turnStatus === 'starting' ? 0 : 1;
  for (const n of toolNames) {
    const { kind, label } = classifyTool(n);
    stage = Math.max(stage, STAGE[kind]) as 0 | 1 | 2 | 3;
    const last = activities[activities.length - 1];
    if (last && last.label === label) last.count++;
    else activities.push({ kind, label, count: 1 });
  }
  return {
    phase: turnStatus === 'starting' ? 'starting' : 'running',
    steps: toolNames.length,
    stage,
    activities: activities.slice(-6),
  };
}

/** Why an upstream run ended as `failed`, as a plain sentence. Built from the error *code* only:
 * upstream messages and a failed run's half-finished text are never shown to the user. */
export function failedRunMessage(error: unknown): string {
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code || '') : '';
  if (code === 'provider_error') return 'The model provider had an error partway through, so this run stopped. Try again: the agent picks up in the same session.';
  if (code === 'budget_exceeded' || code === 'timeout') return 'This run hit its time or cost budget before finishing. Try again, or narrow the request.';
  return 'The agent run failed before finishing. Please try again.';
}

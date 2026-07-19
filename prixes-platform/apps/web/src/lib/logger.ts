/**
 * Client-side error logging for debugging production issues without tracking PII.
 * Messages are logged to console in dev; in production, we could send to a debug endpoint.
 */

export function logError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, msg);
  // TODO: send to debug endpoint if in production & user opts in
}

export function logWarn(context: string, msg: string): void {
  console.warn(`[${context}]`, msg);
}

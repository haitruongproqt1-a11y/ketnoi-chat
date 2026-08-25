/**
 * Produces a backend-safe call ID: 8–96 characters drawn from [A-Za-z0-9_-].
 * The value is shared by offer, answer, candidates, hangup and persisted invite.
 */
export function createCallId(now = Date.now(), random = Math.random()): string {
  const suffix = Math.abs(random).toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 16).padEnd(8, "0");
  return `call_${now}_${suffix}`;
}

export function isValidCallId(value: string) {
  return /^[A-Za-z0-9_-]{8,96}$/.test(value);
}

/** Simple unique ID generator (no external dependency). */
export function createId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

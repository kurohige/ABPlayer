export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0s";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimeShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * A typed time, in seconds, or null when it cannot be read. Accepts what the
 * app itself shows ("1h 23m 45s", "1:23:45", "23:45") plus loose forms of
 * them ("1h23", "45m"). A bare number is minutes: nobody navigates an
 * audiobook by the second.
 */
export function parseTime(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);

  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const nums = parts.map(Number);
    // Only the leading part may run past 59 ("90:00" is an hour and a half)
    if (nums.slice(1).some((n) => n > 59)) return null;
    return nums.reduce((total, n) => total * 60 + n, 0);
  }

  // Number + optional unit, read one token at a time so digits are never split
  // between two units. A unit may be left off after the first: "1h23" is
  // 1h 23m, "5m30" is 5m 30s. Units must run from large to small.
  const UNITS = ["h", "m", "s"];
  const SECONDS = [3600, 60, 1];
  const token = /(\d+)\s*([hms]?)\s*/y;
  let pos = 0;
  let last = -1;
  let total = 0;
  while (pos < t.length) {
    token.lastIndex = pos;
    const m = token.exec(t);
    if (!m) return null;
    const unit = m[2] ? UNITS.indexOf(m[2]) : last === -1 ? 1 : last + 1;
    if (unit <= last || unit > 2) return null;
    total += Number(m[1]) * SECONDS[unit];
    last = unit;
    pos = token.lastIndex;
  }
  return total;
}

export function progressPercent(position: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, (position / duration) * 100);
}

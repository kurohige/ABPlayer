/** Natural sort comparator — handles embedded numbers correctly.
 *  "Track 2.mp3" < "Track 10.mp3" */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) || [];
  const bParts = b.match(re) || [];

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const ap = aParts[i] || "";
    const bp = bParts[i] || "";
    const an = parseInt(ap, 10);
    const bn = parseInt(bp, 10);

    if (!isNaN(an) && !isNaN(bn)) {
      if (an !== bn) return an - bn;
    } else {
      const cmp = ap.localeCompare(bp, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

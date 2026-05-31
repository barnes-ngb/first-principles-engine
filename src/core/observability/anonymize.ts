/**
 * Stable, non-reversible short id used to group error reports by device/child
 * without ever storing the real Firebase uid or child id (ARCH-11 privacy).
 *
 * This is a FNV-1a hash — deliberately NOT cryptographic. It only needs to be
 * stable (same input → same token) and non-identifying (you cannot recover the
 * source id from the token), so related crashes cluster together in the
 * diagnostics view while no raw identifier leaves the app.
 */
export function anonymizeId(id: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `a${(h >>> 0).toString(16).padStart(8, '0')}`
}

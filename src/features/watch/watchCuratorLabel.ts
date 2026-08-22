/**
 * How the library credits whoever vetted a video in (FEAT-149).
 *
 * `WatchVideo.addedBy` is provenance, and the two surfaces that write it write
 * it differently on purpose:
 *  - `WatchVetInForm` stamps the literal `'parent'` — it has no identity to hand
 *    and never has;
 *  - the Shelly portal's confirmed vet-in stamps the **confirming account's
 *    uid**, because there the tap IS the vetting act and the record should say
 *    which account made it.
 *
 * A uid is the right thing to STORE and the wrong thing to SHOW: rendered raw it
 * turns a friendly "Added by parent" chip into 28 characters of base62. So the
 * card reads the field through here.
 *
 * The test is deliberately structural rather than a lookup: a Firebase uid is a
 * long unbroken run of alphanumerics, and every label this app writes by hand is
 * a short word. Anything that looks like an opaque id reads as "a parent" (which
 * is true — the family shares one account and only a parent can vet a video in);
 * anything human is shown verbatim, so a future named curator survives untouched.
 *
 * UX-02: the form's own literal `'parent'` is normalized to the same "a parent"
 * the uid path produces. Without it, two cards vetted in the same afternoon read
 * "Added by parent" and "Added by a parent" side by side — one provenance, two
 * sentences. The stored value is untouched; only the rendered word changes.
 */
const OPAQUE_ID_RE = /^[A-Za-z0-9]{20,}$/

export function watchCuratorLabel(addedBy: string): string {
  const trimmed = addedBy.trim()
  if (!trimmed) return 'a parent'
  if (trimmed.toLowerCase() === 'parent') return 'a parent'
  return OPAQUE_ID_RE.test(trimmed) ? 'a parent' : trimmed
}

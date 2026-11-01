/**
 * The Old Bridge — one original, code-native scene in two states.
 *
 * ── Why this is SVG written by hand ──────────────────────────────────────────
 *
 * The rest of Banner Rally draws a location as a big styled emoji (🌉) with a
 * grey filter for "broken" and a glow for "fixed". That is a colour change, and
 * a colour change is not a picture of a repaired bridge: a child who cannot see
 * the difference between `grayscale(0.85)` and `drop-shadow` sees the same
 * bridge twice. So the one location this slice covers gets real geometry, and
 * the difference between its two states is **structural**:
 *
 *   • before — the deck is a row of planks with three holes in it, there are no
 *     rails, and a single temporary plank is laid across the widest gap (the
 *     Bible's *"temporary planks allow careful crossing for foot traffic"*);
 *   • after  — the deck is continuous, a rail runs the whole span on its posts,
 *     and the canon banner flies from a pole at the far end.
 *
 * Take all the colour out and the two are still obviously different pictures.
 * That is the bar this component exists to hold.
 *
 * ── The composition is deliberately IDENTICAL in both states ─────────────────
 *
 * Same camera, same river, same banks, same two timber piers, same deck span.
 * Nothing moves between the two renders except the things the repair actually
 * changed. A "before and after" where the scene is re-framed is not a before
 * and after — it is two drawings, and a child cannot read the repair out of it.
 *
 * ── What it is not ───────────────────────────────────────────────────────────
 *
 * No remote asset, no generated image, no new dependency, no emoji, and no
 * state of its own: `state` comes from the caller, which derives it from the
 * existing completed-mission list. **No image on this page defines progress.**
 * It is also deliberately not frightening — the unfinished crossing is a job
 * waiting to be done, not a ruin (STONEBRIDGE_BIBLE › Tone Guidelines).
 *
 * Static by design: there is no animation here at all, so there is nothing for
 * a reduced-motion preference to have to switch off.
 */

export type OldBridgeState = 'damaged' | 'repaired'

interface OldBridgeSceneProps {
  /** 'damaged' = gaps + no rails; 'repaired' = continuous deck + rails + banner. */
  state: OldBridgeState
}

/**
 * Plank layout along the deck. The same thirteen slots are used by both states —
 * repaired fills every one of them, damaged leaves {@link MISSING_PLANKS} empty.
 */
const PLANK_COUNT = 13
const PLANK_LEFT = 42
const PLANK_WIDTH = 10
const PLANK_GAP = 2
const plankX = (i: number) => PLANK_LEFT + i * (PLANK_WIDTH + PLANK_GAP)

/** The holes. Two are adjacent, which is the gap the temporary plank bridges. */
const MISSING_PLANKS = new Set([4, 5, 9])

/** Rail posts, repaired only — evenly spaced the whole way across the span. */
const RAIL_POSTS = [48, 76, 104, 132, 160, 186]

export default function OldBridgeScene({ state }: OldBridgeSceneProps) {
  const repaired = state === 'repaired'

  // Warm light on a finished job, cool overcast on an unfinished one. The
  // palette follows the state; it is never what *tells* you the state.
  const sky = repaired ? '#2b4466' : '#38414f'
  const skyGlow = repaired ? '#f6c78a' : '#5b6673'
  const hill = repaired ? '#2f4a3c' : '#394049'
  const water = repaired ? '#2c5a7a' : '#333d49'
  const ripple = repaired ? '#79b9d8' : '#525d6b'
  const bank = repaired ? '#5a6b3f' : '#49505a'
  const bankTop = repaired ? '#79924f' : '#565d68'
  const timber = repaired ? '#8a5a33' : '#5d5349'
  const timberLit = repaired ? '#b07a45' : '#6e6358'
  const plank = repaired ? '#c08c4f' : '#6b6055'

  return (
    <svg
      viewBox="0 0 240 110"
      // `slice` so the scene fills a short card tile and a tall dialog panel
      // alike without distorting; every load-bearing part of the drawing sits
      // inside the middle band that survives either crop.
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      // The accessible name lives on the wrapper in StonebridgeLocationArt, so
      // this is decorative to a screen reader rather than a second label.
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {/* ── Sky and valley (identical in both states) ────────────────── */}
      <g data-testid="old-bridge-valley">
        <rect x="0" y="0" width="240" height="70" fill={sky} />
        <ellipse cx="120" cy="74" rx="110" ry="30" fill={skyGlow} opacity={repaired ? 0.3 : 0.14} />
        <path d="M0 58 L46 38 L92 58 Z" fill={hill} />
        <path d="M140 58 L196 34 L240 58 Z" fill={hill} />
      </g>

      {/* ── River ────────────────────────────────────────────────────── */}
      <g data-testid="old-bridge-river">
        <rect x="0" y="66" width="240" height="44" fill={water} />
        <rect x="18" y="78" width="54" height="2.5" rx="1.25" fill={ripple} opacity="0.55" />
        <rect x="96" y="88" width="68" height="2.5" rx="1.25" fill={ripple} opacity="0.45" />
        <rect x="150" y="74" width="44" height="2.5" rx="1.25" fill={ripple} opacity="0.5" />
      </g>

      {/* ── Banks ────────────────────────────────────────────────────── */}
      <g data-testid="old-bridge-banks">
        <path d="M0 52 L58 52 L72 84 L0 92 Z" fill={bank} />
        <path d="M0 52 L58 52 L58 57 L0 57 Z" fill={bankTop} />
        <path d="M240 52 L182 52 L168 84 L240 92 Z" fill={bank} />
        <path d="M240 52 L182 52 L182 57 L240 57 Z" fill={bankTop} />
      </g>

      {/* ── Timber piers + braces (identical in both states) ─────────── */}
      <g data-testid="old-bridge-piers">
        <rect x="86" y="54" width="8" height="42" fill={timber} />
        <rect x="146" y="54" width="8" height="42" fill={timber} />
        <rect x="84" y="54" width="12" height="4" fill={timberLit} />
        <rect x="144" y="54" width="12" height="4" fill={timberLit} />
        <path d="M58 56 L88 72 L86 76 L56 60 Z" fill={timber} opacity="0.9" />
        <path d="M182 56 L152 72 L154 76 L184 60 Z" fill={timber} opacity="0.9" />
        <rect x="90" y="74" width="60" height="3" fill={timber} opacity="0.85" />
      </g>

      {/* ── The deck: the part the repair changes ─────────────────────── */}
      {repaired ? (
        <g data-testid="old-bridge-deck-continuous">
          {/* One unbroken deck, edge to edge — no hole to step through. */}
          <rect x="38" y="48" width="164" height="6" fill={plank} />
          <rect x="38" y="46" width="164" height="2.5" fill={timberLit} />
          {Array.from({ length: PLANK_COUNT }, (_, i) => (
            <rect key={i} x={plankX(i) + PLANK_WIDTH} y="48" width="1.4" height="6" fill={timber} opacity="0.7" />
          ))}
        </g>
      ) : (
        <g data-testid="old-bridge-deck-gapped">
          {/* Plank by plank, with three slots simply not there. The river shows
              through the holes because nothing is drawn over it. */}
          {Array.from({ length: PLANK_COUNT }, (_, i) =>
            MISSING_PLANKS.has(i) ? null : (
              <rect key={i} x={plankX(i)} y="48" width={PLANK_WIDTH} height="6" rx="1" fill={plank} />
            ),
          )}
          {/* The careful crossing the village already laid: one board over the
              widest gap. A job half done, not a danger. */}
          <rect
            data-testid="old-bridge-temporary-plank"
            x="86"
            y="47"
            width="40"
            height="3.4"
            rx="1.2"
            fill={timberLit}
            transform="rotate(-2.5 106 48.7)"
          />
        </g>
      )}

      {/* ── Rails: present only once the bridge is whole ─────────────── */}
      {repaired ? (
        <g data-testid="old-bridge-rails">
          <rect x="38" y="28" width="164" height="3" rx="1.5" fill={timberLit} />
          <rect x="38" y="36" width="164" height="2" rx="1" fill={timber} opacity="0.8" />
          {RAIL_POSTS.map((x) => (
            <rect key={x} x={x} y="28" width="4.5" height="20" rx="1" fill={timber} />
          ))}
        </g>
      ) : (
        <g data-testid="old-bridge-rail-stubs">
          {/* Two surviving posts and no rail between them — the absence is the
              point, so it is drawn rather than left to be noticed. */}
          <rect x="40" y="40" width="4.5" height="9" rx="1" fill={timber} />
          <rect x="196" y="40" width="4.5" height="9" rx="1" fill={timber} />
        </g>
      )}

      {/* ── The banner: the canon mark of a finished repair ───────────── */}
      {repaired && (
        <g data-testid="old-bridge-banner">
          <rect x="186" y="14" width="3" height="34" rx="1.5" fill={timberLit} />
          <path d="M189 17 L215 23 L189 29 Z" fill="#7BC8FF" />
          <path d="M189 17 L215 23 L189 23 Z" fill="#a9ddff" />
        </g>
      )}
    </svg>
  )
}

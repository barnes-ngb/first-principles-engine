# Diamond armor geometry — the Stonebridge Guardian set

**Status:** built locally on `feat/diamond-armor-geometry` (2026-10-31), **repaired once against the
root's and Sol's actual-render review** (round 1 — see §5). Not merged, not deployed. Checks and the
render are the root's and Sol's; this document is the design record and the validation contract, not
a render report. Nothing here is a writer-run test or a writer-run render.

**Validation as it actually stands.** Reported by the root after the round-1 repair: the focused
`armorGeometryDiamond.test.ts` suite passes (32 tests) and targeted lint passes. Sol's independent
**repair smoke** read the three findings as fixed — pupil centres clear on both age groups, the fin
and crown crests visible above the stepped crown, the shield's broad edge by the elbow with the tip
down. That is a **smoke check, not acceptance**: Sol's full run is underway, the full case-sensitive
build and checks are pending on the root's exact Linux tree (a Windows full typecheck trips
pre-existing `ActiveChildLine` / `WeekBySubject` path-casing collisions that have nothing to do with
this slice and are not this slice's to touch), and **physical Android testing is still pending** —
the renderer metrics in §5 are local software Chrome. The footprint bound in §3 is a runaway guard
and still not visual proof of fit.

**Scope.** Dedicated Diamond-tier voxel geometry for all six pieces, plus the `DIAMOND` branch in
`buildArmorPiece.ts`'s tier dispatch. Nothing else: no reward / XP / diamond-cost change, no
threshold, no forge or equip writer, no schema or rules, no palette value, no village code. The new
geometry only draws what per-slot forged ownership already grants, and the forge preview still grants
nothing.

- Geometry: `src/features/avatar/voxel/armorGeometryDiamond.ts`
- Dispatch: `src/features/avatar/voxel/buildArmorPiece.ts` (`normalizeTier` + the six builders)
- Tests: `src/features/avatar/voxel/armorGeometryDiamond.test.ts`

## 1. The design language

Wood is wrapped, Stone is carved, Iron is forged-and-riveted. **Diamond is cut**: every mass is
either a stepped terrace or a block turned 45° so it presents an edge instead of a face. That one
rule is what makes the set read as a new silhouette without adding bulk, and it repeats across the
pieces so they look like one suit:

| Piece | Diamond silhouette | What it replaces |
|---|---|---|
| Helmet | Open-face helm with a three-step ziggurat crown, an angular brow visor raised clear of the eyes with a single turned brow facet on it, faceted cheek plates set outside the head, two-step neck guard | Iron's dome + tall fin + chainmail aventail; Stone's nose-guarded Norman helm |
| Breastplate | Two front plates tilted against each other into a shallow keel, faceted cross in relief, chevron pair, stepped pauldrons, two-layer vambraces with a bright cuff | Iron's single flat slab + seam lines + rivets |
| Belt | Eight discrete waist plates (three front, three back, one per side) with turned corner links and a turned buckle | Iron's one continuous band + hip pouches |
| Shoes | Faceted sabatons with a tipped toe wedge and an outer turned chamfer; two stacked shin plates; a turned knee cap | Iron's sabaton + single greave + knee boss |
| Shield | Tapering **kite**, broad top at the elbow and point hanging toward the knee — five stacked rows holding straight across the shoulders then narrowing to a tip — carrying a small Stonebridge **arch** (two piers, two haunches, a lintel) and a **banner** band with a swallowtail | Iron's rectangular slab; Stone's tall tower shield |
| Sword | One straight, parallel-edged blade with a fuller and chamfer strips, a plain straight crossguard with turned end facets, a turned pommel | Iron's two-stage glowing blade (which keeps its glow) |

**Deliberately absent:** spikes, skulls, magic or particle meshes, extra lights, and generated raster
art. The Diamond sword carries **no** point light and no `sword_blade` mesh — the cyan comes from the
existing `diamond` entry in `TIER_MATERIALS` plus its `heroVividness` tint, so the piece is lit by the
palette alone. The Armor-of-God cross the earlier tiers carry is kept, on the chest and on the belt
buckle, cut rather than flat.

## 2. What is preserved, by construction

- **Body proportions.** Every dimension comes from `getBodyLayout()` (`U`, `torso*`, `arm*`, `leg*`,
  `headSize`). No proportion is overridden and no mesh is parented anywhere new.
- **Equip poses and pivots.** The shield keeps `attachToArm = 'L'`, the `shield_visual` sub-group and
  both of their transforms; the sword's grip transform stays in `buildSword()`; the helmet stays
  head-local. All of these are asserted equal to the Iron piece's, not merely eyeballed.
- **Attachment metadata.** The breastplate's arm pieces carry `attachToArm` and are direct children of
  the piece group, which is what `VoxelCharacter`'s detach loop requires; the shield exposes the
  `emblemX/Y/Z` anchor the emblem is positioned from. No hand or arm reattachment was changed.
- **Existing helmet crests still read.** The one new piece of metadata in this slice:
  `userData.crestBaseY`, published **only** by the Diamond helmet, naming the head-local Y a crest
  should stand on. `buildHelmetCrest` gained an optional `baseYOverride` (omitted ⇒ the historical
  base, unchanged byte-for-byte) and `VoxelCharacter` passes whatever the helmet publishes. Earlier
  tiers publish nothing, so their crest placement — including Iron's and Gold's own partial burial of
  some crests, which is **not** this slice's to repair — is untouched. `'none'` still builds nothing.
- **Material-role tagging.** Every mesh is tagged `primary` / `secondary` / `accent` / `detail`, so
  `applyTierToArmor`, `tierUpCeremony` and `enchantmentGlow` all keep working untouched.
- **The tier palette.** `TIER_MATERIALS.diamond` is unchanged. Only the comment above it changed, to
  say that it is now load-bearing rather than a placeholder.
- **Earlier tiers and fallback.** Wood, Stone and Iron geometry is untouched. Gold, Netherite, an
  unknown tier string and a missing tier all still resolve to Iron.

## 3. Validation contract

`armorGeometryDiamond.test.ts` asserts the contract, never the art. Comparisons are canonical — mesh
names, counts, material roles, transforms, and bounding-box ratios — because `taggedBox` and
`applyTierToArmor` both jitter per-face brightness with `Math.random()`, so any color assertion would
flake.

1. **Dispatch** — all six pieces build `diamond_`-prefixed geometry, case-insensitively on the tier
   string; each group is named after its piece id and starts hidden.
2. **Distinctness** — no Diamond mesh name is shared with Wood, Stone or Iron on any piece, and the
   Diamond mesh set differs from Iron's for all six. Wood / Stone / Iron stay mutually distinct.
3. **Bounded complexity** — each piece has real mass and stays under the per-piece mesh ceiling the
   test defines (currently 40); every mesh name is unique and non-empty; no Diamond piece contains a
   light, with the Iron sword's point light and glow blade as the positive control.
4. **Both proportions** — younger and older build the same mesh set; the body-worn pieces scale by
   exactly `getBodyLayout`'s younger scale (0.85) on all three axes; the helmet stays head-sized for
   both, because `headSize` is deliberately not scaled.
5. **Footprint** — on every axis each Diamond piece stays within 1.2× the widest earlier tier for that
   piece. This is a **runaway guard, not a visual proof**; see §5.4.
6. **Tags and attachments** — shield arm/pose/`shield_visual`/emblem anchor, sword arm/grip pose,
   symmetric breastplate arm pieces as direct children, and helmet/belt/shoes carrying no arm
   attachment at all.
7. **Fallback stability** — Gold, Netherite, an unknown tier and a missing tier all produce Iron's
   exact mesh set, per piece.

Round 1 added three more, each pinning a finding the render made rather than a shape I like:

8. **Kite sense** — the broad top is `+Y` in shield-local space and the point is `−Y`; the cap sits
   above the widest row, the tip below the narrowest, and row width falls monotonically from top to
   tip. The arch reads above the boss and the banner below it, and the boss — the emblem anchor — is
   at the kite's middle, so a future flip of the orientation breaks a test instead of a render.
9. **Pupil visibility** — the real `buildCharacter` head is built, the helmet is parented to
   `headGroup` exactly as `VoxelCharacter` does, and a ray is cast from in front of the face at each
   pupil's centre and lower third, on **both** body layouts. The first hit must be the pupil. Two
   controls keep it honest: the **Iron** helm passes the same assertions (the baseline the render
   compared against, so the rig is sound), and dropping the Diamond visor back to brow level must
   make the ray hit the visor (so the test would catch the regression it was written for). The brow
   jewel is separately pinned narrower than the gap between the pupils.
10. **Crest anchor** — Diamond publishes `crestBaseY` at the crown's top face and no other tier
    publishes anything; every crest option in `HELMET_CREST_OPTIONS` lands above that anchor and does
    not sink far below it; `'none'` returns `null`; without an anchor the crest geometry is identical
    to today's and sits below Diamond's crown, which is the burial being fixed. A source assertion
    pins that `VoxelCharacter` has exactly **one** `buildHelmetCrest` call and that it passes the
    helmet's anchor through.

## 4. Open questions for the render pass

1. **Arch and banner legibility.** Both sit on the shield's inner panel at a small stand-off. They may
   need more relief depth to read at the Hero Hub's camera distance.
2. **Crown height.** The third terrace rises further above the skull than Iron's dome, though less far
   than Iron's fin tip. If it reads tall on a younger character — whose head is **not** scaled down
   while the body is — the fix is the `crown_top` step, not the whole crown. Note the crest anchor is
   derived from that step, so it follows a change automatically.
3. **All dimensions are first-pass estimates**, the same caveat the Wood and Stone modules carry.

## 5. Round 1 — what the render found and what changed

Three visual findings from the root's and Sol's actual-render review of the first candidate, plus one
note about a test. All four are repaired or recorded here; none of them touched a data path.

1. **The visor covered the pupil centres**, on both body layouts. Sol's independent raycast derived
   the eye meshes' world positions and read Gold as *pupil / pupil / iron-brow* for the lower, centre
   and upper rays against Diamond's *pupil / visor / visor*. Cause: the face's pupils span
   `0 … 0.125 hw` around a centre at `0.0625 hw` (`buildCharacter`, `hU = headSize / 8`), Iron's brow
   sits at `0.075 hw` and so clears the centre, and the first candidate's visor — deeper, lower and
   tipped a full `0.14 rad` — put its forward lip at about `0.059 hw`, *below* the centre. **Fix:** the
   visor is shallower, raised and less steeply tipped, so its forward lip clears the pupil **top**,
   not merely the centre; the brow facet is shrunk and raised with it, and is also narrower than the
   gap between the pupils, so a pupil-centre ray misses it in X as well as Y. The stepped silhouette
   and the open face are unchanged, and the upper ray still lands on armour exactly as Gold's does.
2. **The kite was upside down** — tip at the elbow, broad edge at the knee, in both the shield-facing
   view and the shield-wall pose. Cause: the orientation was inferred from Iron's own `rim_top` /
   `rim_bot` labels, which do not survive the arm transform. **Fix:** the single `TOP` constant is
   flipped, which is the whole orientation because every Y in the builder is expressed through it. The
   group and `shield_visual` pose transforms, `attachToArm`, the grip and the emblem anchor are
   unchanged, and nothing was reattached.
3. **The stepped crown buried the existing crest customisation.** Cause: `buildHelmetCrest` bases a
   crest on the *legacy* open-face dome top (`headPx * 0.53`), which the crown rises well past.
   **Fix:** the Diamond-only `crestBaseY` anchor described in §2 — the minimum viable integration, and
   explicitly scoped to Diamond. Earlier tiers are byte-identical, including the partial burial Gold
   already has, which this slice deliberately does not repair.
4. **A test bound, not a visual fact.** The root's first focused run was dispatched before this writer
   finished and reported 20 pass / 1 fail: the footprint bound, then written as Iron × 1.15, failed on
   `shield.y`. Iron has the *shortest* of the three earlier shields while Stone's tower shield is the
   tall one, so the comparison was wrong rather than the shield — the bound now reads "within 1.2× the
   widest earlier tier". **That receipt stands as provisional and the amended bound is not offered as
   proof of fit:** a bound its own author can move is a runaway guard, nothing more. Fit acceptance is
   Sol's final render.

Sol's first-candidate renderer metrics (722 draw calls / 1,644 triangles against Gold's 821 / 1,872)
are local software Chrome and carry **no** Android performance claim; they need re-running after this
repair, as do the workflow sweeps.

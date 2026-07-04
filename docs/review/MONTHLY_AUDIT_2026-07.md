# Monthly Deep Audit Briefing — 2026-07

**Purpose:** Grounding doc for the monthly architecture conversation (see
`Monthly Deep Audit — Conversation Starter`). This is a detection pass only —
no structural or feature changes were made. Findings are surfaced here per the
"Routines detect; humans assign" rule in `CLAUDE.md`; decisions on what to do
about them belong to the human conversation, not this pass.

Sources: `docs/review/ARCHITECTURE_AUDIT_2026-06-28.md` (+ `-06-21` for trend),
`docs/review/REVIEW_HOME_BASE.md` §6 (read as of 2026-07-04, HEAD `9ddd1d8`),
`docs/MASTER_OUTLINE.md`, `docs/HEALTH_REPORT.md`.

---

## 1. Top architectural risks (per most recent audit, 2026-06-28)

1. **ARCH-40 — Dad Lab name-coupling.** `KidLabView.tsx:50,267,369` and
   `LabSuggestions.tsx:96,122` key off `childReports[childName.toLowerCase()]`
   plus a hardcoded `lincolnRole` field. Blocks genuine second-child (London)
   Dad Lab support and now gates slices 2–4 of the new Concept Arcs feature
   (FEAT-44/dad-lab). Deferred once already (from ARCH-15).
2. **Bundle still unsplit** (ARCH-05/08) — blocked on decoupling
   `AvatarThumbnail.tsx` from Three.js before any route can lazy-load.
3. **`chat.ts` / `useQuestSession.ts`** — both still >2,000 lines and still
   growing slowly (`chat.ts` 2,548→2,577L this cycle).
4. **DATA-13** — `records.logic.ts:785,812` HTML export still hardcodes
   "Missouri" in the title/heading despite DATA-12 fixing the underlying
   state-config layer. 3-line follow-up, not yet done.

## 2. File growth

Growth on the previously fast-growing files **paused** this cycle for the
first time in 3 audits: `PlannerChatPage.tsx` flat at 2,729L (was +102L/cycle),
`contextSlices.ts` flat at 1,566L (was +81L/cycle). Only real movers: `chat.ts`
+29L (2,577L) and `useQuestSession.ts` +7L (2,168L — 5th consecutive report
over 2,000L). New entrant on the 1,000L watch list: `AvatarAdminTab.tsx`
(1,104L). No file crossed a new decomposition threshold this cycle.

**Note:** `MASTER_OUTLINE.md`'s own "Top 5 Largest Files" table
(PlannerChatPage 2,620L, BookEditorPage 2,263L, useQuestSession 1,870L,
MyAvatarPage 1,804L) does **not** match the 06-28 audit's numbers (2,729L /
2,103L / 2,168L / 1,876L) — the outline has drifted from the audit and needs
a refresh.

## 3. Data model coherence

~33 top-level Firestore collections (32 family-scoped + global `chapterBooks`)
plus 3 subcollections — consistent with `CLAUDE.md`'s collection table.

**WorkbookConfig → ActivityConfig migration is stalled**, and its own tracking
is inconsistent: the 06-21 and 06-28 architecture audits both report the same
49 refs / 9 files (no movement), while the ledger's `ARCH-06` row separately
claims "30 refs (was 34)". These two numbers can't both be right — worth
reconciling which count is current before deciding whether the migration is
actually progressing. Migration is blocked on the planner cluster
(`PlannerChatPage`, `PlannerSetupWizard`, `PhotoLabelForm`, `pace.logic.ts`).

## 4. Bundle and performance

3,976.67 kB / 1,174.14 kB gzip (06-28), up marginally from 3,955.73 kB
(06-21) — within noise. A concrete 4-step code-split plan has existed
unchanged for 3+ audit cycles (decouple `AvatarThumbnail` from Three.js →
lazy-load `MyAvatarPage` → lazy-load `BookEditorPage` → lazy-load
`WorkshopPage`; projected 800–1,100 kB reduction) with **zero implementation
progress**. This is the same "recurring question that never gets
prioritized" the conversation-starter template calls out — still true.

## 5. Tech debt triage (CLAUDE.md's "Known Technical Debt" list)

- **Worse:** `chat.ts` (2,548→2,577L).
- **Unchanged:** `PlannerChatPage.tsx`, `BookEditorPage.tsx`,
  `useQuestSession.ts`, `MyAvatarPage.tsx`, `WorkshopPage.tsx`,
  `VoxelCharacter.tsx`, `useShellyChatFlows.ts`, `contextSlices.ts`,
  `ReadingQuest.tsx`, bundle size, WorkbookConfig migration.
- **Resolved but CLAUDE.md still lists as debt (doc needs a follow-up
  correction, not a code change):** "Dead `ladders` collection query"
  (fixed as ARCH-39 in the 06-28 audit, PR #1466).
- **Escalated from "documented quirk" to confirmed bug:** the "Hours
  partial-day edge... by design but undocumented" line. The 2026-07-01
  diagnosis (`HOURS_UNDERCOUNT_DIAGNOSIS.md`) showed this is an active
  MO-compliance-relevant undercount (Today ~3h10m vs Records ~0.92h for the
  new school year), already fixed and tested as ledger row `DATA-14` —
  see §7, it's sitting unmerged.

**Recommended pick for "one debt item this month":** land the bundle
code-split plan (§4) — it's fully speced, hasn't moved in 3 cycles, and is
the highest-leverage item that's actually still "not started" rather than
already-done-and-waiting-on-merge.

## 6. AI prompt quality / test coverage strategy

Not assessed in this pass — out of scope for a detection-only sweep. Current
test coverage stats from the (stale) `HEALTH_REPORT.md`: 202 test files,
3,005 tests passing 2026-06-13; 06-28 audit reports 3,381 tests. Zero-test
features unchanged: `progress/`, `dad-lab/` (per ledger `TEST-01`, still
partial). Worth a dedicated pass in the actual monthly conversation.

## 7. Process / ledger health (new finding this pass, not from the audit)

Two things surfaced here that are more urgent than the architecture questions
above and don't need to wait for the monthly conversation:

- **Two compliance-relevant fixes are sitting unmerged for 2+ days.**
  `DATA-14` (hours undercount — real completed schoolwork was dropping to
  ~0 tracked hours after the 2026-07-01 rollover) and `DATA-15`
  (workbook-scan-collapse fix) are both marked `RESOLVED` / tested / green
  in the ledger, with PRs opened 2026-07-02 and explicitly flagged
  **"do not merge"** pending human review. `FEAT-44` (multi-page scan)
  depends on `DATA-15`'s matcher. None of these are stuck on anything code
  — they're just waiting in the merge queue.
- **Ledger ID collision:** `FEAT-44` is used for two *different* rows —
  one "Multi-page Curriculum scan" (band 4, `SHIPPING`, PR opened
  2026-07-03) and one "Dad Lab Concept Arcs Slice 1" (band 2, `BUILT`, PR
  also opened 2026-07-03). `REVIEW_HOME_BASE.md`'s own header rule says an
  ID is never reused. One of these needs to be renumbered before either
  merges, or the ledger becomes ambiguous going forward. Left as-is here
  (not fixed) since resolving it means touching rows this session doesn't
  own, mid-flight, while other PRs are open against the same file.

## 8. Carry-forward for the conversation

- Reconcile the WorkbookConfig ref-count discrepancy (§3) before deciding if
  that migration needs a push this month.
- Refresh `MASTER_OUTLINE.md`'s file-size table against the 06-28 audit
  numbers (§2) — currently silently wrong.
- Decide the `FEAT-44` ID collision rename (§7) — whoever merges next should
  fix it as part of that merge, not leave it for a third PR to collide with.
- `HEALTH_REPORT.md` is 21 days stale (2026-06-13) and superseded twice over
  by the architecture audits; either fold it into the audit cadence or stop
  maintaining it separately.
- Design Pass v1 queue (11 items) still shows zero items started —
  unchanged from last check; confirm this is still intentionally deferred.

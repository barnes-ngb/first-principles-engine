# Sticker correction and review export — September 16, 2026

Owner feedback: cleanup sometimes erases wanted picture details, Watercolor/Comic-book are missing from the saved sticker's Add version picker, and reviewing learning data should not require piecing together Foundations screenshots. Owner authorized this bounded implementation after source inspection and synthetic reproduction. Base: `30b241a109ddac389bc80107aa050ca23c6d1314`.

## Sticker flow (FIX-246)

- The shared sticker style table keeps legacy `cartoon` IDs and the watercolor recipe, labels it Watercolor look, and adds Comic-book look using the existing comic recipe. Scanner, saved drawing groups and Settings use the same options. Selection does not make a paid call; existing quota and generation paths remain.
- On an unsaved Cleaned preview, Adjust cleanup offers Auto, connected-area Tap background, Keep/Remove brushes, color match, Undo, Reset, Compare, Zoom and Move picture. Work replays from the retained decoded source. Manual brushes override automatic/tap removal; the latest overlapping brush wins. Reset restores the working original; Auto is a separate action.
- Use cleanup prepares a preview. Save Cleaned remains the explicit persistent save and creates only one cleaned anchor. Adjustment locks after that save, while Fancy stays available. Fancy uses the retained working original. No mask/source storage schema is added; missing pixels in previously saved stickers cannot be recovered without a source image.
- The editing buffer is bounded to four million pixels. A large image requires explicit agreement to make a smaller editable copy; the original file stays retained, and the UI identifies which copy Keep/Reset restore. Browser image decoding can allocate memory before this bound. History and strokes are bounded, with visible limit feedback.
- Capture binds the selected child ID before its name loads; a locked child profile waits for its matching record instead of adopting the parent's temporary fallback. Existing child records fill missing defaults once, even if the header has since switched. Typed labels and explicit For choices remain authoritative. The first accepted Save or Fancy request finalizes the displayed defaults, including generic defaults if identity is still unresolved; later metadata cannot relabel submitted work. No new identity query is added.
- Pending persistence blocks Cancel, Escape and backdrop dismissal; a failure restores the controls. Header changes keep the captured drawing and paid result. Close, family replacement and retake invalidate stale preparation. A save already submitted may finish on its captured origin, but cannot retarget a new session. Stickers remain family-shared with `childId: null`; the local For picker is not learner evidence attribution.

Auto still uses a color/paper heuristic, not subject recognition. The new tools allow correcting its mistakes; synthetic tests do not prove quality for arbitrary real photos, pale hair or complex backgrounds.

## Parent review export (FIX-247)

Records exposes Export for review without a diagnostic flag. The existing diagnostic Foundations entry remains. Parent capability gates the whole control. Fresh family child identities come from a read-only query using the existing oldest-name dedupe rule; the export does not call the child auto-create hook. Failed reads stop export. Family, capability or visibility changes discard late downloads. Each row retains its selected child and scope independently of the header's active child.

The downloaded Markdown keeps its readable summary and adds structured learning evidence: full stored model/references, provenance/disagreements, evaluation findings, build/schema/graph versions and read limitations. Missing assistance or confidence stays unknown. Usage, XP and recorded hours do not establish mastery. Full history stays the default. Current-year mode filters evaluation detail while the current model retains older evidence references; read caps and unknown totals remain explicit. No new assessment is performed.

Session evidence includes ordered quest answers with their original question/answer, timing, input method and concept/blocker attribution; stored partial-session outcomes; full fluency passages and each recorded reading attempt; and guided-review summaries/frontiers/next review dates. Missing legacy fields remain absent, and recorded false/zero values are preserved. Quest resume snapshots (`savedQuestState`, `savedCurrentQuestion`, `bonusRoundUsed`) are explicitly excluded: an unanswered resume question is not a completed attempt. Recording references are included without fetching their media.

The file contains private child details, notes and media links. It does not fetch media bytes, include complete conversations or provide sticker diagnostics. The parent reviews and manually shares it. Export code makes no AI call or database write. Existing unrelated Records page migrations remain unchanged; this is not a claim that mounting the whole Records route has no side effects.

## Verification and remaining family trial

Separate writers and an independent reviewer checked frozen source, actual component flows, source/evidence fidelity, async scope changes and failure retries. Mutation controls confirmed that breaking Keep's source-alpha restoration, cancellation or export lifetime guards causes the corresponding tests to fail. Required combined app/functions/docs checks are recorded with the final candidate; implementation and local review do not imply merge or deployment.

PR #1863 reached the three-round automated review cap. Its final late-identity correction follows the third reviewed head, `380af980`; that correction has not had automated review. A fresh review of the final published head is required before merge. The PR summary records the exact final head and verification results.

Synthetic Chromium checks cover laptop, phone and tablet layouts, a pale-detail Keep correction, local preview encoding, zoom/scroll mode, parent export initiation and child capability gating. Phone spacing was corrected from that check. Physical Android Chrome touch behavior, memory on family devices, actual generated-art style/cleanup quality and family usefulness still require a trial after release:

1. Upload a drawing and a photo. Keep a pale foreground detail, remove an unwanted patch, then Undo and Reset; save only the intended cleaned preview.
2. Try Watercolor and Comic-book from an existing sticker's + button; verify the original and saved versions remain together.
3. Download one child's full-history review from Records. Confirm the child's name and scope, then attach the file to the design chat for review.

No hours calculation, XP calculation, graph inference, protected writer, access rule, dependency or stored document schema changes belong to this batch.

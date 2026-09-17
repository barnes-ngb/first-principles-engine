# Book editor reliability — September 16, 2026

Owner assigned the next Books batch after testing stickers and book controls on desktop Chrome and Android Chrome. Base: `a9d062f823395ac9afb8be64d5e0fb0153b8fa27`. Scope is transform lifecycle/Undo followed by background/layer consistency. Control presentation and sticker generation/cleanup follow-ups remain separate.

## Transform lifecycle and Undo (FIX-248)

Corner resizing uses both pointer axes in physical canvas coordinates, including rotation and flips. Pinch and corner resizing share proportional limits: dimensions stay within the existing canvas maximum; both retain the minimum where the aspect ratio permits it. Very narrow art can shrink without distorting or becoming stuck at the maximum. Transform constraints retain a recoverable part of the selection geometry; transparent padding inside artwork is not measured.

An active gesture owns a temporary draft. A completed gesture writes once; cancellation or lost capture discards it. React replay cannot duplicate a commit. Idle art reads current saved geometry, so Undo or another saved-state restore is immediately visible. Book/page keys discard unfinished gestures across navigation, including reused image IDs.

The actual book controller captures both ends of each completed transform synchronously. Undo/Redo restores only that existing image's geometry, preserving later story text, new artwork, metadata and layer order. It never resurrects a removed image. History stays in memory and is scoped to the family/book; final saved geometry persists through the existing save path. Background and layer history are handled separately below.

## Backgrounds and layers (FIX-249)

Editor, reader and print share geometry defaults based on the existing background/element role. Full-page backgrounds stay full-page when a sticker moves forward or backward; reordering changes only order within the affected plane. Placed photos have the same resize and rotation handles as other elements. Background change/remove uses the selected background, or the visually top background when none is selected. Gallery source choices still include placed photos.

Replacing a background prepares the upload or generated candidate before changing the page. The accepted replacement keeps the target ID, position, fit and label, preserves other art, and drops obsolete source metadata. Its captured family/book/page and source identity are checked at the mutation boundary against the latest accepted book state. Navigating to another page keeps the original target and identifies the updated page in a visible notice; changing books, removing/replacing the target or changing its role refuses the old callback. Failed uploads leave the picture and book save state intact. Refused generated Use keeps the result and explanation available.

Book mutations now evaluate once against a document-scoped current state and return their accepted before/after endpoints for history. This fixes same-turn updates and stale chooser completion without changing the existing persistence/debounce implementation, hours formulas, rewards or effect declaration order. Source preparation alone does not mark AI usage; only an accepted insertion or replacement does.

Image replacement, removal and ordering Undo/Redo restore operation-owned fields against current content. Later story text, unrelated art and independently edited placement/fit/labels survive. Source fields are kept together: if a newer same-ID picture superseded the historical endpoint, Undo/Redo retains its URL and source metadata together. Transform history continues to restore geometry only. This is not a redesign of every page-edit history action.

Old image storage is retained for Undo. A prepared upload refused after completion can remain unreferenced in storage; storage cleanup is a separate task. No stored schema, access policy or paid provider behavior changes are included.

## Validation and family trial

Expected-correct tests reproduced the old failures before repair. Actual component/controller regressions cover geometry, cancellation, StrictMode, restored props, Undo/Redo and book/page identity. Independent probes challenge rotation/flip combinations, extreme proportions and preservation of newer content. Final required app/functions/docs checks and independent review are recorded with the candidate; local checks are not a claim of merge, deployment or family validation.

Synthetic browser checks exercise the actual page renderer at desktop, phone and tablet widths, including vertical resizing, rotated/flipped corner movement, saved geometry restoration, Remove and edge shrinking. They also check a positionless background across reorder, selected/topmost background removal and placed-photo resizing. The browser fixture has in-memory callbacks; it does not prove a live database save or physical Android touch behavior. Actual hook/controller tests separately cover same-turn mutations, refused late completions, source-coherent history, generated-result retention and unchanged protected hours behavior with mocked persistence. Reader/print tests check geometry through their actual render/output boundaries, not a print pixel comparison.

After release, use a small test book on Android Chrome phone/tablet and desktop Chrome:

1. Grow and shrink a sticker with the corner and pinch, including after rotation/flipping. Proportions should remain stable.
2. Move it partly off the page and shrink. The selection box should remain partly on-page; report if transparent margins or hidden controls make recovery difficult.
3. Move a sticker, type a new sentence, Undo the move, then Redo. The sentence should remain. Repeat for resize/rotate/flip.
4. Switch pages and reopen the book; final geometry should match the saved result. Undo history itself is session-only.
5. Move stickers through Layers. Background size and unrelated picture positions should stay unchanged. Select a lower background before changing/removing it and check that the intended picture changes.
6. Replace a background, add story text, then Undo/Redo. Later text and unrelated art should remain. If you navigate pages while a picture loads, the outcome should name the original page. A failed replacement should leave the old picture available.

Physical finger comfort, two-finger pinch and interruption behavior remain family checks. The wider control presentation is queued; this batch does not claim to fix overlapping tools or rotated toolbars.

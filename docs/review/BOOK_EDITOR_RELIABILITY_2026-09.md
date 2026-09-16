# Book editor reliability — September 16, 2026

Owner assigned the next Books batch after testing stickers and book controls on desktop Chrome and Android Chrome. Base: `a9d062f823395ac9afb8be64d5e0fb0153b8fa27`. Scope is transform lifecycle/Undo followed by background/layer consistency. Control presentation and sticker generation/cleanup follow-ups remain separate.

## Transform lifecycle and Undo (FIX-248)

Corner resizing uses both pointer axes in physical canvas coordinates, including rotation and flips. Pinch and corner resizing share proportional limits: dimensions stay within the existing canvas maximum; both retain the minimum where the aspect ratio permits it. Very narrow art can shrink without distorting or becoming stuck at the maximum. Transform constraints retain a recoverable part of the selection geometry; transparent padding inside artwork is not measured.

An active gesture owns a temporary draft. A completed gesture writes once; cancellation or lost capture discards it. React replay cannot duplicate a commit. Idle art reads current saved geometry, so Undo or another saved-state restore is immediately visible. Book/page keys discard unfinished gestures across navigation, including reused image IDs.

The actual book controller captures both ends of each completed transform synchronously. Undo/Redo restores only that existing image's geometry, preserving later story text, new artwork, metadata and layer order. It never resurrects a removed image. History stays in memory and is scoped to the family/book; final saved geometry persists through the existing save path. Background and layer history are handled separately below.

## Validation and family trial

Expected-correct tests reproduced the old failures before repair. Actual component/controller regressions cover geometry, cancellation, StrictMode, restored props, Undo/Redo and book/page identity. Independent probes challenge rotation/flip combinations, extreme proportions and preservation of newer content. Final required app/functions/docs checks and independent review are recorded with the candidate; local checks are not a claim of merge, deployment or family validation.

Synthetic browser checks exercise the actual page renderer at desktop, phone and tablet widths, including vertical resizing, rotated/flipped corner movement, saved geometry restoration, Remove and edge shrinking. The browser fixture has in-memory callbacks; it does not prove a live database save or physical Android touch behavior.

After release, use a small test book on Android Chrome phone/tablet and desktop Chrome:

1. Grow and shrink a sticker with the corner and pinch, including after rotation/flipping. Proportions should remain stable.
2. Move it partly off the page and shrink. The selection box should remain partly on-page; report if transparent margins or hidden controls make recovery difficult.
3. Move a sticker, type a new sentence, Undo the move, then Redo. The sentence should remain. Repeat for resize/rotate/flip.
4. Switch pages and reopen the book; final geometry should match the saved result. Undo history itself is session-only.

Physical finger comfort, two-finger pinch and interruption behavior remain family checks. The wider control presentation is queued; this batch does not claim to fix overlapping tools or rotated toolbars.

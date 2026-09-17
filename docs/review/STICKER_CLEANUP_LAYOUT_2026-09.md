# Sticker cleanup layout

FIX-251. September 17, 2026. Local candidate; final combined checks, independent acceptance and recovery must complete before publication is proposed. No merge, deployment or family validation is claimed.

## Reproduced problem

With a synthetic 2400 by 1800 image, the previous Adjust cleanup dialog displayed disabled controls before the smaller-copy choice and showed no original preview. Desktop layout made the intended action difficult to understand. This was a size-consent/layout problem, not evidence that the cleanup algorithm had failed.

## Candidate behavior

An oversized source now shows a preview with the explicit Use smaller editable copy choice before editing tools. Cancel applies nothing. The preview has its own source-bound object URL, released on replacement/unmount. Loading another source clears stale source/error/size state.

After consent, the image precedes the controls on narrow screens and sits beside them on wider screens. Fit mode has no inner scroll box; explicit zoom retains its pan region. Cancel and Use cleanup remain in dialog actions. Existing labels, manual marks, Undo/Reset, compare and brush operations retain their behavior. The original file, four-megapixel processing bound, cleanup algorithm and separate scanner Apply then Save Cleaned sequence are unchanged.

## Validation boundaries

StickerCleanupEditor.test.tsx covers original preview, explicit consent, cancellation, cleanup marks and view changes. Existing SketchScanner.cleanup.test.tsx covers the actual caller's separate apply/save path. Independent component checks exercise URL lifetime, no-consent cancellation, explicit consent, marks across zoom/compare/pan and Undo/Reset, and cancel during encoding. A baseline without the repair fails the preview tests while preservation controls still pass.

Actual local browser checks use synthetic large and small images, with no family media or provider calls. Phone, tablet and desktop checks cover preview, consent, visible editing area and reachable dialog actions. These tests do not establish physical Android touch comfort or live saved-sticker reopening. Generated-result look/save identity and iterative editing of a saved generated version remain separate, unfinished assignments; this change does not alter them.

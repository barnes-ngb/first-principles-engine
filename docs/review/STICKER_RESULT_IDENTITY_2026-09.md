# Completed sticker result identity

FIX-252. September 17, 2026. Local candidate from LOCAL-CLAUDE-PILOT-001; final exact-tree gates and verified recovery remain acceptance prerequisites. No publication, merge, deployment or family validation is claimed.

## Reproduced problem

Generate a Comic-book picture, select Watercolor without generating again, then save. Previously the displayed Comic-book URL/path could be saved with the pending Watercolor theme. Independent baseline tests also reproduced both directions of a save/generation race: a save finishing after another generated result arrived could mark that other result saved.

## Behavior

The completed Fancy result holds URL, storage path, requested look and transient request/rewrite explanation together. Save derives its existing theme field from that completed result. The picker describes the next request; the visible result labels its actual look. Failed redo preserves the previous result and whether it is already saved. Successful redo replaces the result and clears only the fancy saved marker.

Synchronous guards and disabled actions exclude overlapping Fancy save and generation, including retry-card callbacks. Failure releases the guard. Cleaned saves retain their existing independent behavior. Original source selection, group/sourceDrawingId, family and session guards, quota accounting, cleaned anchor, recipes and stored schema are preserved. One-off notes remain transient and are not added to saved sticker records.

## Validation

SketchScanner.resultIdentity.test.tsx covers result identity, changed pending choices, failed/successful redo, save failure and both race directions. Existing artQuota and cleanup suites cover preservation. Independent acceptance checks reproduce the old mismatch and races before the change, then exercise the candidate with synthetic results. Synthetic browser checks cover refused redo, saving the retained Comic-book result, successful Watercolor retry and saving it into the same group, at phone, tablet and desktop sizes. No live image-provider calls or family media were used for browser acceptance.

Claude CLI authored the application change and focused tests; Astra supplied the design, independent acceptance and official documentation. Review required a repair for the two races and a test setup correction. This bounded pilot does not establish general equivalence between providers.

## Remaining validation

After an authorized release, test on Android Chrome: generate one look, choose another without generating, save and reopen; verify a failed redo preserves the picture and a successful redo can be saved. Physical touch comfort and live provider output quality remain unverified. Iterative editing of a saved generated image is separate work; this change continues generating from the established original source.

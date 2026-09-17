# Reachable book picture controls

FIX-250. September 17, 2026. Implemented and reviewed locally; publication, merge, deployment and physical Android validation remain separate.

## Problem and resulting behavior

A selected sticker could have its controls covered by higher artwork or clipped at the page edge. Rotation and flips also moved the controls with the picture. A saved element wholly off-page was difficult to recover, especially when it was the only element.

PageEditor now hosts selected-picture actions below the canvas. DraggableImage renders PictureControls there without changing artwork order or transform. Move, proportional Smaller/Larger, rotation, flip, ordering, Center and Remove act on the selected element. Controls disable during unfinished gestures. Noninteractive tooltips cannot cover the next action.

Layers is available for a single element and uses a native, named selection button. Show/Hide layers labels state what they do. Center changes position only through existing mutation/history; one Undo restores the prior position. Merely opening or selecting a book never recenters it. Background options stays separate, retaining Change picture and the existing fit/fill/remove menu.

## Evidence and limits

Committed regressions cover actual PageEditor and BookEditorPage behavior in PageEditor.controls.test.tsx, PageEditor.layers.test.tsx, PageEditor.imageFit.test.tsx, BookEditorPage.transforms.test.tsx and booksBatchB.components.test.tsx. Independent controller/gesture checks covered stale page/book callbacks, selected identity after reorder, scoped Undo/Redo and preservation of newer text/art. Source checkpoint 6a4cb5c4751322e891002177b5f2fcec5ac8be45 passed app lint/build/tests, functions checks and docs checks; this added documentation still requires verification on the combined final tree.

Synthetic browser checks at 393 by 852, 800 by 1280 and 1280 by 720 exercised overlapping art, page edges, off-page Center, rotation, flips, placed photos, keyboard selection, ordering and background actions. Visible action centers were reachable after normal scrolling and targets measured at least 44 CSS pixels. A reproduced tooltip interception was corrected and its immediate next-action click passed. No live records or image-provider calls were used.

Geometry resolution, useBook/history, persisted schemas, reader/print, source attribution, quotas and protected accounting/learner logic are unchanged by this controls patch. Physical Android Chrome comfort/pinch and real save/leave/reopen remain family checks after deployment. Transparent padding can still affect apparent picture size. Cleanup layout and generated-result identity are separate assignments and are not claimed fixed here.

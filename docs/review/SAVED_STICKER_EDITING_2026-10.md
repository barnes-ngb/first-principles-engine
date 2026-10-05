# Saved-version sticker editing — review draft

Status: BUILT locally and independently reviewed, October 4, 2026 (FEAT-201). Not published, merged, deployed or family-verified.

## Behavior

A saved themed version opens its own editor from the large sticker preview. It retains that version's look, accepts one short instruction, previews the result, and saves only on explicit Save as new version. Existing source pictures and library rows remain unchanged. Generated images can vary beyond the requested detail; automated tests do not establish visual fidelity.

The session binds family, actor context and source metadata. Closing or changing context invalidates pending UI work. Source identity is rechecked before generation and first save. A usable late generation still counts through the original request's quota callback. A save retry after an uncertain acknowledgement uses the same row and payload.

Existing sourceDrawingId grouping and child attribution are retained. Standalone stickers remain standalone. No new lineage field or instruction storage is introduced. Settings does not expose the paid editing door by default.

## Release order

This frontend requires the backward-compatible savedStickerEdit functions contract from FIX-259. Deploy the matching functions before exposing the new hosting UI. An older backend ignores the nested field and can perform the legacy redraw instead. Release remains owner-controlled.

## Family check after release

On Android Chrome phone and tablet, then laptop Chrome: open a non-first themed version, edit a small detail, compare the retained look, save and reopen once. Confirm the source is unchanged and the new version appears under the intended child/group. Check cancel, long pasted instruction feedback, and a failed save/retry if practical. Report actual image fidelity separately from control reliability.

## Evidence

Independent acceptance: 51 actual-component checks passed, including four countertests that first failed against earlier candidates. These cover full pasted instructions, cancellation during preflight/generation/save, same-ID source replacement, and a dismissed ambiguous-save retry. All seven source/test files passed scoped ESLint. Synthetic browser checks at 360/800/1280px confirmed preview, explicit save, preserved long-input rejection and 44px dialog actions; uncertain-save retry retained the same destination and payload without another generation. No live provider or family media used. Full exact-commit lint/build/app-tests/docs/functions checks are release gates recorded in the local handoff after the candidate is committed; do not infer them from the writer report. Windows compiler checks encounter existing case-colliding filenames; the exported Git tree on Linux is the authoritative build gate.


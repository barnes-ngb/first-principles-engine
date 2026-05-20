# Hero Hub Animation PR Queue Triage — 2026-04-07

## Scope + constraint

This triage is based on local git merge history in this checkout. I could not query GitHub open/closed state from this environment, so this is the maintainer-ready **decision map** to apply against the current open PR list in GitHub.

## Best next path

**Move forward the mobile-visibility tuning path** (the change set represented by PR #941), because it is the smallest user-visible improvement with low regression risk:

- wider planted stance on small screens
- stricter foot spacing
- preserved anti-clipping guardrails from prior chain

In other words: prefer one clearly visible stability-safe tuning PR, then close duplicate “same-fix” branches.

## Already-merged chain to anchor against

These are already merged in sequence and should be treated as baseline:

- #921 — first idle/collision tightening
- #924 — self-clipping constraints
- #925 — stance + arm clearance guardrails
- #929 — idle motion refinement
- #933 — centralized tuning config/debug controls
- #936 — additional anti-clipping tightening
- #940 — deploy audit / validation notes (non-behavioral)
- #941 — mobile-visible silhouette/tuning update
- #943 — follow-up validation/audit refresh (non-behavioral)

## Queue grouping rubric (apply to currently open Hero Hub PRs)

### 1) Merge next

Choose **one** open PR for merge if it matches all of:

- Implements the mobile-visible stance/foot separation improvement without undoing #936 guardrails.
- Is the narrowest diff (prefer tuning/constants over deep animation loop rewrites).
- Includes before/after note or simple reproduction context for mobile viewport.

**Expected winner:** the branch equivalent to #941's intent.

### 2) Keep for reference

Keep open (or convert to draft) only PRs that are primarily:

- instrumentation/debug toggles,
- diagnostics write-ups,
- reproduction scaffolding,
- or benchmark comparisons

and do **not** materially change runtime behavior beyond what merged chain already provides.

Typical examples: audit/validation PRs equivalent to #940 / #943 intent.

### 3) Close as superseded

Close open PRs that:

- re-implement clipping fixes already landed in #924/#925/#936,
- propose older tuning values weaker than the merged #941 settings,
- or are broad rewrites where the only net gain is already present in merged commits.

## Overlap explanation with merged chain

When reviewing an open Hero Hub animation PR, tag overlap like this:

- **Guardrail overlap** → already landed by #924/#925/#936.
- **Idle refinement overlap** → already landed by #929.
- **Tuning system overlap** → already landed by #933.
- **Visibility tuning overlap** → already landed by #941.
- **Validation/doc overlap** → already landed by #940/#943.

If an open PR is mostly overlap in any single bucket above, close it unless it adds a clearly new behavior.

## Draft close reasons (short, maintainer-friendly)

Use whichever fits each stale PR:

1. **Superseded by merged guardrails**
   - "Thanks for this—closing as superseded by merged Hero Hub guardrail chain (#924/#925/#936), which already covers the clipping/spacing fixes in this diff."

2. **Superseded by merged mobile tuning**
   - "Closing as superseded by merged mobile-visibility tuning (#941). This PR overlaps the same stance/foot-separation path with no net new behavior."

3. **Superseded by merged tuning architecture**
   - "Closing as superseded by merged tuning framework work (#933), which now centralizes these controls and makes this branch redundant."

4. **Superseded by validation merges**
   - "Closing as superseded by the merged validation/audit updates (#940/#943). Keeping history in those threads for traceability."

5. **Stale branch, no longer on chosen path**
   - "Closing this stale branch to keep the queue focused on one merge path. Happy to reopen if we decide to revisit this exact approach."

## Draft summary comment for the PR that should move forward

"Maintainer summary: this is the right next merge for Hero Hub animation because it gives the clearest mobile-visible improvement (stance/foot separation) while preserving the already-merged anti-clipping guardrails. It is a low-risk tuning-layer change that builds directly on #933/#936 rather than reopening animation-loop complexity. If this lands, we can close overlapping PRs as superseded and keep the queue clean." 

# State-configurable compliance (DATA-12)

**Status:** scaffold landed — MO active and byte-identical; TX + TEFA **defined, not activated**.
**Code:** `src/core/compliance/stateCompliance.ts` · **Type:** `FamilySettings.homeschoolState` (defaults `'MO'`).

## Why

The family is moving to Texas (see `PROJECT_CONTEXT.md` › Strategic Direction §2). Missouri's
compliance rules — 1,000 hours, ≥600 core, ≥600 at home, the five required subjects, the July 1
school-year start, and the RSMo 167.031 citation — were hardcoded across `ComplianceDashboard.tsx`,
`records.logic.ts`, and `RecordsPage.tsx`. A TX toggle would have meant simultaneous edits in all
three. DATA-12 extracts those rules into a per-state config so **the move is a setting flip, not a
rebuild** — while changing **nothing** for MO today.

**Non-goal / hard boundary:** this does **not** touch the hours **computation**
(`collectHoursContributions` / `computeHoursSummary` — the DATA-11 counting path). Only the
**targets, required-subject list, at-home rule, citation, and school-year start** are config. The
counting path stays MO-shaped (TX simply imposes no hours target, so nothing needs counting
differently).

## The three-mode model

| Mode | Hours | Testing | Subjects | Citation |
|---|---|---|---|---|
| **MO** (active) | 1,000 total / 600 core / **600 at home** | none | Reading, Language Arts, Math, Science, Social Studies | RSMo 167.031 |
| **TX-baseline** | **none** | none | five TX areas, covered visually | Tex. Educ. Code §25.086 / *Leeper v. Arlington ISD* |
| **TX-TEFA** | none | **annual norm-referenced, grades 3–12** | five TX areas | §25.086 / *Leeper* + EFA program rules |

- **MO** — Missouri private-instruction model. Hours/core/at-home tracked and targeted on the
  dashboard; the printable report carries the RSMo citation. This is the default and is reproduced
  **byte-identically** by `getStateConfig('MO')`.
- **TX-baseline** — Texas treats homeschools as private schools (*Leeper*; cf. 2025 HB 2674). **No**
  hours, testing, or reporting; the obligation is to cover five subjects in good faith. The dashboard
  switches to a no-hours, evidence-based render (defined but unexercised — MO is default).
- **TX-TEFA** — the **Education Freedom Account** grant toggled **on top of** TX-baseline. Adds annual
  norm-referenced testing for grades 3–12, a **$2,000/student** EFA spending cap, and audit-ready
  expense evidence. Modeled as `getStateConfig('TX', { tefaEnrolled: true })`.

## Config shape

```ts
interface StateComplianceConfig {
  hoursRequirement: { total; core; coreAtHome } | null  // null = no hours requirement (TX)
  requiredCoreSubjects: SubjectBucket[]
  schoolYearStart: { month; day }                       // month is 1-based
  legalCitation: string                                 // verbatim, shown on exports
  tefa: { enrolled; testingRequired; testingGradeBand: [number, number]; perStudentCap } | null
}
```

- **MO_CONFIG** — `1000 / 600 / 600`, the five subjects, July 1, the RSMo citation verbatim,
  `tefa: null`.
- **TX_CONFIG** — `hoursRequirement: null`; `requiredCoreSubjects` best-effort-mapped from TX's
  reading / spelling / grammar / math / good-citizenship onto existing `SubjectBucket`s (spelling +
  grammar → LanguageArts; good citizenship → SocialStudies — **flagged with a `// TODO`** as an
  imperfect mapping); citation `Tex. Educ. Code §25.086 / Leeper v. Arlington ISD`;
  `tefa: { enrolled: false, testingRequired: true, testingGradeBand: [3, 12], perStudentCap: 2000 }`.
- **`getStateConfig(state?, opts?)`** — returns the config; **defaults to MO**. `opts.tefaEnrolled`
  flips the TX EFA overlay on without mutating the shared singleton (no-op for states without a
  `tefa` overlay).

## What activates on the move (none built now)

When `homeschoolState` flips to `'TX'`, the following become reachable — **none are implemented**, this
is the parked surface:

1. **No-hours dashboard mode** — `ComplianceDashboard` already branches to a defined-but-unexercised
   "no state hours requirement — evidence-based" render when `hoursRequirement` is `null`. MO never
   hits it.
2. **Parent-only TEFA test record** — a place to log the annual norm-referenced test result required
   by the EFA grant (grades 3–12). Not built.
3. **Expense-cap awareness** — surfacing the **$2,000/student** EFA cap against logged expenses. Not
   built.

## Testing-rule caveat (verify before activating TEFA)

Sources **disagree** on whether the homeschool EFA requires testing:

- **THSC (Texas Home School Coalition):** reads the program as **no testing** for homeschoolers.
- **EdChoice / myschoolchoice:** describe **norm-referenced testing for grades 3–12**.

The **Texas Comptroller's final program rules are authoritative.** `TX_CONFIG.tefa.testingRequired`
is set to `true` as the conservative default, but **confirm against the Comptroller's rules before
activating TEFA**. EFA enrollment runs on the **2027–28** cycle, so there is time to verify.

## Guardrails (DATA-12)

- **MO byte-identical** — characterization tests assert targets, the core-subject set, the citation
  string, and the at-home rule are unchanged (`src/core/compliance/stateCompliance.test.ts` +
  the verbatim-citation guard in `records.logic.test.ts`). The dashboard renders identically for MO.
- **Hours computation untouched** — `collectHoursContributions` / `computeHoursSummary` are not in
  the diff.
- **`homeschoolState` defaults MO** everywhere it is read; there is **no switch UI**.
- **TX subject mapping is flagged, not forced** (`// TODO`).
- **Per-family clean** — the config keys on `FamilySettings.homeschoolState`; nothing is hardcoded to
  one family.

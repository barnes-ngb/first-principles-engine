import { SubjectBucket } from '../types/enums'

// ─── State-configurable compliance (DATA-12) ─────────────────────────────────
//
// Extracts the previously hardcoded Missouri compliance rules into a per-state
// config so a future Texas move is a *setting flip, not a rebuild*. Missouri is
// the default and its values are reproduced here EXACTLY — wiring the dashboard
// / records exports through `getStateConfig('MO')` is byte-identical.
//
// Texas (and the TEFA grant overlay) are DEFINED-NOT-ACTIVATED: the shapes are
// here so the move is a config change, but there is no switch UI and MO stays
// the active state. See docs/review/STATE_COMPLIANCE_DESIGN.md for the
// three-mode model (MO / TX-baseline / TX-TEFA) and the testing-rule caveat.

export const HomeschoolState = {
  MO: 'MO',
  TX: 'TX',
} as const
export type HomeschoolState = (typeof HomeschoolState)[keyof typeof HomeschoolState]

/** Annual instructional-hours requirement. `null` on a state config means the
 *  state imposes no hours requirement (e.g. TX, a private-school model). */
export interface HoursRequirement {
  /** Total annual instructional hours required. */
  total: number
  /** Core-subject hours required (a subset of `total`). */
  core: number
  /** Of the core hours, how many must occur at the regular place of
   *  instruction ("at home"). */
  coreAtHome: number
}

/** Texas Education Freedom Account (TEFA / "EFA") overlay — a grant toggled ON
 *  TOP of the TX base state. Layers annual norm-referenced testing and a
 *  per-student spending cap. DEFINED-NOT-ACTIVATED. */
export interface TefaConfig {
  /** Whether the family has opted into the EFA grant. */
  enrolled: boolean
  /** Whether enrollment requires annual norm-referenced testing.
   *  NOTE: sources disagree — see the testing-rule caveat in the design doc.
   *  Verify against the Comptroller's final rules before activating. */
  testingRequired: boolean
  /** Inclusive grade band [min, max] in which testing is required. */
  testingGradeBand: [number, number]
  /** Per-student EFA spending cap, in USD. */
  perStudentCap: number
}

export interface StateComplianceConfig {
  /** Hours requirement, or `null` when the state imposes none (TX). */
  hoursRequirement: HoursRequirement | null
  /** Core subjects that must be covered (MO: counted/targeted; TX: covered
   *  visually). */
  requiredCoreSubjects: SubjectBucket[]
  /** School-year start. `month` is 1-based (1 = January). */
  schoolYearStart: { month: number; day: number }
  /** Legal citation displayed on compliance exports, verbatim. */
  legalCitation: string
  /** EFA / TEFA grant overlay, or `null` when the state has no such program. */
  tefa: TefaConfig | null
}

// ─── Missouri (active default) ───────────────────────────────────────────────
//
// Reproduces the CURRENT hardcoded values EXACTLY (DATA-12 byte-identical):
//   1000 total / 600 core / 600 at-home, the five required subjects, July 1
//   school-year start, and the RSMo 167.031 citation string verbatim.

export const MO_CONFIG: StateComplianceConfig = {
  hoursRequirement: { total: 1000, core: 600, coreAtHome: 600 },
  requiredCoreSubjects: [
    SubjectBucket.Reading,
    SubjectBucket.LanguageArts,
    SubjectBucket.Math,
    SubjectBucket.Science,
    SubjectBucket.SocialStudies,
  ],
  schoolYearStart: { month: 7, day: 1 },
  legalCitation:
    'MO RSMo 167.031 requires 1,000 hours of instruction (600 in core subjects: Reading, Language Arts, Math, Science, Social Studies). At least 600 hours must occur at the regular place of instruction.',
  tefa: null,
}

// ─── Texas (defined, NOT activated) ──────────────────────────────────────────
//
// TX treats homeschools as private schools (Leeper v. Arlington ISD): no hours
// requirement, no testing, no state reporting — cover five subjects in good
// faith. The EFA/TEFA grant is a separate overlay (see TX_CONFIG.tefa) that, if
// enrolled, layers annual testing + a spending cap on top.

export const TX_CONFIG: StateComplianceConfig = {
  hoursRequirement: null,
  // TODO(DATA-12): imperfect mapping. TX's five required areas are
  // reading / spelling / grammar / math / good citizenship. Our SubjectBucket
  // taxonomy has no Spelling/Grammar/Citizenship buckets, so spelling + grammar
  // both collapse into LanguageArts and good citizenship maps to SocialStudies.
  // Deduped here; revisit if the bucket taxonomy gains finer-grained subjects.
  requiredCoreSubjects: [
    SubjectBucket.Reading,
    SubjectBucket.LanguageArts, // ← spelling + grammar
    SubjectBucket.Math,
    SubjectBucket.SocialStudies, // ← good citizenship
  ],
  schoolYearStart: { month: 8, day: 1 },
  legalCitation: 'Tex. Educ. Code §25.086 / Leeper v. Arlington ISD',
  tefa: {
    enrolled: false,
    testingRequired: true,
    testingGradeBand: [3, 12],
    perStudentCap: 2000,
  },
}

const CONFIGS: Record<HomeschoolState, StateComplianceConfig> = {
  [HomeschoolState.MO]: MO_CONFIG,
  [HomeschoolState.TX]: TX_CONFIG,
}

export interface GetStateConfigOptions {
  /** TEFA toggle, only meaningful for TX: when `true`, returns the TX config
   *  with its EFA overlay marked `enrolled` (the TX-TEFA mode). Ignored for
   *  states with no `tefa` overlay (e.g. MO). */
  tefaEnrolled?: boolean
}

/**
 * Resolve the compliance config for a state. **Defaults to Missouri** when the
 * state is undefined/unrecognized, so every call site is MO-safe.
 *
 * `opts.tefaEnrolled` flips the TX EFA overlay on (the third compliance mode);
 * it is a no-op for states without a `tefa` overlay.
 */
export function getStateConfig(
  state?: HomeschoolState,
  opts?: GetStateConfigOptions,
): StateComplianceConfig {
  const config = (state && CONFIGS[state]) || MO_CONFIG
  if (opts?.tefaEnrolled && config.tefa) {
    return { ...config, tefa: { ...config.tefa, enrolled: true } }
  }
  return config
}

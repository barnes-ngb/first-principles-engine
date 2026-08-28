// ── The copy for removing a program from Curriculum (FEAT-162 / UX-48) ────
//
// Curriculum's overflow menu holds the one truly destructive tap on Progress:
// "Remove" called `deleteConfig` → `deleteDoc` with no dialog and no undo,
// while the *reversible* "Mark as complete" two lines above it got a full
// confirm dialog promising the program "will stay in your records." The safety
// budget was exactly inverted.
//
// It is also the one surface exempted from a stance the codebase states
// outright — `core/firebase/activityConfigWrites.ts`: "No delete here, on
// purpose. The chat's only removal is completion — retire, don't delete."
// `deleteConfig` stays reachable only from here, and here had no guard on it.
//
// The copy is pure and lives apart from the dialog so what the tap claims is
// testable without mounting Progress. Three sentences, in the order a parent
// needs them: what goes, what stays, and the gentler path that already exists.

/** The slice of an `ActivityConfig` this copy reads. */
export interface RemovableActivity {
  name: string
  /** Lesson/page the program is up to, when it has one. */
  currentPosition?: number
  /** Total lessons/chapters/units, when known. */
  totalUnits?: number
  /** "lesson" | "chapter" | "unit" — the program's own word. */
  unitLabel?: string
  /** Already marked finished, so "Mark as complete" is not a path forward. */
  completed?: boolean
}

export interface DeleteActivityPrompt {
  title: string
  /** What the tap destroys. */
  whatGoes: string
  /** What survives it — the honest half, and the one a parent most needs. */
  whatStays: string
  /** The gentler path that already exists. Absent once the program is finished. */
  gentlerPath?: string
  confirmLabel: string
}

/** The menu label. "Remove" undersold a `deleteDoc` with no undo behind it. */
export const DELETE_ACTIVITY_MENU_LABEL = 'Delete permanently'

/**
 * The program's saved place, in its own words, or `null` when it hasn't got
 * one. Position 0 is "not started", not a place — naming it would put "lesson
 * 0" in a warning sentence, so it reads as no position at all.
 */
export function positionPhrase(config: RemovableActivity): string | null {
  const { currentPosition, totalUnits } = config
  if (currentPosition == null || currentPosition <= 0) return null
  const unit = config.unitLabel?.trim() || 'lesson'
  if (totalUnits != null && totalUnits > 0) {
    return `${unit} ${currentPosition} of ${totalUnits}`
  }
  return `${unit} ${currentPosition}`
}

/**
 * The confirm dialog's words for one program.
 *
 * `whatStays` is not reassurance for its own sake: deleting the config does
 * NOT touch a day log. Recorded rows keep their labels, minutes, evidence and
 * completion — `ChecklistItem.activityConfigId` is a stored string, and no
 * reader of it rewrites history when the config is gone. What is actually and
 * irrecoverably lost is the config document: its saved position, its unit
 * total and its curriculum metadata. The two sentences say exactly that,
 * because a parent deleting a finished workbook and a parent deleting the
 * wrong card need to be able to tell those apart before they tap.
 */
export function buildDeleteActivityPrompt(config: RemovableActivity): DeleteActivityPrompt {
  const place = positionPhrase(config)
  const whatGoes = place
    ? `This deletes "${config.name}" and the place you're up to — ${place}. There's no undo, and that position can't be recovered.`
    : `This deletes "${config.name}" for good. There's no undo.`
  return {
    title: `Delete "${config.name}" permanently?`,
    whatGoes,
    whatStays:
      "Days you've already logged keep their rows, minutes and photos — deleting this doesn't change your records.",
    ...(config.completed
      ? {}
      : {
          gentlerPath:
            'If you\'re just finished with it, "Mark as complete" keeps it in your records and stops it appearing in future plans.',
        }),
    confirmLabel: DELETE_ACTIVITY_MENU_LABEL,
  }
}

/**
 * What a REJECTED delete says (UX-83's shape: what failed, that nothing was
 * lost, what to do). `void handleDelete(...)` floated the promise and the
 * `"{name}" removed` snack only ran on success, so a failed delete said
 * nothing at all — in the one place where a parent most needs to know whether
 * the tap landed.
 */
export function deleteFailureNotice(name: string): string {
  return `Couldn't delete "${name}" — it's still in your curriculum and nothing was lost. Check your connection and try again.`
}

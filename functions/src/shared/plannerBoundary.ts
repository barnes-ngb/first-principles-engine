/**
 * The planner chat's boundary: which jobs it must refuse, and where each one
 * really lives (UX-269 addendum).
 *
 * ## Why a table and not a sentence
 *
 * `functions/src/ai/tasks/shellyChat.ts`'s `NAVIGATION_HONESTY_RULE` already
 * carries the true screen-per-job map — but it carries it as **prose**, written
 * for one model to read. The planner chat needs the same map as **data**: the
 * server has to tell its model which jobs it may name, and the client has to
 * turn the named job into a button it can navigate to. A second consumer reading
 * that prose would have had to invent its own copy of the pairs, which is the
 * duplication ARCH-47 exists to stop.
 *
 * So this is the pairs, once. It is deliberately **not** the source of
 * `NAVIGATION_HONESTY_RULE` — regenerating that prose from this table is
 * FEAT-214 (`DESIGN_one-place-to-ask.md`), a separate run. The prose rule is
 * untouched; this only stops the second consumer from writing a third copy.
 *
 * ## Why the app renders the link and the model does not write it
 *
 * A model-composed route is the invented-screen failure with a tap on it — the
 * exact defect `NAVIGATION_HONESTY_RULE` was written for, made worse by being
 * clickable. So the model signals only **which job** it declined, as a marker;
 * this module maps that to a route the client knows exists (asserted against
 * `src/app/router.tsx` by test), and the client renders the button.
 *
 * ## Why `route` is always a bare path
 *
 * Every route here appears verbatim in the app's route table, so the assertion
 * that a link cannot point at a screen that does not exist is a lookup rather
 * than a string match against a query string. A link that needs a tab or a
 * param is a decision to take when one is needed, not a shape to build for.
 *
 * Pure: no I/O, no React, no Firestore, nothing environment-specific.
 */

/** One job the planner chat cannot do, and the one place it really lives. */
export interface PlannerBoundaryJob {
  /**
   * The token the model writes inside its marker. Lowercase, hyphenated, and
   * short — a model picking from a list of six gets this right far more often
   * than it composes a path.
   */
  readonly id: string;
  /**
   * What this job covers, in the parent's own terms. Goes into the planner
   * prompt verbatim, so it reads as an instruction rather than a schema.
   */
  readonly covers: string;
  /**
   * Where the client sends her. A bare path from `src/app/router.tsx`.
   *
   * `/chat` (Ask AI) wherever Ask AI can actually make the change behind a
   * confirm card; the owning screen wherever it cannot. Owner decision,
   * 2026-09-08: a link to a chat that can write the thing beats a link to a
   * screen she then has to drive herself — but only where that write exists.
   */
  readonly route: string;
  /** The button. Says where it goes, never what it will do when it gets there. */
  readonly linkLabel: string;
}

/**
 * The jobs the planner chat refuses, and where each goes.
 *
 * Kept deliberately short. This list is read aloud to the model on every
 * planner call, and a model choosing from six named jobs is far more reliable
 * than one choosing from twenty — and an unreliable choice here is a wrong
 * link, which the addendum rates worse than a general one. Anything not on the
 * list falls back to Ask AI rather than being guessed at.
 */
export const PLANNER_BOUNDARY_JOBS: readonly PlannerBoundaryJob[] = [
  {
    id: "curriculum",
    covers:
      "the family's activities themselves — adding one, renaming one, changing how many minutes one takes by default, marking one finished, or setting where a child is up to in it",
    route: "/chat",
    linkLabel: "Open Ask AI",
  },
  {
    id: "videos",
    covers:
      "the curated video library — adding a video, retiring one, or putting a retired one back",
    route: "/chat",
    linkLabel: "Open Ask AI",
  },
  {
    id: "dad-lab",
    covers:
      "Dad Lab — concept arcs and labs: creating, starting, completing, marking a step done, or archiving one",
    route: "/chat",
    linkLabel: "Open Ask AI",
  },
  {
    id: "records",
    covers:
      "hours, compliance records, evaluations, or the portfolio — including logging or correcting hours",
    route: "/records",
    linkLabel: "Open Records",
  },
  {
    id: "today",
    covers:
      "what is on TODAY's checklist right now, marking something done, or the day's energy",
    route: "/today",
    linkLabel: "Open Today",
  },
  {
    id: "settings",
    covers:
      "the account, a child's profile, voice input, or the sticker library",
    route: "/settings",
    linkLabel: "Open Settings",
  },
] as const;

/**
 * Where a declined job goes when the marker names nothing usable.
 *
 * The marker is a **hint, not a gate** (owner, 2026-09-08). A malformed or
 * unrecognised job id must never become a guessed destination: a wrong link is
 * worse than a general one, so an unreadable signal lands on the one screen
 * that can take almost any ask and put a confirm card in front of her.
 */
export const PLANNER_BOUNDARY_FALLBACK: PlannerBoundaryJob = {
  id: "ask-ai",
  covers: "anything else this chat cannot change",
  route: "/chat",
  linkLabel: "Open Ask AI",
};

/**
 * Every route this module can send someone to, fallback included.
 *
 * Exported so the router assertion reads the same list the links read — a test
 * that walks a hand-written array of paths proves nothing about the array the
 * app uses.
 */
export function plannerBoundaryRoutes(): string[] {
  const routes = PLANNER_BOUNDARY_JOBS.map((job) => job.route);
  routes.push(PLANNER_BOUNDARY_FALLBACK.route);
  return [...new Set(routes)];
}

/** Look a job up by the token the model wrote. Case- and space-insensitive. */
export function plannerBoundaryJobById(
  id: string | null | undefined,
): PlannerBoundaryJob | null {
  if (typeof id !== "string") return null;
  const key = id.trim().toLowerCase();
  if (key === "") return null;
  return PLANNER_BOUNDARY_JOBS.find((job) => job.id === key) ?? null;
}

/**
 * A well-formed marker: `[[BOUNDARY:curriculum]]`, or `[[BOUNDARY]]` when the
 * model declined something it could not place.
 *
 * Tolerant on purpose — whitespace, a missing colon and any casing all parse,
 * because every shape this fails to match is a shape that leaks the raw marker
 * into a sentence a parent reads.
 */
const MARKER_RE = /\[\[\s*BOUNDARY\s*:?\s*([A-Za-z0-9_-]*)\s*\]\]/gi;

/**
 * The marker as the prompt shows it, and the id-less form for a job the list
 * does not cover.
 *
 * Exported so the planner prompt cannot demonstrate a shape the parser does not
 * accept — a test parses both, so a change to either syntax fails here rather
 * than silently leaking `[[BOUNDARY:…]]` into a sentence Shelly reads.
 */
export const PLANNER_BOUNDARY_MARKER_EXAMPLE = "[[BOUNDARY:curriculum]]";
export const PLANNER_BOUNDARY_MARKER_UNPLACED = "[[BOUNDARY]]";

/**
 * A marker the model started and did not finish — a truncated response, or one
 * closing bracket short.
 *
 * Anchored to the end of the string because that is the only place a partial
 * marker can honestly be read as one: `[[BOUNDARY` in the middle of a sentence
 * is far likelier to be prose about the feature than a signal, and stripping it
 * there would eat a parent's own words.
 */
const TRUNCATED_MARKER_RE = /\[\[\s*BOUNDARY\b[^\]]*$/i;

/** What the planner chat learned from one assistant reply. */
export interface PlannerBoundaryParse {
  /** The reply with every marker removed. This is the ONLY text ever rendered. */
  text: string;
  /**
   * Where to send her, or `null` when the reply carried no marker at all.
   *
   * `null` means "no boundary was declared", **not** "declared but unreadable"
   * — those are different, and only the second falls back to Ask AI. An absent
   * marker is an ordinary reply, and hanging a link off every ordinary reply
   * would turn the boundary into a wall on turns that never hit one.
   */
  destination: PlannerBoundaryJob | null;
}

/**
 * Read (and remove) the boundary marker from an assistant reply.
 *
 * The strip is unconditional and happens here, in the one place, so no caller
 * can render a reply that still carries its marker: the FEAT-135 shape, where a
 * block was stripped in one path and a second path promised a card that never
 * came. Callers store `text` and render `text`; nothing else sees the raw reply.
 */
export function parsePlannerBoundary(
  raw: string | null | undefined,
): PlannerBoundaryParse {
  if (typeof raw !== "string" || raw === "") {
    return { text: "", destination: null };
  }

  // `matchAll` rather than a `replace` callback: a variable assigned inside a
  // callback is not narrowed by TypeScript's control flow, so the "did it name
  // a job" answer would have to be read back through a cast.
  const matches = [...raw.matchAll(MARKER_RE)];
  const namedJob = matches
    .map((m) => plannerBoundaryJobById(m[1]))
    .find((job): job is PlannerBoundaryJob => job !== null);

  let sawMarker = matches.length > 0;
  let text = raw.replace(MARKER_RE, "");

  if (TRUNCATED_MARKER_RE.test(text)) {
    sawMarker = true;
    text = text.replace(TRUNCATED_MARKER_RE, "");
  }

  if (sawMarker) {
    // Removing a marker that sat on its own line leaves the blank line it was
    // on plus the one above it; collapse runs so the reply does not end in a
    // gap where the marker used to be.
    text = text.replace(/\n{3,}/g, "\n\n");
  }
  text = text.trim();

  return {
    text,
    destination: sawMarker ? (namedJob ?? PLANNER_BOUNDARY_FALLBACK) : null,
  };
}

/**
 * The strip on its own, for render-time use.
 *
 * Same definition, called twice — not a second stripper. A future call site
 * that forgets to parse still cannot leak `[[BOUNDARY:…]]` into a sentence
 * Shelly reads, because the component that draws the sentence runs this.
 */
export function stripPlannerBoundaryMarkers(
  raw: string | null | undefined,
): string {
  return parsePlannerBoundary(raw).text;
}

/**
 * Task: shellyChat
 * Context: charter + childProfile + engagement + gradeResults + recentEval
 *          + sightWords + weekFocus + wordMastery + workbookPaces
 *          + skillSnapshot + recentHistoryByDomain (cross-domain)
 *          + recentScans + dayToday + dadLabReports (via buildContextForTask)
 *          + supplemental: all children, disposition profile (dispositionCache
 *            with overrides), recent weekly reviews (5-row strip), conundrum
 *            title, completion patterns, conundrum response count, chapter
 *            responses, recent teach-backs (14d, limit 10)
 *          + general-branch only (no childId): every child's learnerModel slice
 *            concatenated under per-child headers (FEAT-60) — read-only, for
 *            grounded cross-child comparison; no actions are emitted here
 *          + child-scoped PLANNING-PARTNER MODE addendum in roleSection
 * Voice: parent-neutral — the prompt addresses the user as "you" and never
 *        asserts which parent is typing (FEAT-60; Learning Engine voice, FEAT-53).
 * Model: Sonnet
 */
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, callClaudeWithVisionUrls, logAiUsage } from "../chatTypes.js";

/**
 * Pull leading `[IMAGE_URL:…]` markers (one OR MORE) off a message content
 * (FEAT-59 — brings shellyChat to multi-image parity with foundationsReview).
 * A single marker behaves exactly as the prior single-image path.
 */
const IMAGE_MARKER_RE = /\[IMAGE_URL:(https?:\/\/[^\]]+)\]/g;
export function extractImageUrls(content: string): { urls: string[]; text: string } {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  IMAGE_MARKER_RE.lastIndex = 0;
  while ((m = IMAGE_MARKER_RE.exec(content)) !== null) urls.push(m[1]);
  const text = content.replace(IMAGE_MARKER_RE, "").trim();
  return { urls, text };
}
import { buildContextForTask, loadLearnerModelContext } from "../contextSlices.js";
import { modelForTask, getWeekMonday } from "../chat.js";
import { summarizeTeachBacks } from "../evaluate.js";

// ── Pure formatters (exported for testability) ────────────────────

/** Shape of the cached AI disposition stored on a child doc. */
export interface DispositionCacheDoc {
  result?: {
    profileDate?: string;
    dispositions?: Record<string, { level?: string; narrative?: string; trend?: string } | undefined>;
    celebration?: string;
    nudge?: string;
  };
  generatedAt?: string;
}

/** Per-disposition parent overrides stored on a child doc. */
export type DispositionOverridesDoc = Record<string, { text?: string } | undefined>;

/** A single weekly-review doc row consumed by the trajectory formatter. */
export interface WeeklyReviewRow {
  weekKey?: string;
  status?: string;
  summary?: string;
  celebration?: string;
  growthAreas?: string[];
  createdAt?: string;
}

/**
 * An `activityConfigs` doc as the ACTIVITIES section reads it (FEAT-135).
 *
 * Deliberately a SEPARATE shape from `loadWorkbookPaces`' `WorkbookPace`: that
 * loader feeds pace/coverage reasoning for several tasks and filters to
 * `type == "workbook"`, so widening it to carry doc ids and non-workbook rows
 * would shift context under `plan`/`quest` too. This is the sibling read — it
 * changes nothing existing.
 */
export interface ChatActivityRow {
  id: string;
  name?: string;
  subjectBucket?: string;
  defaultMinutes?: number;
  frequency?: string;
  childId?: string;
  completed?: boolean;
  /**
   * FEAT-143 widening. The section had id / name / subject / minutes /
   * frequency, which is everything `setActivityMinutes` needs and nothing the
   * "where is Lincoln in this topic" conversation needs. These three are what
   * make that conversation possible: `type` carries the DATA-08 owner rule
   * (a workbook is per-child, never shared), and the position pair is the whole
   * subject of "he's on lesson 107 now".
   *
   * Widened in place rather than beside: a parallel section would give the model
   * two lists of the same activities and a way to disagree with itself about
   * which id is which.
   */
  type?: string;
  currentPosition?: number;
  totalUnits?: number;
  unitLabel?: string;
}

/**
 * Format the ACTIVITIES section for a child-scoped chat (FEAT-135).
 *
 * This is what lets the assistant NAME an activity and address a
 * `setActivityMinutes` action at a real doc — without it the model has nothing
 * valid to put in a payload, which is precisely why the capability didn't exist
 * before. Each row carries the doc id, name, subject, current default minutes,
 * and frequency.
 *
 * Shared (`childId: 'both'`) configs are marked plainly with the names of every
 * child they cover, because changing one changes the number for all of them —
 * the parent has to be told that BEFORE she taps confirm, and the model can
 * only tell her if it can see it here.
 *
 * FEAT-143 widens each row with `type` and the position pair
 * (`currentPosition` / `totalUnits`), because "where is Lincoln in this topic"
 * is unanswerable without them and `setActivityPosition` has nothing to bump.
 * Position is rendered in the config's own unit noun ("lesson 98 of 140") so the
 * model reads the number the way the parent says it.
 *
 * Completed activities stay excluded, matching `loadWorkbookPaces` — nothing can
 * be proposed against a finished program, so giving it an id would only invite a
 * proposal the app refuses. (The client keeps completed configs in view so a
 * proposal that races a completion can be refused BY NAME; the prompt does not
 * need them, and the exclusion here is a pinned invariant.)
 *
 * Returns "" when nothing survives, so the section is omitted rather than
 * rendered empty.
 */
export function formatChatActivities(
  rows: ChatActivityRow[],
  allChildNames: string[],
): string {
  const active = rows.filter((r) => !r.completed);
  if (active.length === 0) return "";

  const names = allChildNames.filter((n) => n.trim().length > 0);
  const sharedLabel =
    names.length >= 2
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0] || "every child";

  const lines = active.map((r) => {
    const parts = [`- ${r.name || "Untitled activity"}`];
    parts.push(`${r.defaultMinutes ?? 0} min`);
    if (r.frequency) parts.push(r.frequency);
    if (r.subjectBucket) parts.push(r.subjectBucket);
    if (r.type) parts.push(r.type);
    const unit = (r.unitLabel || "lesson").trim() || "lesson";
    if (r.currentPosition != null && r.totalUnits != null) {
      parts.push(`on ${unit} ${r.currentPosition} of ${r.totalUnits}`);
    } else if (r.currentPosition != null) {
      parts.push(`on ${unit} ${r.currentPosition}`);
    } else if (r.totalUnits != null) {
      parts.push(`${r.totalUnits} ${unit}s, position not set`);
    } else {
      parts.push("no position tracked");
    }
    let line = `${parts[0]} — ${parts.slice(1).join(", ")} (id: ${r.id})`;
    if (r.childId === "both") line += ` — shared: ${sharedLabel}`;
    return line;
  });

  return [
    "ACTIVITIES (the structured activities that build every plan — the minutes below are the DEFAULT each FUTURE plan uses, and the position is where the next plan picks up):",
    ...lines,
    "",
    'Use the "id" exactly as written when you propose an action against one of these. An activity marked "shared" belongs to more than one child — changing its minutes changes it for all of them, so say so before proposing. An activity marked "no position tracked" has no lesson number to set.',
  ].join("\n");
}

/** A saved day's checklist row, as the THIS WEEK section reads it (FEAT-142). */
export interface ChatWeekChecklistRow {
  label?: string;
  completed?: boolean;
  skipped?: boolean;
  subjectBucket?: string;
  id?: string;
}

/** One weekday of the current week, for the THIS WEEK section (FEAT-142). */
export interface ChatWeekDayRow {
  /** `YYYY-MM-DD`. */
  dateKey: string;
  /** Weekday name — "Monday". */
  label: string;
  checklist?: ChatWeekChecklistRow[];
}

/**
 * A row's identity, as the app computes it (FEAT-142).
 *
 * This MUST stay byte-identical to the client's `checklistItemKey`
 * (`src/features/today/dayWriteGuard.ts`), because the string this emits is the
 * string the model copies into an action payload, and the client resolves that
 * payload by comparing it against the same function's output. A divergence here
 * doesn't corrupt anything — it makes every proposal fail to resolve, and the
 * parent sees "I couldn't find that item" for rows plainly in front of her.
 *
 * Duplicated rather than shared because `functions/` is a separate TypeScript
 * project with no import path into `src/` (the same deliberate duplication
 * `sanitizeJson` carries). Two lines, pinned by a test on each side.
 */
export function chatChecklistItemKey(item: ChatWeekChecklistRow): string {
  return item.id ?? `${item.label ?? ""}::${item.subjectBucket ?? ""}`;
}

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * The family's timezone when they haven't set one — the same zone every
 * scheduled function in this repo already runs on (`evaluate`, `monthlyReview`,
 * `fileFeatureRequests`, `sweepCompliancePacks`). `Family.timeZone` overrides it.
 */
export const DEFAULT_FAMILY_TIME_ZONE = "America/Chicago";

/**
 * `now` as the CIVIL date (`YYYY-MM-DD`) in a given zone (Codex P2, PR #1667).
 *
 * Day documents are keyed by the **client's local** date (`{date}_{childId}`,
 * built from a browser `Date`). A Cloud Function runs in the runtime's zone —
 * UTC by default — so on a Sunday evening in the US, `new Date()` on the server
 * is already Monday, and deriving the week from it selects the week the family
 * has not started yet. The THIS WEEK section would then read five documents that
 * are not the family's week at all, and every action emitted from it would be
 * refused by the client gate as out-of-week. Sunday evening is exactly when a
 * homeschool parent plans, so this is the wrong hour to be an hour off.
 *
 * `en-CA` because its short date format IS `YYYY-MM-DD`. An unknown zone makes
 * `Intl` throw; we fall back to the runtime's own civil date rather than take
 * the whole chat down over a bad profile field.
 */
export function civilDateInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    console.warn(`[shellyChat] unknown timeZone ${timeZone} — falling back to runtime local`);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * The Mon–Fri date keys of the family's current week, with their weekday names
 * (FEAT-142).
 *
 * Five weekdays, not seven and not a range: the same rule the client's
 * `MoveToDayDialog` / `buildWeekDates` encode, and the same rule the chat's
 * resolution gate applies.
 *
 * The arithmetic runs on the **civil** date in the family's zone, held in UTC
 * so it stays pure calendar maths with no second timezone shift on top of the
 * first — `getUTCDay` / `setUTCDate` / `toISOString().slice(0, 10)` on a date
 * that was constructed at UTC midnight is exact. `getWeekMonday` is deliberately
 * not reused: it operates on a `Date`'s LOCAL components, which is precisely the
 * runtime-zone assumption this function exists to remove.
 */
export function currentWeekDays(
  now: Date = new Date(),
  timeZone: string = DEFAULT_FAMILY_TIME_ZONE,
): { dateKey: string; label: string }[] {
  const civil = new Date(`${civilDateInZone(now, timeZone)}T00:00:00Z`);
  const day = civil.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  // Sunday belongs to the week that is ENDING, matching the client.
  civil.setUTCDate(civil.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(civil);
    d.setUTCDate(civil.getUTCDate() + i);
    return { dateKey: d.toISOString().slice(0, 10), label };
  });
}

/**
 * The ten weekdays a video may be PLANNED onto (FEAT-149): the family's current
 * school week and the next one, labelled the way a card says them out loud.
 *
 * The one deliberate widening past FEAT-142's current-week gate, and scoped to
 * exactly one action. "Find me videos for next week and add them" is the ask, so
 * next week has to be nameable — but only for `planVideoOnDay`, which is purely
 * additive. Move and remove mutate rows a family may already be working through,
 * so they stay pinned to the current week. Next-plus-one and beyond are absent:
 * a longer horizon is an owner decision, not a default.
 *
 * **Elapsed weekdays are dropped** (Codex P2, PR #1676), against the family's
 * CIVIL date — otherwise the list offered to the model would include Monday on a
 * Friday, contradicting the grammar's own "not a past day" rule and inviting a
 * proposal the client gate then refuses. Today is kept. On a weekend the current
 * week is entirely behind, so the window is next week alone.
 *
 * Built by shifting {@link currentWeekDays}, so both windows come from ONE
 * definition of "which week is it right now" — including its civil-date-in-the-
 * family's-zone arithmetic. The mirror of the client's
 * `plannableWatchDayKeys`, which the confirm gate resolves against; the two must
 * agree or the model is told about days the tap will refuse.
 */
export function plannableWatchDays(
  now: Date = new Date(),
  timeZone: string = DEFAULT_FAMILY_TIME_ZONE,
): { dateKey: string; label: string }[] {
  const current = currentWeekDays(now, timeZone);
  const next = current.map((d) => {
    const shifted = new Date(`${d.dateKey}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + 7);
    return { dateKey: shifted.toISOString().slice(0, 10), label: `next ${d.label}` };
  });
  const today = civilDateInZone(now, timeZone);
  return [...current, ...next].filter((d) => d.dateKey >= today);
}

/**
 * The five weekdays of the NEXT school week (FEAT-150), for the `draftNextWeek`
 * grammar.
 *
 * Built by shifting {@link currentWeekDays} seven days, exactly as
 * {@link plannableWatchDays} builds its second half — so "which week is it right
 * now" has ONE definition on this side, including its civil-date-in-the-family's
 * -zone arithmetic and its Sunday-belongs-to-the-week-that-is-ending rule.
 *
 * The mirror of the client's `nextWeekDayKeys`, which the confirm gate and the
 * writer both resolve against. The two must agree or the model would be told
 * about a week the tap refuses.
 *
 * Note what this window does NOT do, unlike `plannableWatchDays`: it drops no
 * elapsed day. Every weekday of next week is still ahead, on every day of this
 * one — that is what makes it next week.
 */
export function nextWeekDays(
  now: Date = new Date(),
  timeZone: string = DEFAULT_FAMILY_TIME_ZONE,
): { dateKey: string; label: string }[] {
  return currentWeekDays(now, timeZone).map((d) => {
    const shifted = new Date(`${d.dateKey}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + 7);
    return { dateKey: shifted.toISOString().slice(0, 10), label: d.label };
  });
}

/**
 * How the drafted week reads in the grammar: "Aug 24–28". The model quotes this
 * back to the parent, so it must be the same span the client's card shows.
 */
export function formatWeekSpan(days: { dateKey: string }[]): string {
  if (days.length === 0) return "next week";
  const fmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  const first = days[0].dateKey;
  const last = days[days.length - 1].dateKey;
  const firstMonth = fmt(first, { month: "short" });
  const lastMonth = fmt(last, { month: "short" });
  const firstDay = fmt(first, { day: "numeric" });
  const lastDay = fmt(last, { day: "numeric" });
  return firstMonth === lastMonth
    ? `${firstMonth} ${firstDay}–${lastDay}`
    : `${firstMonth} ${firstDay} – ${lastMonth} ${lastDay}`;
}

/** One curated library video, as the WATCH LIBRARY section needs to see it. */
export interface WatchLibraryRow {
  id?: string;
  title?: string;
  plannedMinutes?: number;
  subjectBucket?: string;
  childId?: string;
  why?: string;
  status?: string;
}

/**
 * Format the WATCH LIBRARY section for a child-scoped chat (FEAT-149).
 *
 * This is what lets the assistant address a `planVideoOnDay` action at a REAL
 * library entry — the exact division of labour the ACTIVITIES section already
 * has for activity ids. Without it the model has nothing valid to put in a
 * payload, which is precisely why the chat could find a video on the web and
 * still not get it into the app.
 *
 * **Retired entries are listed and marked**, not omitted. Two things go wrong if
 * they're hidden: the model proposes a duplicate vet-in of a video the parent
 * deliberately retired (refused at the gate, but only after spending her
 * attention), and it can't say the true thing — "that one's in the Archive" —
 * when she asks for it by name.
 *
 * Returns "" for an empty library so the section is omitted rather than rendered
 * empty — an empty section reads as "there is no such thing as a library".
 */
export function formatWatchLibrary(
  videos: WatchLibraryRow[],
  childName: string,
): string {
  if (videos.length === 0) return "";

  const lines = videos.map((v) => {
    const bits = [
      `${v.plannedMinutes ?? "?"} min`,
      v.subjectBucket || "Other",
      v.childId === "both" ? "for both boys" : "for this child",
    ];
    if (v.status === "retired") bits.push("RETIRED — cannot be planned");
    const why = v.why ? ` — "${v.why}"` : "";
    return `  - ${v.title || "Untitled"} [${bits.join(", ")}]${why} (watchVideoId: ${v.id ?? ""})`;
  });

  const who = childName || "this child";
  return [
    `WATCH LIBRARY (${who}'s curated, already-vetted videos — the ONLY videos that can be planned onto a day):`,
    ...lines,
    "",
    'Use a "watchVideoId" exactly as written when you propose planning a video. A video marked RETIRED was deliberately taken out of rotation: it cannot be planned and must not be vetted in again — say it is in the Archive tab of Watch Library instead.',
  ].join("\n");
}

/**
 * Format the THIS WEEK section for a child-scoped chat (FEAT-142).
 *
 * This is what lets the assistant name a row on a day and address a
 * `removeItemFromDay` / `moveItemToDay` action at a real one — without it the
 * model has nothing valid to put in a payload, which is exactly why the chat
 * could only ever talk about the week it could not touch.
 *
 * Each row carries its label and its identity key. **Completed and skipped rows
 * are marked plainly**, because the completed-row rule is hard: finished work
 * has credited minutes into the day's hours and may point at real work a boy
 * did, so it can never be moved or removed. The model has to know that BEFORE it
 * proposes, or it spends the parent's tap on a card the write layer will refuse.
 *
 * Empty days are listed rather than omitted — a weekday with nothing on it is
 * still a day a row can be moved onto or added to, and a gap in the list would
 * read as "that day doesn't exist". Returns "" only when the whole week is
 * missing, so the section is omitted rather than rendered empty.
 */
export function formatChatWeekDays(
  days: ChatWeekDayRow[],
  childName: string,
): string {
  if (days.length === 0) return "";

  const lines: string[] = [];
  for (const day of days) {
    const rows = day.checklist ?? [];
    lines.push(`${day.label} (${day.dateKey}):`);
    if (rows.length === 0) {
      lines.push("  (nothing on this day yet)");
      continue;
    }
    for (const row of rows) {
      const marks: string[] = [];
      if (row.completed) marks.push("DONE — cannot be moved or removed");
      else if (row.skipped) marks.push("skipped");
      const suffix = marks.length > 0 ? ` [${marks.join(", ")}]` : "";
      lines.push(
        `  - ${row.label || "Untitled"}${suffix} (itemKey: ${chatChecklistItemKey(row)})`,
      );
    }
  }

  const who = childName || "this child";
  return [
    `THIS WEEK (${who}'s live checklist, Monday–Friday of the CURRENT week — this is what is actually saved on each day right now):`,
    ...lines,
    "",
    'Use an "itemKey" exactly as written when you propose a live-day action, and only for the day it is listed under. A row marked DONE is finished work: it has already counted toward the week\'s hours and may point at something the child made, so it can never be moved or removed — say so instead of proposing.',
  ].join("\n");
}

/** Raw artifact shape consumed by the teach-backs formatter. */
export interface TeachBackArtifactInput {
  title?: string;
  type?: string;
  notes?: string;
  content?: string;
  createdAt?: string;
  mediaUrl?: string;
  uri?: string;
  tags?: { subjectBucket?: string; engineStage?: string };
}

const DISPOSITION_ORDER = ["curiosity", "persistence", "articulation", "selfAwareness", "ownership"];
const DISPOSITION_LABELS: Record<string, string> = {
  curiosity: "Curiosity",
  persistence: "Persistence",
  articulation: "Articulation",
  selfAwareness: "Self-Awareness",
  ownership: "Ownership",
};

/**
 * Format the disposition profile block for a child.
 *
 * Reads `dispositionCache.result.dispositions` and applies
 * `dispositionOverrides[key].text` over the AI narrative per the UI's
 * `effectiveDispositionText` helper. Emits the five dimensions in fixed
 * order. Returns "" (and the caller appends nothing) when no cache exists
 * or no disposition has any usable text — omit-on-empty per Phase 1's
 * "don't explain absence" rule.
 */
export function formatDispositionProfile(
  childName: string,
  cache: DispositionCacheDoc | undefined,
  overrides: DispositionOverridesDoc,
): string {
  const dispositions = cache?.result?.dispositions;
  if (!dispositions) return "";

  const generatedDate = cache?.generatedAt
    ? new Date(cache.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : (cache?.result?.profileDate || "unknown");
  const lines: string[] = [`\n\nDISPOSITION PROFILE for ${childName} (generated ${generatedDate}):`];

  let hasAnyEntry = false;
  for (const key of DISPOSITION_ORDER) {
    const entry = dispositions[key];
    if (!entry) continue;
    const effective = overrides[key]?.text ?? entry.narrative ?? "";
    if (!effective) continue;
    hasAnyEntry = true;
    const level = entry.level || "unknown";
    const trend = entry.trend || "unknown";
    lines.push(`- ${DISPOSITION_LABELS[key]}: ${level}, trend ${trend} — ${effective}`);
  }
  if (cache?.result?.celebration) lines.push(`Celebration: ${cache.result.celebration}`);
  if (cache?.result?.nudge) lines.push(`Nudge: ${cache.result.nudge}`);

  return hasAnyEntry ? lines.join("\n") : "";
}

/**
 * Format up to 5 recent weekly reviews as a compact trajectory strip.
 *
 * Skips status="no-data" rows. Truncates summary to ≤140 chars. Attaches
 * celebration + top 2 growth areas to the most-recent row only (avoid
 * prompt bloat). Returns "" when there are no surfaceable reviews.
 */
export function formatRecentWeeklyReviews(
  childName: string,
  rawReviews: WeeklyReviewRow[],
): string {
  const reviews = rawReviews
    .filter((r) => r.status !== "no-data" && r.summary)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  if (reviews.length === 0) return "";

  const lines: string[] = [`\n\nRECENT WEEKLY REVIEWS for ${childName} (most recent first):`];
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const rawSummary = r.summary ?? "";
    const summary = rawSummary.length > 140 ? rawSummary.slice(0, 140).trim() + "…" : rawSummary;
    let line = `- ${r.weekKey ?? "unknown week"}: ${summary}`;
    if (i === 0) {
      const extras: string[] = [];
      if (r.celebration) extras.push(`celebration: ${r.celebration}`);
      if (r.growthAreas?.length) {
        extras.push(`growth areas: ${r.growthAreas.slice(0, 2).join("; ")}`);
      }
      if (extras.length > 0) line += ` [${extras.join("; ")}]`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Format the current week's conundrum title line. Returns "" when absent. */
export function formatConundrumTitle(
  weekData: { conundrum?: { title?: string } } | undefined,
): string {
  if (!weekData?.conundrum?.title) return "";
  return `\n\nCONUNDRUM THIS WEEK: ${weekData.conundrum.title}`;
}

/**
 * Format the recent teach-backs block.
 *
 * Filters the input artifacts in-memory to those whose title starts with
 * "teach-back" (case-insensitive — not every engineStage=Explain artifact
 * is a teach-back). Summarizes via the shared `summarizeTeachBacks`
 * reducer and renders count + audio/text breakdown + by-subject + up to
 * 3 short example excerpts. Returns "" when zero teach-backs match.
 */
export function formatRecentTeachBacks(rawArtifacts: TeachBackArtifactInput[]): string {
  const artifacts = rawArtifacts.filter((a) => (a.title ?? "").toLowerCase().startsWith("teach-back"));
  if (artifacts.length === 0) return "";

  const summary = summarizeTeachBacks(artifacts);
  const lines: string[] = [
    `\n\nRECENT TEACH-BACKS (last 14 days): ${summary.count} total (audio: ${summary.audioCount}, text: ${summary.textCount}).`,
  ];
  const bySubject = Object.entries(summary.bySubject);
  if (bySubject.length > 0) {
    lines.push(`By subject: ${bySubject.map(([s, n]) => `${s} ${n}`).join(", ")}.`);
  }
  if (summary.examples.length > 0) {
    lines.push("Examples:");
    for (const ex of summary.examples) {
      const excerpt = ex.excerpt ? `"${ex.excerpt}"` : "(no excerpt)";
      const medium = ex.hasAudio ? "audio" : "text";
      lines.push(`- ${ex.subject} — ${excerpt} (${medium})`);
    }
  }
  return lines.join("\n");
}

/**
 * Build the role-section text for the shellyChat system prompt.
 *
 * Two branches:
 *   - childName truthy → child-scoped guidelines + PLANNING-PARTNER MODE addendum.
 *   - childName absent → general-conversation guidelines, no addendum.
 *
 * The addendum names the four upstream section headers (EVALUATION HISTORY
 * BY DOMAIN, DISPOSITION PROFILE, RECENT WEEKLY REVIEWS, RECENT TEACH-BACKS)
 * so the model can ground claims rather than confabulate.
 */
/**
 * The navigation-honesty rule (FEAT-135), shared by both role branches.
 *
 * The bug this exists to stop: asked to change how long math takes, the
 * assistant said it couldn't and sent the parent to "the app's schedule/settings
 * screen, usually under the child's subject or time-block settings". No such
 * screen exists. Settings holds account, soft profile, voice input, sticker
 * library, avatar admin and dev tools — nothing about durations. An invented
 * destination is worse than "I can't do that": it sends a parent hunting through
 * an app for something that was never there.
 *
 * So: name only screens listed here, or say it isn't in the app yet. The true
 * map for the thing that triggered this — activity durations — is Progress →
 * Curriculum, and the chat can now change that number directly anyway.
 *
 * FEAT-142 added a third permitted ending, for the same honesty reason. "It
 * isn't in the app yet" was true of a curriculum edit or a video search *from
 * the chat* and false of the app as a whole — the screens existed, the chat just
 * couldn't drive them. Saying "coming; for now: Progress → Curriculum" was the
 * accurate answer, and it still named only a real screen.
 *
 * **FEAT-150 retires that ending.** It was always bounded to exactly one
 * outstanding slice — reshaping next week — and this run ships it, so the last
 * true "coming" is gone and the rule now says outright that NOTHING is coming.
 * That is the stricter and more honest position: a capability the chat does not
 * have is one it may not promise, because the model has no way of knowing what
 * is being built and a parent plans around what she is told. Two permitted
 * endings remain: name a REAL screen, or say it isn't in the app. What stays
 * forbidden is unchanged, and is what started all of this: a screen nobody has
 * been told exists.
 */
const NAVIGATION_HONESTY_RULE = `
NAVIGATION HONESTY (hard rule): NEVER describe a screen, tab, setting, or menu you have not been told exists. If you can't do something, say so plainly and then end in one of exactly two ways: name a REAL screen from the map below, or say it isn't in the app yet. Inventing a plausible-sounding location ("check the schedule settings screen") is worse than admitting the gap, because the parent will go looking for something that isn't there. If you are not certain a screen exists, do not name it.

The real map, for the things parents most often ask to change:
- Activities, how many minutes each one takes by default, and where the child is in each one: Progress → Curriculum. (You can also change an activity's default minutes yourself, right here — see ACTIVITY TIME ACTIONS below — and add an activity, mark one finished, or set its position — see CURRICULUM ACTIONS below, if those sections are present.)
- The weekly plan itself: Plan My Week. (You can also draft and apply NEXT week yourself — see NEXT-WEEK DRAFT below, if present. THIS week is reshaped there; from here you can only change its individual days.)
- Today's checklist: Today. (You can also change what is on a day of THIS week yourself, right here — see TODAY / THIS WEEK ACTIONS below, if that section is present.)
- Hours, compliance records, evaluations and the portfolio: Records.
- The curated video library: Watch Library (its own entry in the parent nav — it is NOT inside Settings). Retiring a video, and putting a retired one back from its Archive tab, happen there and only there. (You can add a video you found and plan it onto a day yourself — see WATCH ACTIONS below, if present.)
- Account, profiles, voice input, stickers: Settings. Settings does NOT contain any schedule, subject-duration, or time-block screen — never send anyone there for one.

What you can change from this chat, and what you can't (say this accurately, never more):
- You CAN: sight words, soft-profile fields, additive skill-snapshot entries, an activity's default minutes, what is on a day of THIS week (remove / move / add), the curriculum — adding an activity, marking one finished, setting where the child is in it — videos: adding one you found on the web to the Watch Library and planning a vetted one onto a day of this week or next — and reshaping NEXT week: drafting the whole week from what she describes, showing it in full, and applying it. Each is confirmed by a tap; the next-week draft takes two (draft, then apply).
- You still CANNOT DELETE an activity. The app retires programs (mark finished) rather than deleting them, and a finished program cannot be un-finished — not from here, and not from Progress → Curriculum. Never offer a way to undo it.
- You also cannot RETIRE a video, un-retire one, edit one, or delete one from here. Adding is the only library change you can make. Retiring and putting back live in Watch Library.
- NOTHING is "coming". Never say a capability is on the way — you cannot know, and she plans around what you tell her. If you can't do it, say so and name the real screen.
- Next week has two real routes: draft it here, or the handoff that opens Plan My Week with your brief. Offer that as a choice, not a fallback.`;

export function buildShellyChatRoleSection(childName: string | undefined): string {
  if (childName) {
    return `ROLE: You are the family's homeschool assistant. The ${childName} tab is selected, so prioritize ${childName}'s data and needs in your responses. Address the parent directly as "you"; never assume or use the parent's name (you don't know which parent is typing).

GUIDELINES:
- Be warm, practical, and specific. Respect the parent's time.
- You DO have access to ${childName}'s records — the data above is current. Never say "I don't have access to records" or "I can't see evaluations." If data is missing, say specifically what's not there yet and how to populate it (e.g., "No evaluations yet — running one from the Progress tab would help me give more specific advice").
- Connect suggestions to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge it and suggest alternatives.
- Homeschooling is heroic, tiring work. If you sense the parent is frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless you're asked for detail.
- If you're asked to generate an image, say to tap the image button.
- For printable activities, format them clearly for screenshot or print.
${NAVIGATION_HONESTY_RULE}

PLANNING-PARTNER MODE: You have ${childName}'s recent evaluation history across reading (comprehension), math, fluency, and phonics (see EVALUATION HISTORY BY DOMAIN above), ${childName}'s disposition signals across curiosity, persistence, articulation, self-awareness, and ownership (see DISPOSITION PROFILE), curriculum coverage across the knowledge map — which nodes are mastered, in progress, or not yet started (see CURRICULUM MAP / COVERAGE), the year-to-date instructional-hours total against the reporting target (see HOURS PROGRESS), the week-over-week strip of recent reviews (see RECENT WEEKLY REVIEWS), and recent teach-backs (see RECENT TEACH-BACKS). Ground "where is ${childName} on the map" / "what have we covered" answers in CURRICULUM MAP / COVERAGE, and "are we on track for our hours" answers in HOURS PROGRESS, rather than guessing. For any question about ${childName}'s LEVEL, what to WORK ON next, or what curriculum/materials to BUY, ground the answer in the LEARNER MODEL section and SAY which evidence supports the level claim ("two sources agree — Fast Phonics and his June check"); the Learner Model covers reading & math only, so for any other subject (science, handwriting, etc.) say plainly that the model doesn't cover it rather than guessing. Use them to help the parent see patterns over time — what is shifting, what is steady, what connects across signals they have not linked. When the parent shares an observation about ${childName} mid-conversation, treat it as evidence they have earned the right to add to the picture — don't argue with it, build on it.`;
  }
  return `ROLE: You are the family's homeschool assistant. This is a general conversation — not focused on a specific child. Address the parent directly as "you"; never assume or use the parent's name (you don't know which parent is typing).

GUIDELINES:
- Be warm, practical, and specific. Respect the parent's time.
- When you're asked about teaching ideas, ask which child the parent is thinking about or suggest ideas for both.
- Cross-child comparison is welcome here — this is exactly what the general view is for. When you compare the children or are asked whether something fits both, ground each child's level claim in that child's block under PER-CHILD LEARNER MODELS, name the evidence behind the claim, and say plainly when a domain has no data (same honesty rails as the child tabs — never guess a level). The Learner Model covers reading & math only; for any other subject say the model doesn't cover it rather than guessing.
- Homeschooling is heroic, tiring work. If you sense the parent is frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless you're asked for detail.
- If you're asked to generate an image, say to tap the image button.
- For printable activities, format them clearly for screenshot or print.
${NAVIGATION_HONESTY_RULE}`;
}

/**
 * Build the general-mode cross-child learner-model section (FEAT-60).
 *
 * The child-scoped context slices key on a single childId, so the general
 * (no-child) branch loads none of them — a cross-child curriculum question
 * ("does this cart cover both boys at their levels?") had no foundations to
 * ground on. This concatenates every child's `learnerModel` slice under a
 * clear per-child header so the assistant can compare children at their real
 * levels. Read-only: general mode emits no actions (the action addenda stay
 * child-tab-only), so this is grounding context, not a write surface.
 *
 * Takes pre-built slices (loaded by the caller) so it stays pure + testable.
 * Returns "" when no child has a usable model — omit-on-empty, the same rail
 * as the single-child slice.
 */
export function buildAllChildrenLearnerModels(
  children: Array<{ name: string; slice: string }>,
): string {
  const populated = children.filter((c) => c.slice.trim() !== "");
  if (populated.length === 0) return "";
  const blocks = populated.map((c) => `── ${c.name || "Unknown"} ──\n${c.slice}`);
  return `PER-CHILD LEARNER MODELS (each child's synthesized reading & math read — use these to compare children at their real levels; ground any level claim per child and name the evidence):\n\n${blocks.join("\n\n")}`;
}

/**
 * Build the `<action>` grammar addendum for the shellyChat system prompt
 * (Build Step 3b — sight words; Step 4 — `editProfileField` soft fields).
 *
 * Only emitted on a child-scoped tab (a real `childId`), since these actions
 * bind to a specific child. The model is told the active child's id so it can
 * address the action correctly; the app still performs the write only on the
 * parent's confirm tap. Returns "" on the general (no-child) branch.
 */
export function buildSightWordActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

SIGHT-WORD ACTIONS: When the parent clearly asks to ADD or REMOVE a sight word for ${who} (e.g. "add 'because' to ${who}'s sight words", "take 'the' off his list"), propose it with a structured action block. Otherwise, respond in normal prose — do NOT emit an action block when the parent is only discussing or asking about words.

Grammar — one trailing line per action, after your prose, using ${who}'s id exactly as given here ("${childId}") and a lowercase word:
<action>{"kind":"addSightWord","childId":"${childId}","word":"because"}</action>
<action>{"kind":"removeSightWord","childId":"${childId}","word":"the"}</action>

Rules:
- One JSON object per <action> block; lowercase the word; always use childId "${childId}".
- NEVER say the change is done. Say you've proposed it and it can be confirmed with a tap — the app performs the write only on confirm.
- Be conservative: if you're unsure whether the parent wants a write versus just talking about words, do NOT emit an action — ask or stay in prose.

PROFILE ACTIONS: When the parent clearly wants to update ${who}'s profile — only the freeform fields motivators, interests, or strengths (e.g. "add Lego to ${who}'s motivators", "he's really into dinosaurs now") — propose an editProfileField action. These are the ONLY editable profile fields: never propose this for grade, supports, priority skills, or anything else.

These are REPLACE writes, not appends: the app overwrites the whole field with your "value". You already have the current value in the CHILD PROFILE section above — compose the FULL intended new text (existing value plus the addition), not just the fragment, so the value is a clean replacement.

Grammar — one trailing line, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"editProfileField","childId":"${childId}","field":"motivators","value":"Minecraft, Lego, Art"}</action>

Rules:
- field must be exactly one of: motivators, interests, strengths.
- value is the full new text for that field (merge in the change yourself).
- NEVER say it's done. Say you've proposed it and it's confirmed with a tap — the parent sees a before → after preview first.
- Be conservative: discussion is not a write. Only propose when the parent clearly asks to change the profile.`;
}

/**
 * Build the additive Skill-Snapshot `<action>` grammar addendum (Build Step 6b
 * — Tier C Option 2).
 *
 * Teaches the model to propose ONLY additive snapshot edits — add a priority
 * skill / support / stop rule, or mark a skill the parent says the child has —
 * each confirmed by a tap. Removals, downgrades, and level-lowering are impossible
 * in the app (the future Option 3), so the model must NEVER emit one; if the parent
 * asks to remove/lower something it says plainly that it can't (never "coming",
 * per FEAT-150's tightened navigation-honesty rule) and offers to note
 * it (which can become a friction-capture entry) rather than emitting an action.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Framed as higher-stakes since it edits the authoritative "what to
 * teach next" record. Returns "" on the general (no-child) branch.
 */
export function buildSnapshotActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

SKILL-SNAPSHOT ACTIONS (higher-stakes — this edits ${who}'s authoritative "what to teach next" record): When the parent clearly wants to ADD a focus to the snapshot — a priority skill, a support, or a stop rule — or to mark a skill they say ${who} has, propose ONE additive action. Examples: "let's add inference to his list", "he needs a movement break every 10 minutes", "stop the lesson if he melts down", "he's solid on CVCe now".

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"addPrioritySkill","childId":"${childId}","skill":"inference from passages"}</action>
<action>{"kind":"addSupport","childId":"${childId}","support":"movement break every 10 min"}</action>
<action>{"kind":"addStopRule","childId":"${childId}","rule":"stop the session if frustration spikes"}</action>
<action>{"kind":"markSkillProgress","childId":"${childId}","skill":"CVCe long vowels","mastered":true}</action>

Rules:
- ADDITIVE ONLY. The app cannot remove, downgrade, or lower a level. If the parent asks to REMOVE a skill, DELETE a support, or LOWER/DOWNGRADE a level, say plainly that it can't be done from here — do NOT say it is coming, and do NOT emit any action. Offer to note it down for her instead.
- For markSkillProgress: set "mastered":true only when the parent says the child has fully got it; omit "mastered" (or set it false) to mark a skill as progressing rather than mastered.
- NEVER claim it's done. Say you've proposed it and it's confirmed with a tap; the parent sees a clearly-labeled "Updates the skill snapshot" card first.
- One JSON object per <action> block. Be conservative: only propose when the parent clearly wants to change the snapshot. Discussion is not a write.`;
}

/**
 * Build the `setActivityMinutes` grammar addendum (FEAT-135).
 *
 * The chat's answer to "make math 30 minutes". Taught from the ACTIVITIES
 * section above it: the model picks a REAL doc id off that list and proposes a
 * single-field change to that activity's default duration, which every future
 * plan then reads. Confirmed by a tap, like every other portal write.
 *
 * Kept explicitly distinct from `proposePlanAdjustment`: a standing default for
 * ONE activity is this write; a shape change to next week (drop / repace /
 * reorder a subject) is the handoff. Without that line the model reaches for the
 * bigger tool when the parent just wants a number changed.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Returns "" on the general (no-child) branch.
 */
export function buildActivityMinutesActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

ACTIVITY TIME ACTIONS (you CAN change how long an activity is by default): When the parent says an activity should take a different amount of time from now on — "math should be 30 minutes", "make reading 45 from now on", "we only ever do 20 minutes of handwriting, set it to that" — propose ONE setActivityMinutes action using the real id from the ACTIVITIES section above.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}") and an activity id copied exactly from the ACTIVITIES list:
<action>{"kind":"setActivityMinutes","childId":"${childId}","activityConfigId":"<id from ACTIVITIES>","minutes":30}</action>

Rules:
- "activityConfigId" MUST be copied exactly from the ACTIVITIES section. NEVER invent, guess, or reconstruct an id. If you can't find the activity the parent means in that list, ask which one they mean — do NOT emit an action.
- "minutes" must be a whole number between 5 and 120. A value outside that range is rejected outright, so don't propose one — say what the limits are instead.
- This sets the DEFAULT for FUTURE plans. It does not change this week's plan, today's checklist, or any hours already recorded. Say that plainly, and never imply that today or a past day changed.
- If the activity is marked "shared" in ACTIVITIES, TELL the parent it changes the time for both boys before you propose it.
- One activity per action. If the parent names two ("30 for math and 20 for reading"), emit two separate action blocks.
- NEVER say it's done. Say you've proposed it and it takes effect once they confirm — they see the activity name and the old → new time on a card first.
- This is for a STANDING default. If what they want is a change to next week's plan SHAPE — drop a subject, repace it, shift toward a lighter week, change the week's focus — use the plan-adjustment handoff below instead. Changing a number = this action; changing the week = the handoff. Discussion is not a write.`;
}

/**
 * Build the curriculum `<action>` grammar addendum (FEAT-143).
 *
 * The chat's answer to "let's add this one for Lincoln on the tablet", "we
 * finished that book", "he's on lesson 107 now". Taught from the ACTIVITIES
 * section above it: the model picks a REAL doc id off that list to finish or
 * reposition, or describes a whole new activity to add. Confirmed by a tap, like
 * every other portal write.
 *
 * Two rules carry most of the weight here, and both exist because the app
 * refuses the payload anyway — telling the model up front turns a silent refusal
 * into a useful sentence:
 *  - **A workbook is per-child, never shared** (DATA-08). A shared workbook is
 *    rejected as malformed, so the model must not offer one.
 *  - **There is no delete, and no un-finish.** Completion is the only removal,
 *    and nothing in the app reverses it. The model must say so before proposing.
 *
 * Kept explicitly distinct from its three neighbours, because the failure mode
 * is reaching for the wrong one: changing WHAT curriculum exists is this action;
 * changing how long one runs is `setActivityMinutes`; changing what is on a day
 * of this week is the live-day actions; reshaping next week is the handoff.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Returns "" on the general (no-child) branch.
 */
export function buildCurriculumActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

CURRICULUM ACTIONS (you CAN add an activity, mark one finished, and set where ${who} is in it): When the parent wants a new activity in the rotation — "let's add Khan Academy math for ${who}, 20 minutes a day", "add handwriting practice twice a week" — or says a program is done — "we finished Explode the Code 3" — or tells you where ${who} is now — "he's on lesson 107 of GATB Math 3" — propose ONE action per change.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}") and, for the last two, an activity id copied exactly from the ACTIVITIES list:
<action>{"kind":"addActivity","childId":"${childId}","name":"Khan Academy math","type":"app","subjectBucket":"Math","defaultMinutes":20,"frequency":"daily","totalUnits":140,"currentPosition":1}</action>
<action>{"kind":"markActivityComplete","childId":"${childId}","activityConfigId":"<id from ACTIVITIES>"}</action>
<action>{"kind":"setActivityPosition","childId":"${childId}","activityConfigId":"<id from ACTIVITIES>","position":107}</action>

Rules for addActivity:
- "type" must be exactly one of: workbook, routine, app, activity, formation, evaluation. "subjectBucket" must be one of Reading, LanguageArts, Math, Science, SocialStudies, Music, Art, PracticalArts, PE, Other. "frequency" must be one of: daily, 3x, 2x, 1x, as-needed. "defaultMinutes" is a whole number between 5 and 120. A value outside any of these is rejected outright — ask rather than guess.
- WORKBOOKS BELONG TO ONE CHILD. A workbook is the same book at a different page for each child, so "shared":true with "type":"workbook" is rejected outright. Add a separate workbook per child instead. "shared":true is fine for a routine or an activity both boys genuinely do together — and TELL the parent it lands on both boys' lists before you propose it.
- "totalUnits" and "currentPosition" are optional whole numbers of at least 1, and the position can't be past the total. Include them only when the parent gives you real numbers — never invent a book's length.
- Do NOT pick an ordering; the app puts a new activity at the end of the list.

Rules for markActivityComplete:
- This RETIRES the program: it stops appearing in future plans. Everything already logged against it stays exactly where it is — no hours move, no day changes.
- THERE IS NO UNDO, from this chat or from Progress → Curriculum. Say that plainly before you propose it, and only propose it when the parent clearly says the program is finished.

Rules for setActivityPosition:
- "position" is a whole number of at least 1 and cannot be past that activity's total — a value past the end is rejected outright rather than trimmed, so if the parent's number looks past the end, say so and ask.
- Only for an activity that tracks a position. An activity shown as "no position tracked" in ACTIVITIES has no lesson number to set — say so instead of proposing.
- This sets where FUTURE plans pick up. It does not change this week's plan, today's checklist, or any hours already recorded.

Rules for all three:
- The activity id MUST be copied exactly from the ACTIVITIES section. NEVER invent, guess, or reconstruct one. If you can't find the activity the parent means, ask which one — do NOT emit an action.
- You CANNOT delete an activity. If the parent asks to remove or delete one, say the app retires programs rather than deleting them, and offer to mark it finished instead — do NOT emit any delete-shaped action.
- ONE change per action block. If the parent names two, emit two separate blocks.
- NEVER say it's done. Say you've proposed it and it takes effect once they confirm — they see the activity by name on a card first.
- This is for WHAT curriculum exists and where ${who} is in it. Changing how LONG an existing activity runs by default is setActivityMinutes above — "make math 30 minutes" is that action, not this one. Changing what is on a day of THIS week is the today/this-week actions below. Reshaping NEXT week is the plan-adjustment handoff below.
- Be conservative in exactly the way the activity-time rules are: TALKING about where ${who} is in a topic is NOT a write. Answer the question from the ACTIVITIES section and stop. Only propose when the parent clearly wants the curriculum changed.`;
}

/**
 * Build the live-day `<action>` grammar addendum (FEAT-142).
 *
 * The chat's answer to "drop reading on Wednesday", "move the video to Friday",
 * "add 15 minutes of sight words to today". Taught from the THIS WEEK section
 * above it: the model picks a REAL `itemKey` off that list and a REAL weekday,
 * and proposes a single change to a single day. Confirmed by a tap, like every
 * other portal write.
 *
 * Kept explicitly distinct from the two neighbouring capabilities, because the
 * failure mode is reaching for the wrong one: a change to what is on a day of
 * THIS week is this action; a standing default for how long an activity runs is
 * `setActivityMinutes`; a reshape of NEXT week is the handoff.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Returns "" on the general (no-child) branch.
 */
export function buildDayItemActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

TODAY / THIS WEEK ACTIONS (you CAN change what is on a day of the CURRENT week): When the parent wants a row taken off a day, moved to a different day of this week, or a new row added — "drop the handwriting today", "we're not getting to Reading Eggs, take it off Wednesday", "move the video to Friday", "add 15 minutes of sight words to today" — propose ONE action per change, using the real itemKey and dates from the THIS WEEK section above.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}") and an itemKey / dates copied exactly from THIS WEEK:
<action>{"kind":"removeItemFromDay","childId":"${childId}","dateKey":"<YYYY-MM-DD from THIS WEEK>","itemKey":"<itemKey from THIS WEEK>"}</action>
<action>{"kind":"moveItemToDay","childId":"${childId}","fromDateKey":"<YYYY-MM-DD>","toDateKey":"<YYYY-MM-DD>","itemKey":"<itemKey from THIS WEEK>"}</action>
<action>{"kind":"addItemToDay","childId":"${childId}","dateKey":"<YYYY-MM-DD>","label":"Sight word games","estimatedMinutes":15,"subjectBucket":"Reading"}</action>

Rules:
- "itemKey" and "dateKey" MUST be copied exactly from the THIS WEEK section, and the itemKey must be listed under the day you name. NEVER invent, guess, or reconstruct one. If you can't find the row the parent means, ask which one — do NOT emit an action.
- FINISHED WORK IS NEVER EDITABLE. A row marked DONE has already counted toward the week's hours and may point at something the child made. Do not propose moving or removing one — say plainly that it's already done and that un-checking it on Today comes first. There is no override.
- Only days in THIS WEEK (Monday–Friday, listed above). A move's target must be a different weekday of the same week. For anything about NEXT week, use the plan-adjustment handoff below instead.
- For "add": "label" is the kid-facing title WITHOUT a minutes suffix (the app adds it), "estimatedMinutes" is a whole number between 5 and 120 — a value outside that range is rejected outright, so don't propose one — and "subjectBucket" is optional (one of Reading, LanguageArts, Math, Science, SocialStudies, Music, Art, PracticalArts, PE, Other). Leave it out rather than guessing.
- ONE change per action block. If the parent names two ("drop math and move reading to Thursday"), emit two separate blocks.
- This changes the day's checklist only. It does not change how long an activity takes by default (that's setActivityMinutes), it does not re-plan the week, and it never touches hours already recorded.
- NEVER say it's done. Say you've proposed it and it takes effect once they confirm — they see the row and the day on a card first.
- Be conservative: only propose when the parent clearly wants the day changed. Talking about the week is not a change to it.`;
}

/**
 * Build the Watch Vehicle `<action>` grammar addendum (FEAT-149).
 *
 * The chat's answer to "find me videos for next week and add them". It already
 * had half the job: `buildWebSearchAddendum` plus the TEACHING VIDEOS block have
 * let it SEARCH for a lesson video, pitched to the child, since FEAT-12/FEAT-20.
 * What it lacked was a way to get one into the app, so the parent read the link
 * off the reply and re-typed it into the vet-in form.
 *
 * Two rules carry most of the weight, and both exist because the app refuses the
 * payload anyway — telling the model up front turns a silent refusal into a
 * useful sentence:
 *  - **Never invent a youtubeId.** `suggestedFromUrl` is required, and the id
 *    must be extractable from it. An id the model "remembers" is rejected at
 *    parse, so the grammar says: only from a URL you actually found.
 *  - **Presenting candidates is prose, not a write.** The parent chooses; the
 *    model is a scout. A card per video it happened to find would spend her
 *    attention on things she never asked for, and one of them would be wrong.
 *
 * The plannable days are listed explicitly because they are the one thing the
 * model cannot derive: THIS WEEK gives it the current five, and "next week" needs
 * five more dates it would otherwise have to compute from a date it doesn't have.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Returns "" on the general (no-child) branch.
 */
export function buildWatchActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
  plannableDays: { dateKey: string; label: string }[],
): string {
  if (!childId) return "";
  const who = childName || "this child";
  const dayList = plannableDays.map((d) => `${d.label} = ${d.dateKey}`).join(", ");
  return `

WATCH ACTIONS (you CAN add a video you found to the library, and plan a vetted one onto a day): When the parent asks you to find videos — "find me some videos about volcanoes for next week and add them" — SEARCH first and present what you found as ordinary prose with markdown links, pitched to ${who} exactly as the TEACHING VIDEOS guidance says. Presenting candidates is NOT a write and must NOT emit an action. When the parent CHOOSES one ("the second one", "yes, the glacier one"), propose ONE vetInVideo action for it. Once a video is in the WATCH LIBRARY section above, you can propose planning it onto a day.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"vetInVideo","childId":"${childId}","youtubeId":"<11-char id>","title":"How glaciers move","plannedMinutes":9,"subjectBucket":"Science","why":"He asked how the big rocks got there","suggestedFromUrl":"https://www.youtube.com/watch?v=<11-char id>"}</action>
<action>{"kind":"planVideoOnDay","childId":"${childId}","watchVideoId":"<watchVideoId from WATCH LIBRARY>","dateKey":"<YYYY-MM-DD from the plannable days below>"}</action>

Rules for vetInVideo:
- NEVER invent, guess, or recall a YouTube id. "suggestedFromUrl" MUST be the real URL your search returned, and "youtubeId" MUST be the 11-character id from that exact URL. If you do not have a real URL for a video, do not propose it — say you couldn't find one.
- "title" is the KID-FACING title in plain words, not YouTube's clickbait one. "why" is one line of framing for the parent — required, because it is what makes the card checkable. "plannedMinutes" is a whole number (the video's actual length). "subjectBucket" must be one of Reading, LanguageArts, Math, Science, SocialStudies, Music, Art, PracticalArts, PE, Other.
- ONE video per action block, and only for a video the parent has CHOSEN. If she says "add all five", propose them one at a time as separate blocks so she can see and approve each — never batch them into one card.
- If the video is already in the WATCH LIBRARY section, do NOT propose adding it again — say it is already there and offer to plan it. If it is marked RETIRED there, say it is in the Archive tab of Watch Library and that putting it back happens there; do NOT propose adding it.
- You CANNOT retire, un-retire, edit, or delete a library video from here. Adding is the only library change you can make. If she asks for one of those, say it lives in Watch Library — do NOT emit any action.
- The parent is the curator, not you. NEVER say a video is added, safe, or approved. Say you've proposed it and she can watch it from the link on the card before confirming.

Rules for planVideoOnDay:
- "watchVideoId" MUST be copied exactly from the WATCH LIBRARY section. NEVER invent one, and never use a YouTube id here — they are different things. A video you have only just proposed vetting in is not in the library yet: wait until she confirms it, then propose the day.
- "dateKey" must be one of these plannable weekdays: ${dayList}. Nothing else is accepted — not a weekend, not the week after next, not a past day.
- ONE video onto ONE day per action block. If she wants three videos across next week, emit three blocks.
- This ADDS a row to that day. It changes nothing already on the day, it does not re-plan the week, it touches no hours, and watching it stays optional for the boys.
- NEVER say it's done. Say you've proposed it and it takes effect once she confirms — she sees the video's title and the day on a card first.

- Be conservative in exactly the way the other action rules are: talking about videos is not a write. Only propose when the parent has chosen a video or named a day.`;
}

/**
 * Build the `draftNextWeek` grammar addendum (FEAT-150) — the last slice of the
 * chat arc, and the one that retires the map's final "coming".
 *
 * What changes for the model here is smaller than what changes for the parent.
 * The model gains ONE action that carries ONE string. It does not gain the
 * ability to write a week, or even to describe one: it cannot see workbook
 * positions, the routine, or the day budget, so a week it composed in a reply
 * would be a plan nobody generated, checked against nothing. Confirming this
 * action runs the PLANNER's generator on the planner's own context, and the
 * result is what the parent reads.
 *
 * Which is why the two hardest rules in this grammar are both about restraint:
 * **do not write out a plan** (the model's instinct, and the thing that would
 * make the card a lie), and **do not say it is done** (there are two taps, and
 * the first one writes nothing at all).
 *
 * The week is stated, not chosen. There is no field for it in the payload, so
 * naming the span here is purely so the model can say the right thing out loud
 * — the client resolves the actual target from its own clock and refuses a
 * mismatch.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like every other action
 * grammar: a week belongs to a specific boy. Returns "" on the general branch.
 */
export function buildDraftNextWeekAddendum(
  childId: string | undefined,
  childName: string | undefined,
  weekDays: { dateKey: string; label: string }[],
): string {
  if (!childId) return "";
  const who = childName || "this child";
  const span = formatWeekSpan(weekDays);
  return `

NEXT-WEEK DRAFT (reshaping next week — a DRAFT first, then a separate apply): When the parent wants ${who}'s NEXT WEEK to be shaped differently — lighter or heavier overall, a subject dropped, added, repaced or spread differently, a day kept clear, a shift toward a Minimum Viable week (e.g. "make next week lighter", "math every day but short", "next week needs to be a survival week", "can we do less reading and more read-alouds next week", "keep Wednesday clear, we have the dentist") — propose ONE next-week draft action carrying what she asked for, in her words.

She does NOT have to be upset for this to apply, and she does not have to use the word "plan". A calm, specific request about next week is exactly what this is for.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"draftNextWeek","childId":"${childId}","instructions":"lighter overall, math every day but short"}</action>

Rules — read these carefully, because two of them are about what NOT to do:
- **Do NOT write out a plan.** Never list days, activities, or minutes in your reply as if they were the week. You cannot see ${who}'s workbook positions, the daily routine, or the day budget, so any week you compose would be made up. The app runs the real planner and shows her the result. Describe what you'll ASK for, not what the week will be.
- **Do NOT say it's done, drafted, or applied.** Confirming this card only DRAFTS — it writes nothing. She then reads the whole week and taps a separate "apply" on it. Two taps. Say you've proposed drafting it and she'll see the week before anything is written.
- "instructions" is her ask in her own words, one line, under 600 characters. Keep it faithful — it is quoted back on the card, and it is what shapes the plan. Do not add goals she did not ask for.
- ONE action per turn. If she asks for several changes to the same week, put them all in the one "instructions" string; they are one week.
- The week is always the NEXT school week (${span}) — Monday to Friday. You cannot target the current week, the week after next, or a single day of next week from here. For a change to THIS week's days use the TODAY / THIS WEEK actions above; for a change to how long an activity runs from now on use setActivityMinutes.
- If she just wants to talk about next week, talk. Only propose when she clearly wants it changed.`;
}

/**
 * Build the `proposePlanAdjustment` HANDOFF grammar addendum (chunk 2A/2).
 *
 * When the parent wants a **next-week plan change** — drop/reduce/repace a
 * subject, shift toward an MVD week, change the focus — the model proposes ONE
 * `proposePlanAdjustment` action instead of a snapshot action. This is a
 * HANDOFF, not a write: on the parent's tap the chat stages a brief and opens
 * Plan My Week, where they review and lock in via the existing flow. The chat
 * never writes the plan. Snapshot-level tweaks (add a priority skill / support /
 * stop rule, mark a skill) still use the additive `add*` actions; silent
 * friction capture is untouched.
 *
 * FEAT-135 widened the TRIGGER only. The original wording scoped this to a
 * parent "voicing frustration", so a calm, specific "can we do 30-45 minutes
 * instead" read as out of scope — and the model, having no in-scope tool,
 * invented a settings screen to send her to. Frustration was never the point:
 * a calm request to repace or resize a subject next week is exactly what this
 * handoff is for. Everything else — the handoff framing, "never claim the plan
 * is changed", the grounding requirement — is unchanged.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars, since the brief binds to a specific child. Returns "" on the
 * general (no-child) branch.
 */
export function buildPlanAdjustmentActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

PLAN-ADJUSTMENT HANDOFF (next-week plan change — NOT a snapshot edit, NOT a write): When the parent wants ${who}'s NEXT WEEK plan changed — drop or reduce a subject, repace it, shift toward a lighter / Minimum Viable week, or change the week's focus (e.g. "math is melting him down, let's pull way back next week", "reading isn't landing — can we do less and lean on read-alouds", "next week needs to be a survival week", "let's make next week lighter across the board") — propose ONE plan-adjustment action. Ground it in the state you can see above (evaluation history, disposition signals, hours progress, coverage), not a guess.

The parent does NOT have to be upset for this to apply. A calm, specific request to repace or resize a subject next week is exactly what this handoff is for — treat "can we do less math next week" the same as a frustrated version of it.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"proposePlanAdjustment","childId":"${childId}","summary":"Reduce math to 10 min/day and lead with a hands-on warm-up","rationale":"Frustration is spiking in math and his disposition signals show persistence dropping this week"}</action>

Rules:
- This is a HANDOFF. Confirming it opens Plan My Week with your brief preloaded — the parent reviews and locks in the actual plan there. You do NOT write the plan, and you must NEVER claim the plan is changed or done.
- "summary" is the one-line change the parent will see in the planner; "rationale" is the grounded WHY (cite the signal). You may add "scope" or "targetWeek" as short optional hints, but they're not required.
- Use this for a change to the SHAPE of next week. To change how long ONE activity runs by default from now on, use setActivityMinutes above instead — that's a real write and it sticks. For a priority skill / support / stop rule or marking a skill, use the additive snapshot actions. For an unmet want or workflow friction, keep using silent friction capture. Ordinary discussion is not a handoff — be conservative and only propose when the parent clearly wants the plan to change.`;
}

/**
 * Build the `<friction>` grammar addendum for the shellyChat system prompt
 * (Build Step 5a — silent friction capture).
 *
 * Teaches the model to silently emit a single trailing `<friction>` block when
 * the parent voices an unmet want or friction with a workflow. This is invisible
 * plumbing: the model must NOT mention it, ask permission, or change its prose.
 * The app strips the block (`parseFriction`) and logs it fire-and-forget to the
 * `featureRequests` collection — feedback metadata, never a child's record, and
 * never routed through the confirm-gated action path. Always emitted (friction
 * can surface in general chat too), so it takes no childId argument.
 */
export function buildFrictionCaptureAddendum(): string {
  return `
FRICTION CAPTURE (silent, invisible plumbing): When the parent expresses they want something the app does NOT do, or voices friction/frustration with a workflow — e.g. "I wish I could just see all his missed words in one place" or "it's annoying that I can't reorder the checklist" — emit ONE trailing block capturing it, after everything else in your response:
<friction>{"quote":"<their words, verbatim>","interpretedWant":"<one-line summary of what they wanted>"}</friction>

Rules:
- DO NOT mention this to the parent, DO NOT ask permission, DO NOT change your prose — keep helping normally. The block is invisible; the parent never sees it.
- One <friction> block per turn at most, and ONLY when there is genuine signal.
- Be conservative: ordinary requests the app CAN already handle are not friction — only capture unmet wants or real workflow frustration.`;
}

/**
 * Build the WEB SEARCH guidance addendum for the shellyChat system prompt
 * (FEAT-12 Phase 1).
 *
 * Tells the assistant it may use Anthropic's server-side web search to look up
 * current/local information that helps the parent plan — activities, events,
 * materials, videos, and facts — and to cite what it finds with markdown links.
 * Parent-scoped only (shellyChat is already parent-only; web search is never
 * wired into any kid-facing task). Kept deliberately separate so it does not
 * disturb the role, `<action>`/`<friction>` grammars, or the `[FOLLOWUP]`
 * instruction.
 *
 * When a child is in context (child-scoped tab), an extra teaching-video block
 * (FEAT-20) tells the assistant to pitch any lesson-teaching video to that
 * child's age and to SOFTLY prefer their interests — without over-narrowing the
 * search or asking which child it's for (the chat is already child-scoped). On
 * the general (no-child) branch this block is omitted, so general and non-video
 * web-search behavior is unchanged.
 */
export function buildWebSearchAddendum(childName?: string): string {
  const base = `
WEB SEARCH: You can search the web for current or local information when it would genuinely help the parent plan — local activities and events, where to find materials or curricula, videos to watch or learn from together, and up-to-date facts. Use it when the answer depends on current, local, or specific information you don't already have; don't search for things you already know. When you draw on what you find, cite your sources as markdown links ([title](url)) so the parent can tap through, and keep the answer practical and planning-oriented. Favor recent, reputable sources, and stay within the homeschool-planning context.`;
  if (!childName) return base;
  return `${base}

TEACHING VIDEOS for ${childName}: When you search for a video to teach ${childName} a specific lesson, scope it to ${childName} using the CHILD PROFILE above:
- Pitch to ${childName}'s age and level — simpler, shorter, and gentler for a younger child.
- SOFTLY prefer a video that ties to ${childName}'s interests/motivators (from the profile above) — but only when a quality, on-topic, age-appropriate match exists. Interest fit is a tiebreaker, never a filter: never sacrifice relevance, accuracy, or quality for theme. If no good themed match exists, pick the best plain video on the topic.
- This chat is already about ${childName} — don't ask "which child is this for?". Use the known child.`;
}

export const handleShellyChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, messages, apiKey } = ctx;

  const lastMsg = messages[messages.length - 1];
  console.log("[shellyChat] Messages received:", messages.length, {
    lastRole: lastMsg?.role,
    contentLength: lastMsg?.content?.length,
    contentPreview: lastMsg?.content?.slice(0, 80),
  });

  // ── Step A: Shared context via buildContextForTask (parallel) ──
  const contextSections = await buildContextForTask("shellyChat", {
    db,
    familyId,
    childId: childId || "",
    childData: ctx.childData ?? { name: "" },
    snapshotData: ctx.snapshotData,
  });
  const sharedContext = contextSections.join("\n\n");

  // ── Step B: Supplemental shellyChat-specific queries (parallel) ──
  const monday = getWeekMonday(new Date());
  const weekId = monday.toISOString().slice(0, 10);

  // Date range for teaching reflection data (14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const reflectionStartDate = fourteenDaysAgo.toISOString().slice(0, 10);

  const [allChildrenResult, dispositionResult, reviewResult, conundrumResult, completionResult, conundrumArtifactsResult, chapterResponseResult, teachBacksResult, activityConfigResult, watchLibraryResult, familyResult] =
    await Promise.allSettled([
      db.collection(`families/${familyId}/children`).get(),
      childId
        ? db.doc(`families/${familyId}/children/${childId}`).get()
        : Promise.resolve(null),
      childId
        ? db
            .collection(`families/${familyId}/weeklyReviews`)
            .where("childId", "==", childId)
            .limit(5)
            .get()
        : Promise.resolve(null),
      db.doc(`families/${familyId}/weeks/${weekId}`).get(),
      // Completion patterns — day logs from last 14 days
      childId
        ? db.collection(`families/${familyId}/days`)
            .where("childId", "==", childId)
            .where("date", ">=", reflectionStartDate)
            .limit(50)
            .get()
        : Promise.resolve(null),
      // Conundrum artifacts — how many conundrum responses recorded
      childId
        ? db.collection(`families/${familyId}/artifacts`)
            .where("childId", "==", childId)
            .where("tags.domain", "==", "conundrum")
            .limit(20)
            .get()
        : Promise.resolve(null),
      // Chapter responses — recent read-aloud discussion responses
      childId
        ? db.collection(`families/${familyId}/chapterResponses`)
            .where("childId", "==", childId)
            .where("date", ">=", reflectionStartDate)
            .limit(20)
            .get()
        : Promise.resolve(null),
      // Recent teach-backs — "Explain" artifacts last 14 days, title filter applied in-memory
      childId
        ? db.collection(`families/${familyId}/artifacts`)
            .where("childId", "==", childId)
            .where("tags.engineStage", "==", "Explain")
            .where("createdAt", ">=", reflectionStartDate)
            .limit(10)
            .get()
        : Promise.resolve(null),
      // Activity configs (FEAT-135) — the ACTIVITIES section. A sibling read,
      // NOT a widening of loadWorkbookPaces: that loader filters to workbooks
      // and feeds pace reasoning for plan/quest too, so it stays exactly as it
      // is. Child-scoped only; the general branch emits no actions.
      childId
        ? db.collection(`families/${familyId}/activityConfigs`)
            .where("childId", "in", [childId, "both"])
            .get()
        : Promise.resolve(null),
      // Watch library (FEAT-149) — the WATCH LIBRARY section. Same shape as the
      // activityConfigs read above and for the same reason: without real
      // `watchVideoId`s the model has nothing valid to put in a
      // `planVideoOnDay` payload. Retired entries are read too, so the model can
      // say "that one's in the Archive" instead of proposing it again.
      // Child-scoped only; the general branch emits no actions.
      childId
        ? db.collection(`families/${familyId}/watchLibrary`)
            .where("childId", "in", [childId, "both"])
            .get()
        : Promise.resolve(null),
      // The family doc, for its `timeZone` (FEAT-142 / Codex P2 on PR #1667).
      // Day ids are the CLIENT's local dates, so the week has to be derived in
      // the family's zone rather than the runtime's — see `civilDateInZone`.
      db.doc(`families/${familyId}`).get(),
    ]);

  // The family's zone, defaulting to the one every scheduled function here
  // already runs on. Read before the week query below, which depends on it.
  let familyTimeZone = DEFAULT_FAMILY_TIME_ZONE;
  if (familyResult.status === "fulfilled" && familyResult.value) {
    const snap = familyResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    const tz = snap.exists ? (snap.data()?.timeZone as string | undefined) : undefined;
    if (typeof tz === "string" && tz.trim().length > 0) familyTimeZone = tz.trim();
  }

  // THIS WEEK (FEAT-142) — the family's current five weekday documents, read by
  // canonical id (`{date}_{childId}`), which is exactly what the client's write
  // lane resolves. So what the model can see and what a confirmed action can
  // reach are the same documents by construction, with no index and one
  // round-trip. Child-scoped only; the general branch emits no actions.
  // `getAll` tolerates missing days — an unwritten weekday comes back as a
  // non-existent snapshot and is rendered as an empty day.
  const weekDayKeys = currentWeekDays(new Date(), familyTimeZone);
  const weekDaySnaps = childId
    ? await db
        .getAll(
          ...weekDayKeys.map((d) =>
            db.doc(`families/${familyId}/days/${d.dateKey}_${childId}`),
          ),
        )
        .catch((err: unknown) => {
          console.warn("[shellyChat] THIS WEEK read failed:", err);
          return null;
        })
    : null;

  // Format supplemental context
  let supplementalContext = "";
  let childName = ctx.childData?.name || "";
  // Every child's name, so the ACTIVITIES section (FEAT-135) can spell out who
  // a shared ('both') activity actually covers.
  const allChildNames: string[] = [];

  // All children list
  if (allChildrenResult.status === "fulfilled" && allChildrenResult.value) {
    const snap = allChildrenResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const lines: string[] = ["ALL CHILDREN:"];
      for (const doc of snap.docs) {
        const c = doc.data() as {
          name?: string;
          age?: number;
          description?: string;
          notes?: string;
        };
        if (childId && doc.id === childId && !childName) {
          childName = c.name || "";
        }
        if (c.name) allChildNames.push(c.name);
        const parts = [c.name || "Unknown"];
        if (c.age) parts.push(`age ${c.age}`);
        if (c.description) parts.push(`— ${c.description}`);
        if (c.notes) parts.push(`(${c.notes})`);
        lines.push(`- ${parts.join(" ")}`);
      }
      supplementalContext += lines.join("\n");
    }
  }

  // Cross-child learner models — general (no-child) branch only (FEAT-60).
  // Child-scoped tabs already get the single-child `learnerModel` slice via
  // buildContextForTask; the general branch keys on no childId, so it loads
  // none. Load every child's slice so cross-child curriculum questions have
  // foundations to ground on. Read-only — no actions are emitted here.
  if (!childId && allChildrenResult.status === "fulfilled" && allChildrenResult.value) {
    const snap = allChildrenResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const perChild = await Promise.all(
        snap.docs.map(async (doc) => {
          const c = doc.data() as { name?: string };
          const slice = await loadLearnerModelContext(db, familyId, doc.id);
          return { name: c.name || "", slice };
        }),
      );
      const section = buildAllChildrenLearnerModels(perChild);
      if (section) supplementalContext += `\n\n${section}`;
    }
  }

  // Disposition profile (Phase 1: uses dispositionCache + overrides — see formatter)
  if (dispositionResult.status === "fulfilled" && dispositionResult.value) {
    const snap = dispositionResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const cd = snap.data();
      const cache = cd?.dispositionCache as DispositionCacheDoc | undefined;
      const overrides = (cd?.dispositionOverrides ?? {}) as DispositionOverridesDoc;
      supplementalContext += formatDispositionProfile(childName, cache, overrides);
    }
  }

  // Recent weekly reviews — 5-row strip (Phase 1: replaces dead dispositionNarrative read)
  if (reviewResult.status === "fulfilled" && reviewResult.value) {
    const snap = reviewResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows = snap.docs.map((d) => d.data() as WeeklyReviewRow);
      supplementalContext += formatRecentWeeklyReviews(childName, rows);
    }
  }

  // Conundrum title (Phase 1: drills into nested conundrum.title — see formatter)
  if (conundrumResult.status === "fulfilled" && conundrumResult.value) {
    const snap = conundrumResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const data = snap.data() as { conundrum?: { title?: string } } | undefined;
      supplementalContext += formatConundrumTitle(data);
    }
  }

  // Recent teach-backs — Phase 1 addition (14d, limit 10, in-memory title filter)
  if (teachBacksResult.status === "fulfilled" && teachBacksResult.value) {
    const snap = teachBacksResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows = snap.docs.map((d) => d.data() as TeachBackArtifactInput);
      supplementalContext += formatRecentTeachBacks(rows);
    }
  }

  // ACTIVITIES (FEAT-135) — the doc ids + current default minutes the
  // setActivityMinutes action addresses. Without this section the model has no
  // valid id to put in a payload, which is exactly why it previously had to
  // deflect (and invented a settings screen doing so).
  if (activityConfigResult.status === "fulfilled" && activityConfigResult.value) {
    const snap = activityConfigResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows: ChatActivityRow[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<ChatActivityRow, "id">),
        id: d.id,
      }));
      const section = formatChatActivities(rows, allChildNames);
      if (section) supplementalContext += `\n\n${section}`;
    }
  }

  // WATCH LIBRARY (FEAT-149) — the doc ids of the videos already vetted in, so
  // the model can plan a real one and can tell a duplicate from a new find.
  if (watchLibraryResult.status === "fulfilled" && watchLibraryResult.value) {
    const snap = watchLibraryResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows: WatchLibraryRow[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<WatchLibraryRow, "id">),
        id: d.id,
      }));
      const section = formatWatchLibrary(rows, childName);
      if (section) supplementalContext += `\n\n${section}`;
    }
  }

  // THIS WEEK (FEAT-142) — the live checklist of each weekday, with each row's
  // identity key and whether it is finished. Without this section the model has
  // no valid row to name in a payload, which is exactly why the chat could only
  // ever talk about the week rather than change it.
  if (weekDaySnaps) {
    const rows: ChatWeekDayRow[] = weekDayKeys.map((d, i) => {
      const snap = weekDaySnaps[i];
      const data = snap?.exists ? (snap.data() as Record<string, unknown> | undefined) : undefined;
      return {
        dateKey: d.dateKey,
        label: d.label,
        checklist: (data?.checklist ?? []) as ChatWeekChecklistRow[],
      };
    });
    const section = formatChatWeekDays(rows, childName);
    if (section) supplementalContext += `\n\n${section}`;
  }

  // ── Teaching Reflection Data ──────────────────────────────────
  const reflectionLines: string[] = [];

  // Completion patterns by day of week
  if (completionResult.status === "fulfilled" && completionResult.value) {
    const snap = completionResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayCompletionRates: Record<string, { total: number; completed: number }> = {};
      const skippedActivities: Record<string, number> = {};

      for (const d of snap.docs) {
        const data = d.data() as { date?: string; checklist?: Array<{ label?: string; completed?: boolean; skipped?: boolean; engagement?: string }> };
        if (!data.date || !data.checklist) continue;
        const dayOfWeek = dayNames[new Date(data.date + "T12:00:00").getDay()];
        if (!dayCompletionRates[dayOfWeek]) dayCompletionRates[dayOfWeek] = { total: 0, completed: 0 };

        for (const item of data.checklist) {
          dayCompletionRates[dayOfWeek].total++;
          if (item.completed) dayCompletionRates[dayOfWeek].completed++;
          if (item.skipped && item.label) {
            skippedActivities[item.label] = (skippedActivities[item.label] ?? 0) + 1;
          }
        }
      }

      const completionByDay = Object.entries(dayCompletionRates)
        .filter(([, v]) => v.total > 0)
        .map(([day, v]) => `${day}: ${Math.round((v.completed / v.total) * 100)}%`)
        .join(", ");

      if (completionByDay) {
        reflectionLines.push(`Completion by day: ${completionByDay}`);
      }

      const topSkipped = Object.entries(skippedActivities)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([label, count]) => `${label} (${count}x)`)
        .join(", ");
      if (topSkipped) {
        reflectionLines.push(`Most skipped: ${topSkipped}`);
      }
    }
  }

  // Conundrum engagement
  if (conundrumArtifactsResult.status === "fulfilled" && conundrumArtifactsResult.value) {
    const snap = conundrumArtifactsResult.value as { empty: boolean; size: number };
    const count = snap.empty ? 0 : snap.size;
    reflectionLines.push(`Conundrum responses recorded: ${count}`);
  }

  // Chapter response data
  if (chapterResponseResult.status === "fulfilled" && chapterResponseResult.value) {
    const snap = chapterResponseResult.value as { empty: boolean; size: number; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const count = snap.size;
      const books = new Set<string>();
      for (const d of snap.docs) {
        const data = d.data() as { bookTitle?: string };
        if (data.bookTitle) books.add(data.bookTitle);
      }
      reflectionLines.push(`Chapter responses (last 2 weeks): ${count} responses across ${books.size} book(s)${books.size > 0 ? ` (${Array.from(books).join(", ")})` : ""}`);
    }
  }

  if (reflectionLines.length > 0) {
    supplementalContext += `\n\nTEACHING REFLECTION DATA (use this when the parent asks how things are going):\n${reflectionLines.join("\n")}

When the parent asks about engagement, frustration, or how things are going, use this data.
Don't give generic homeschool advice — give advice based on what's actually happening.
Example: If the parent says "Lincoln seems bored with reading" and the data shows positive engagement but low quest completion, say: "His daily reading engagement looks positive — he might enjoy the workbook but find the quests too easy. Try increasing quest difficulty or switching to comprehension mode."`;
  }

  console.log(
    `[shellyChat] childId=${childId}, childName=${childName}, sharedContextLength=${sharedContext.length}, supplementalLength=${supplementalContext.length}`,
  );

  // ── Step C: Build system prompt with charter alignment ──────────
  const roleSection = buildShellyChatRoleSection(childId && childName ? childName : undefined);
  const sightWordActionAddendum = buildSightWordActionAddendum(childId || undefined, childName || undefined);
  const snapshotActionAddendum = buildSnapshotActionAddendum(childId || undefined, childName || undefined);
  const activityMinutesActionAddendum = buildActivityMinutesActionAddendum(childId || undefined, childName || undefined);
  const curriculumActionAddendum = buildCurriculumActionAddendum(childId || undefined, childName || undefined);
  const dayItemActionAddendum = buildDayItemActionAddendum(childId || undefined, childName || undefined);
  // FEAT-149 — the plannable window is this week plus next, derived from the
  // same family-zone civil date the THIS WEEK read uses, so the days the model
  // is told about are exactly the days the client gate will accept.
  const watchActionAddendum = buildWatchActionAddendum(
    childId || undefined,
    childName || undefined,
    plannableWatchDays(new Date(), familyTimeZone),
  );
  const planAdjustmentActionAddendum = buildPlanAdjustmentActionAddendum(childId || undefined, childName || undefined);
  // FEAT-150 — the next school week, from the same family-zone civil date every
  // other window here uses, so the span the model says out loud is the span the
  // client's card shows and the week its writer will accept.
  const draftNextWeekAddendum = buildDraftNextWeekAddendum(
    childId || undefined,
    childName || undefined,
    nextWeekDays(new Date(), familyTimeZone),
  );
  const frictionCaptureAddendum = buildFrictionCaptureAddendum();
  const webSearchAddendum = buildWebSearchAddendum(childId && childName ? childName : undefined);

  const systemPrompt = `${sharedContext}

${supplementalContext}

${roleSection}
${sightWordActionAddendum}
${snapshotActionAddendum}
${activityMinutesActionAddendum}
${curriculumActionAddendum}
${dayItemActionAddendum}
${watchActionAddendum}
${planAdjustmentActionAddendum}
${draftNextWeekAddendum}
${frictionCaptureAddendum}
${webSearchAddendum}

After your response, suggest 2-3 brief follow-up questions the parent might want to ask. Format them on new lines at the very end of your response, each prefixed with "[FOLLOWUP] ". Keep each under 50 characters. These should be specific to what you just discussed, not generic.

Example:
[FOLLOWUP] How do I adapt this for London?
[FOLLOWUP] What materials do I need?
[FOLLOWUP] Can you make this a printable?`;

  const model = modelForTask("shellyChat" as never);

  // Send only last 20 messages
  const recentMessages = messages.slice(-20);

  // Check if the last user message contains an image URL for vision analysis
  const lastUserMsg = [...recentMessages]
    .reverse()
    .find((m) => m.role === "user");
  const imaged = lastUserMsg
    ? extractImageUrls(lastUserMsg.content)
    : { urls: [], text: "" };

  let result: { text: string; inputTokens: number; outputTokens: number };

  if (imaged.urls.length > 0) {
    // Vision path: one OR MORE URL-based images (FEAT-59 multi-image parity).
    console.log(
      `[shellyChat] Vision path — ${imaged.urls.length} image URL(s) detected:`,
      imaged.urls[0]?.slice(0, 60),
    );
    const textContent = imaged.text || "What can you tell me about this image?";

    // Prior messages (everything except the last image message)
    const priorMessages = recentMessages
      .filter((m) => m !== lastUserMsg)
      .map((m) => ({ role: m.role, content: m.content }));

    result = await callClaudeWithVisionUrls({
      apiKey,
      model,
      maxTokens: 2000,
      systemPrompt,
      imageUrls: imaged.urls,
      textPrompt: textContent,
      messages: priorMessages,
    });
  } else {
    console.log("[shellyChat] Text path — no image URL detected");
    result = await callClaude({
      apiKey,
      model,
      maxTokens: 2000,
      systemPrompt,
      messages: recentMessages,
      // FEAT-12 Phase 1: parent-facing web search, capped per turn. Vision path
      // (above) intentionally stays search-free for Phase 1.
      webSearch: { maxUses: 4 },
    });
  }

  if (!result.text) {
    console.warn("Claude returned empty response", {
      model,
      taskType: "shellyChat",
    });
  }

  console.log(
    `[AI] taskType=shellyChat inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId: childId || null,
    taskType: "shellyChat",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};

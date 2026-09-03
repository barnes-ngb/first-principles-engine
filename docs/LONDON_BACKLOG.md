# London Backlog — the deferral register

> **What this is:** the single register of London's (6yo) experience across the app. It records, surface
> by surface, what works for London **today**, what's deliberately held until it's tuned for him, and
> what isn't built yet — each grounded against the code.
> **Created:** 2026-05-31 · **Companion to:** `docs/review/REVIEW_HOME_BASE.md` (ledger), `CLAUDE.md` ›
> AI Development Operating Model (the Lincoln-first policy).

---

## Principle — Lincoln-first, London minimal

We build **for Lincoln first**. London's account and profile stay live and real, but his experience is
**intentionally minimal**: a surface opens for London only when it has been **tuned for a 6-year-old**.
Until then it's **held** — gated **on capability, never on his name** — and the gap is logged here so
nothing is lost.

This is a deliberate change from the old "London parity" goal (former `FEAT-02`). **Parity is no longer
the target.** New work wires for Lincoln first; London tuning is **deferred to this file, not built
speculatively.** When a surface is genuinely ready for a 6-year-old (or simply doesn't depend on age),
London uses it today.

### Status legend
- **Ready** — works for London today (either tuned for him, or age-independent). The Notes say *why
  it's safe*.
- **Hold-until-tuned** — the feature exists for Lincoln but isn't appropriate for a 6-year-old yet.
  Gate London **out on capability** until it's built for him. The Notes say *what's missing*.
- **N/A** — doesn't apply to the youngest child (e.g. teach-back, which is the older child teaching the
  younger).
- **Not-built** — the feature itself doesn't exist yet for anyone.

> **Gating rule:** capability, never name. `isLincoln` (= `themeStyle === 'minecraft'`) and `ageGroup`
> are **cosmetic/personality** signals and stay as-is; they are *not* access controls. A hold is a
> capability gate (e.g. a reading-level threshold, an explicit `hideMine`), not a `child.name` check.

---

## Register

| Surface | London status | What London would need | Where (code) | Notes |
|---|---|---|---|---|
| **Kid Today — checklist** | Ready | — | `src/features/today/KidTodayView.tsx` (checklist render), `KidChecklist.tsx` | Renders for any active child; the only gates (must-do count, armor gate) are **universal**, not name-gated. Safe: it's the daily floor, age-independent. **Re-verified 2026-09-03: still Ready.** `KidTodayView.tsx:721-748` renders `KidChecklist` for any child; the gate math is `computeQuestProgress` (universal). One caveat, filed as a name-gate (§Audit 2026-09, B2): the self-report mastery chips `⛏️ Easy! / 🔨 Tricky / 🧱 Hard` render only `&& isLincoln` (`KidChecklist.tsx:299,624`), so London can never mark an item stuck himself. **FIXED 2026-09-03 (FEAT-183):** the chips now render on `isChildProfile` (`KidChecklist.tsx:307,632`, threaded from `KidTodayView.tsx:192,730`) — **any kid**, so London can mark an item `stuck` and seed the FEAT-68 daily-struggle signal himself. Labels unchanged (Batch C). |
| **Kid Today — XP / diamonds bar** | Ready | — | `KidTodayView.tsx:560-565` (`XpDiamondBar` + `MinecraftXpBar`), `src/core/xp/` | Ungated for London (former FEAT-02 de-gating). Safe: progress display, no reading load. **Re-verified 2026-09-03: still Ready** — `KidTodayView.tsx:652-654` (`XpDiamondBar`, ungated; the old `:560-565` reference drifted). |
| **Kid Today — extra-activity logger** | Ready | — | `KidTodayView.tsx:666` → `KidExtraLogger.tsx` | Renders unconditionally ("I did more!" capture). Safe: low-friction, photo/voice capture, no reading load. **Re-verified 2026-09-03: still Ready** — `KidTodayView.tsx:857-863` → `KidExtraLogger.tsx:95-118` (unconditional). Copy is Minecraft-framed for both kids (`⛏️ I Did More Mining!`, `Did extra work on your tablet? (Reading Eggs, Math App, Typing) Log it here!`, `:95-98`) — P3 copy, §Audit 2026-09. |
| **Kid Today — greeting / celebration tone** | Ready | — | `KidTodayView.tsx:102-135` (`getGreeting`, `CELEBRATIONS` vs `MC_CELEBRATIONS`) | Already London-tuned: he gets the generic warm pool, Lincoln gets Minecraft phrasing. Safe by construction. **Re-verified 2026-09-03: still Ready** — `KidTodayView.tsx:111-142` (`getGreeting`/`getCelebration`), flag at `:265` (name-derived; ARCH-41, cosmetic). |
| **Knowledge Mine / `/quest`** | **Hold-until-tuned** | A 6-year-old reading-level path: kindergarten content framing, lower/age-shaped level caps, prompts that don't assume Lincoln's reader. | `src/features/quest/workingLevels.ts:49-71` (`computeStartLevel`), `questTypes.ts` (`QUEST_MODE_LEVEL_CAP`), `useQuestSession.ts:491`, prompt builders in `functions/src/ai/chat.ts` | Calibration **is** per-child (reads `skillSnapshot.workingLevels`), so London would get *his* level — but the caps and content framing are identical to Lincoln's and the quest is reading-heavy. **Now held via a reading-snapshot capability gate** (`canAccessKnowledgeMine` in `src/features/quest/knowledgeMineAccess.ts`): no reading skill snapshot → tile hidden + `/quest` redirects to `/today`; **opens automatically once London is evaluated/tuned**. Gate keys on snapshot data, never on name/`isLincoln` (see ARCH-15). **Re-verified 2026-09-03: still Hold, gate present and on capability** — `canAccessKnowledgeMine` (`knowledgeMineAccess.ts:87-91`) keys on snapshot data only; route guard `router.tsx:83-91` (`RequireKnowledgeMineAccess` → `/today`), nav filter `AppShell.tsx:75-76`, tile `MyAvatarPage.tsx:239,1696`. **Two leaks found (§Audit 2026-09):** (a) **P1 / UX-150** — applying the FEAT-34 London defaults (`londonDefaults.ts:19-63`, five `prioritySkills` incl. `reading.letterSound` and `math.placeValue`) through `SkillSnapshotPage.tsx:128` satisfies BOTH `hasReadingCalibration` and `hasMathCalibration`, so one parent tap opens the whole Mine (reading + math quests) for London with nothing tuned — the starting frame is read as calibration; (b) **P2** — Kid Today's mining row (`KidTodayView.tsx:798-827`, `⛏️ Start Mining` → `/quest`) renders for every kid regardless of the gate, so London taps it and is bounced back to `/today` with no explanation. |
| **Teach-back** | **N/A** | — | `KidTodayView.tsx:414` (`showTeachBackSection`), `KidTeachBack.tsx:84`, `src/features/today/teachBackRecipient.ts` | Pedagogically this is the **older child teaching the younger** (Lincoln teaches London) — London is the audience/learner, not the teacher. Since **PR #1300** the code renders teach-back **only for a child who has a younger sibling to teach** (`findYoungerSibling`, derived birthdate→grade), so London (youngest) is correctly excluded and no longer sees a stray "I Taught London!" button; the recipient is named dynamically. London-**as-teacher** is not a Lincoln-first priority. Not a gap to fill. **Re-verified 2026-09-03: still N/A and correctly relationship-gated on the kid side** — `KidTodayView.tsx:462-470` (`findYoungerSibling`), `:488` (`teachBackRowVisible`), `:774-792`. The **parent** Today's `TeachBackSection.tsx:40,51` still hides on the literal name (`isLincolnChild`) rather than on `findYoungerSibling` — B13 in §Audit 2026-09. **FIXED 2026-09-03 (FEAT-183):** the parent side now uses the same relationship key (`TeachBackSection.tsx:51,62`, `children` threaded from `TodayPage.tsx:1245`), and the copy names the resolved sibling rather than a hardcoded `London` — which for Lincoln renders the identical words. London is still correctly excluded, now because he is the youngest rather than because of his name. |
| **Avatar / Hero Hub** | Ready | — | `src/features/avatar/MyAvatarPage.tsx:304-328` (`LONDON_FEATURES`, `themeStyle: 'platformer'`, `ageGroup: 'younger'`), `src/core/types/xp.ts:149-224` (`londonPowerupPrompt` per piece) | **Fully built for London**: his own features, platformer theme, younger body proportions, and dedicated platformer-style armor-piece image prompts. Tier progression is shared logic. Safe — this is a genuinely complete London path. **Re-verified 2026-09-03: still Ready** — `MyAvatarPage.tsx:246` (`isLincoln` from `themeStyle`/age-group, not name), `:1289` (`LINCOLN_FEATURES`/`LONDON_FEATURES` seed off that flag), `:1606-1662` (kid customizer), `:1696` (`HeroLauncherTiles`). New since 2026-05-31 and walked below: Banner Rally (own row), and the customizer's photo panel (`AvatarCustomizer.tsx:154` → `AvatarPhotoUpload.tsx:75` `extractFeatures`, a paid image call with **no art-quota cap** — P2, §Audit 2026-09). |
| **My Books** | Ready | — | `src/features/books/BookshelfPage.tsx:82-84` (London → `'storybook'` cover default), book editor/reader | No age/name access gate; London gets a storybook (not Minecraft) cover default. **One of London's strongest surfaces** (drawing + book-making). The Kid-Today must-do gate that fronts it is universal, not a London block. **Re-verified 2026-09-03: still Ready** — `BookshelfPage.tsx:70,93` (storybook default), no access gate; `Generate a Book` is a tab of the new-book dialog (`:991`). The Books surfaces are being walked in depth by **FEAT-179** (UX-102–149); this register only confirms status. |
| **Story Workshop** | Ready | — | `src/features/workshop/WorkshopPage.tsx`, `steps/` | No age/name access gate; story/adventure/card game types all available. London's drawing/story strength makes this a natural Ready surface. Universal must-do gate fronts it, not a London block. **Re-verified 2026-09-03: still Ready (age-blind)** — `WorkshopPage.tsx` has no age/name gate; the kid nav links it (`AppShell.tsx:49`) behind the universal Today gate. **Still the largest uncapped paid surface a kid can reach** (UX-100 residual, re-confirmed): `workshopArt.ts:140,263,391,467` + `WorkshopPage.tsx:521` call `generateImage` with no `useArtQuota`, and three `TaskType.Workshop` LLM calls (`:279,381,485`) are likewise uncapped. Reading load is high (typed story setup) — a parent surface for London in practice; §Audit 2026-09. |
| **Conundrum** | Ready | — | `src/features/today/KidConundrumResponse.tsx:378,382-385` (`londonPrompt`, `londonDrawingPrompt`), generated in `functions/src/ai/tasks/conundrum.ts:121,130` | **London-tuned**: he gets a simpler `londonPrompt` and a **drawing-first** `londonDrawingPrompt` (photo capture), generated "accessible to a 6-year-old." Safe by construction. **Re-verified 2026-09-03: still Ready and London-tuned** — the drawing-first branch is `KidConundrumResponse.tsx:312-403` (`Listen to the story`, quick-pick chips, `📸 Take a Photo of Your Drawing`); prompts from `conundrum.ts:129-130`. The branch is selected by **name** (`:202 if (isLincoln)`, flag from `KidTodayView.tsx:265,765`), not by age — B3 in §Audit 2026-09. **FIXED 2026-09-03 (FEAT-183):** selected on `resolveChildAgeGroup(child) === 'older'` (`KidConundrumResponse.tsx:52,211`); the `isLincoln` prop is gone from the component and its hand-off. London's branch is byte-identical — he reaches it because he is six, not because of his name. |
| **Chapter question pool** | Ready | (Optional) age-shaped question variants | `KidTodayView.tsx` → `KidChapterPool.tsx`, `bookProgress` | Works for London (shared read-aloud pool); no per-child variant, but read-aloud is age-independent and parent-mediated. Untuned but safe. **Re-verified 2026-09-03: still Ready** — `KidTodayView.tsx:680-708` → `KidChapterPool`; parent-mediated read-aloud, unchanged. |
| **Reading evaluation** | Ready (infra) | A London learner profile (see below) | `src/features/evaluate/EvaluateChatPage.tsx:566-577` (phonics/comprehension working-level derivation) | The eval → snapshot → working-level flow is per-child and works for London today; what's missing is London's *starting* profile/defaults, tracked as its own row below. **K-1 experience reconned 2026-06-03 (`docs/review/LONDON_EVAL_READINESS.md`): READY AS-IS for a 6-year-old.** The eval is **parent-mediated/oral** (Shelly instructs the parent; London answers aloud; the parent types observations — London never reads or types the chat), and the reading diagnostic **starts at a true K floor** (Level 0 phonemic awareness, `chat.ts:574`) with 2–3-min steps and encouraging framing — so "can't read yet / voice-first" is satisfied by design. Three **optional, non-blocking** polish items (reading-prompt parity with the math prompt) are logged in the hand-off below. **Re-verified 2026-09-03: unchanged** — `/evaluate` (`router.tsx:73`) is absent from the kid nav and parent-mediated by design; not a kid-tap surface. (Not route-guarded, URL-only for a kid — listed in the kid-write table, §Audit 2026-09.) |
| **Math evaluation (FEAT-06)** | **Ready (infra)** | A London learner profile (see row below) — same dependency as Reading eval. | `EvaluateChatPage.tsx:578-584` (math working-level derivation), `:742-746` (live "Evaluate Math" tab), `functions/src/ai/chat.ts:692-824` (guided math diagnostic prompt) | **Reconciled 2026-06-01:** the guided math-eval flow **is** at reading parity and live for Lincoln — a working **Evaluate Math** tab, a server-side diagnostic prompt, and findings → `workingLevels.math` (plus a live Math Quest + scan-derived math levels). The prior "Hold-until-tuned / no guided flow" status was **stale** (FEAT-06 now RESOLVED). What's actually missing is the same thing the Reading-eval row needs: **London's starting profile/defaults** (`londonDefaults`), tracked in the row below. Build, don't gate — incomplete for London, not harmful. **ARCH-16 (2026-06-01):** the Math Quest tile is now gated on `hasMathCalibration` (math working level or `math.`-prefixed priority skill) independently of the Reading quests — so a math-only child (incl. a future math-evaluated London) sees only the Math Quest, never the Reading quests. See hand-off §1 for the open "hold London from the entire Mine" question. **Re-verified 2026-09-03: unchanged** — same surface and same caveat as the Reading-eval row. |
| **Formal London learner profile** | **Ready** (FEAT-34, 2026-06-20) | — | `src/features/evaluation/londonDefaults.ts` (new), `src/features/evaluation/childDefaults.ts` (`getDefaultsForChild`) | **Built.** `londonDefaults.ts` mirrors `lincolnDefaults`' four exports retuned to a K floor (Emerging/NotYet, voice-first, 2–3 min, no-shame; every skill on an **existing** `SkillTag`, counting→`math.placeValue` with a TODO for a future K math tag). `getDefaultsForChild` selects London vs Lincoln by **grade/age band — DATA, never name** (Pre-K/K/1 or age ≤ 6 → London; else Lincoln; unknown → Lincoln fallback). `SkillSnapshotPage`'s apply-defaults path now routes through it (fixing the prior bug where it applied Lincoln's defaults to any child); defaults stay human-applied. Lincoln's applied defaults are byte-identical. Underpinned both eval rows above. **Re-verified 2026-09-03: still built** — `londonDefaults.ts:19-63`, selected by `childDefaults.ts:87` on grade/age. **But see UX-150:** applying it is what opens the Knowledge Mine (row above). |
| **Functions — per-child AI context** | Ready (shared) | — | `functions/src/ai/contextSlices.ts:83-84` (charter names both kids), TASK_CONTEXT slices | Context is assembled from London's own `skillSnapshot`/profile; the charter preamble already describes London (6, story-driven). No London-specific slice needed — slices are child-agnostic and fed his data. **Re-verified 2026-09-03: unchanged** — `contextSlices.ts:134` (charter names both kids by design; no name branching in `functions/src`, only prompt prose and the `lincolnPrompt`/`londonPrompt` output fields of `conundrum.ts:129-130` / `weeklyFocus.ts:120-125`). |
| **Image-gen theming** | Ready (London-aware) | — | `src/features/planner-chat/generateMaterials.ts:40-44` (London → story theme), `xp.ts` `londonPowerupPrompt` | Worksheet and armor image generation already branch to story/platformer styling for London. Safe by construction. **Re-verified 2026-09-03: still Ready** — `generateMaterials.ts:38,73-75` keys on `getChildAgeGroup` + interests, not name. |
| **Dad Lab — kid view** *(landed after 2026-05-31)* | **Ready (by accident) — name-gated** | Key the two existing branches on `ageGroup`, not the name; stop writing `childId` as a lowercase name | `src/features/dad-lab/KidLabView.tsx:54,278` (branch), `:424-478` (the branch London gets), `:131,176` (artifact `childId: childKey`) | The `else` branch London falls into is already 6-year-old-shaped — `What did you see?` / `Tell Dad what you noticed! You can talk or type.` / `Draw what happened!` with an `AudioRecorder` + `PhotoCapture` (`:442-477`) — so London can use it today. But it is selected by `childName === 'Lincoln'` (**ARCH-42**, unchanged), the Scientific-Method flow is the other branch, and every artifact he captures is written with `childId: childKey` = `'london'` (the lowercase **name**, not the child doc id; `:131,176`) — a query on `childId == child.id` (Today's own `loadArtifacts`, `KidTodayView.tsx:409-412`) never sees them. Framework step chips (`LAB_FRAMEWORKS[...].steps`, `:257-274`) and the raw `labType` chip (`:250`, UX-90) render for him too. Also UX-87/88/89. **Not a gap to build — a gate to re-key.** **FIXED 2026-09-03 (FEAT-183):** the branch keys on `resolveChildAgeGroup(child) === 'older'` (`KidLabView.tsx:62,296`) — London reaches the voice+draw flow because he is six — and both captures write `childId: child.id` (`:147,194`), so his lab artifacts are visible to every `childId == child.id` reader from now on. Existing name-keyed docs are **counted, not rewritten**: Settings › Dev › *Artifact childId Audit* reports them (see §Audit 2026-09 › B14 backfill). The `childReports` storage key is still the lowercase name — a data shape, out of this run. UX-87/88/89/90 remain open. |
| **Stickers (`/stickers`)** *(landed after 2026-05-31)* | Ready | — | `src/features/books/StickersPage.tsx:36,64-65,188,212,224`, `SketchScanner.tsx`, `MakeStickerDialog.tsx`, `useStickerArtQuota.ts` | Reached from Today → My Books → `Stickers` (`BookshelfPage.tsx:343`). Every paid door is behind the weekly art cap (`capReached`, FEAT-165/166/167/175) and the help sheet + hints carry a tested kid voice gated on `isChildProfile` (FEAT-178) — capability, never name. One name coupling remains: the sticker's `childProfile` field is `'lincoln' \| 'london' \| undefined` **derived from the name** (`StickersPage.tsx:43-48`, `BookEditorPage.tsx:625-626,1966`, `StickerPicker.tsx:178,223`) and stored on the doc — B7 in §Audit 2026-09. The rest of the Stickers walk belongs to FEAT-179 / UX §12. |
| **GDQ Kit Builder — character art** *(landed after 2026-05-31)* | Ready (capped) — parent-needed for the form | (Optional) a voice/tap path for the typed fields | `src/features/business/KitBuilderSection.tsx:70` (`capped = !canEdit`), `KitBuilderForm.tsx:289,313-352,426-599` | Generation is kid-allowed, capped on capability (`capped === !canEdit`, never a name), and the help is in the kid voice (FEAT-178). The **kit itself is a typed form** — `Vault name`, `Look`, `Special move`, `Power`, `Menace`, `Win condition`, placeholders like `How does a defender beat an invader?` (`:426-599`) — which a 6-year-old cannot fill alone. Ready as an art tap, parent-needed as a builder. |
| **Watch — playback** *(landed after 2026-05-31)* | Ready | — | `src/features/watch/WatchPlayer.tsx:282,302,344-347,369,381-386`, `WatchItemDialog.tsx:66-68`, `useWatchItemCompletion.ts:83`; curation `router.tsx:62-69` (`RequireParent`) | A planned video plays inside the sandboxed end-stop player; the only forward control is `Mark it done` → `All done! 🌱`, plus `Make it big` / `Make it small` and `Go back` on error — all sight-word-level. Completion writes an artifact + the day's minutes, no XP. Curation is parent-only by route (`/watch`) and by `canEdit`. The one above-level string is the caption `When it ends, tap “Mark it done” to count your time and save what you saw.` (`:381`) — P3. |
| **Banner Rally / Stonebridge** *(landed after 2026-05-31)* | Ready | — | `src/features/avatar/stonebridge/StonebridgeMissionCard.tsx:60-198`, `StonebridgeVillage.tsx:100-254`, `BannerRaiseCelebration.tsx:114,190`, `computeStonebridgeProgress.ts:63` | Derived read-only from `BOOK_READ` / `QUEST_COMPLETE` XP events; London can progress through the Book Reader's `BOOK_READ` (`BookReaderPage.tsx:314`) without the Mine, so the mission is not stuck for him. The non-Minecraft branch gets the larger fonts (16px vs 12px). Copy is above his level — `{n} / {n} reading actions`, `Your raised colors — one for every place you've rebuilt.`, `✓ Repaired · tap to revisit` — but the surface is look-and-tap; P3. |
| **Books About Me (`/books-about-me`)** *(landed after 2026-05-31)* | Ready | — | `src/features/monthly-review/KidBooksAboutMePage.tsx:88-89,105-130`, `KidBookReaderPage.tsx:14-19`, `MonthlyReviewReader.tsx:223,252-259,402-427` | Read-only. Title `Books About London`, empty state `Your first book is coming!` / `Mom is working on it.`, a photo grid that opens the reader locked to kid mode with an `Exit reader` icon button and a large `All done` button back to the shelf. No writes, no paid calls, no name check. The strongest new London surface. |
| **Book Reader (`/books/:id/read`)** *(reconciled)* | Ready | — | `src/features/books/BookReaderPage.tsx:119,134,233,314,337,360,561,572` | TTS per page (`speechSynthesis`, `:360,572`), tap-a-word sight-word tracking, `✨ Words to Watch For` for the non-Minecraft branch. Writes on completion: `hours` (`:73`), `BOOK_READ` XP (`:314`), `sightWordProgress` (`:233,337`) — none guarded. **One behavioural name-gate:** `const childAge = isLincoln ? 10 : 6` (`:134`) feeds the comprehension-questions AI — B4 in §Audit 2026-09; should be `computeAge(birthdate)`. **FIXED 2026-09-03 (FEAT-183):** now `computeAge(activeChild?.birthdate) ?? (isLincoln ? 10 : 6)` (`:135-142`) — the stored birthdate wins and the name-keyed pair survives only as the fallback for a doc that has none, the shape `StoryGuidePage` / `BookGenerateChat` / `BookReviewChat` already use. London still reads as 6; Lincoln now reads his real age instead of a frozen 10. |
| **Story Guide (`/books/story-guide`)** *(added by FEAT-183)* | Ready | — | `src/features/books/StoryGuidePage.tsx:57`, `useStoryGuide.ts:39,47,100-102,256` | The guided five-question story wizard. London gets the younger question set (`Who is in your story?` / `Where do they live?` / `What happens one day that's surprising?` — sight-word level, with TTS read-back and a voice answer path), and a `storybook` theme on the brief. **The set was selected by name** (`useStoryGuide(isLincoln)` → `LINCOLN_QUESTIONS : LONDON_QUESTIONS`) — B5 in §Audit 2026-09. **FIXED 2026-09-03 (FEAT-183):** the hook takes an `AgeGroup` and the constants are named for what they are (`OLDER_QUESTIONS` / `YOUNGER_QUESTIONS`); the theme at `:256` keys the same way. Same two sets, same content — London's flow is unchanged. |
| **Generate a Book** *(reconciled — FEAT-176)* | Ready | An assessed phonics level on file (else the Level-2 age fallback) | `BookshelfPage.tsx:991,1057-1064`, `BookGenerateChat.tsx:81-83,328`, `functions/src/ai/storyDecodability.ts` | **Confirmed Ready per FEAT-176**: the level is enforced and measured server-side, keyed on `skillSnapshots.workingLevels.phonics` with an age fallback, never on a name. Client side, the style default and the age fallback are still name-derived (`isLincoln ? 'minecraft' : 'storybook'`, `ageFromBirthdate(birthdate, isLincoln ? 10 : 6)`, `:82-83`) — cosmetic default + fallback only (birthdate wins), B16/B17. A kid who generates lands in the review chat (`:1060` → `/books/:id/review`), an LLM chat with typed input — FEAT-179's walk. |
| **Kid Today — `Show your work!` photo capture** *(reconciled — the AI scan path)* | Ready — **but writes an invariant collection from a kid tap** | Decide whether a kid capture may seed `conceptualBlocks` at all (ARCH-10 input) | `KidChecklist.tsx:280-291` → `KidTodayView.tsx:440-454,1109-1136` → `useUnifiedCapture.ts:120-121,365-376` | The per-item capture runs the same AI scan pipeline as the parent view (`useScan` → one LLM call per photo, uncapped) and, when the page is recognised as a worksheet/textbook/test, **creates or advances an `activityConfigs` doc, derives `skillSnapshots.workingLevels`, folds the position into `learnerModels` and updates `childSkillMaps`** (`:326,353` → `useScanToActivityConfig.ts:128,138,193,277`), then on a detected blocker **merges `skillSnapshots.conceptualBlocks`** (`:373`) plus a `scans` doc — all with no `canEdit` / `isChildProfile` guard. The dialog shows `Saving your work...` for the whole round-trip. **UX-151 (P1)** in §Audit 2026-09. |
| **My Stuff (`/records/portfolio`)** *(kid nav, reconciled)* | Ready (age-blind) — parent-shaped | A kid-shaped gallery, or drop the kid nav item | `src/app/AppShell.tsx:47`, `src/features/records/PortfolioPage.tsx:289-360,617-620` | The kid nav's `My Stuff` opens the parent Portfolio: `Portfolio / Demo Night Highlights`, `Year` / `Month` selects, `Search by title`, `Subject` / `Type` filters and a markdown export button. Read-only and harmless, but nothing on it is for a 6-year-old — P2 copy/shape. (UX-81 already notes the Today card `📸 My Stuff` is a different destination.) |
| **Barnes Bros (`/business`)** *(kid nav, reconciled)* | Ready (kid-allowed by design) | — | `src/features/business/BusinessPage.tsx:33,72,84,95` | Sales log + goal are kid-writable by design (`businessLog` / `businessGoals`, business data, never a learner-model input); confirm/remove and the catalog are `canEdit`-gated; the Kit Builder is its own row above. Typed sales entries are parent-needed for London. |
| **Settings (via the profile menu)** *(reconciled)* | Reachable, untuned | The UX-76 fix (gate the menu item on `canEdit`) | `src/components/ProfileMenu.tsx:85-88,174-179`, `src/features/settings/SettingsPage.tsx:87,160-200` | Not in the kid nav (`parentOnly`, `AppShell.tsx:37`) and not route-guarded; the profile pill's `Settings` item is ungated (UX-76). A kid gets the `General` tab: a `Theme` select and the `AI Features` switches (`localStorage`, this device only). P2. |
| **Ask AI (`/chat`)** *(reconciled)* | Not reachable by tap; URL-only | — | `src/app/AppShell.tsx:38` (`parentOnly`), `router.tsx:101` (no `RequireParent`), `TodayPage.tsx:1349` (the `Ask AI` FAB sits below the kid early return at `:939-942`) | No kid surface links to it; a typed URL reaches it because the route is not guarded. Its image generator (`useShellyChatFlows.ts:565`) is uncapped (UX-100 residual) and its confirm-gated writes reach `sightWordProgress` / `children` / `skillSnapshots` — listed in the kid-write table for the ARCH-10 decision. |

---

## Counts by status (as of 2026-09-03)

29 surfaces classified (16 on 2026-05-31 + 13 landed or reconciled since, walked by FEAT-180):

- **Ready:** 25 — Kid Today checklist, XP/diamonds bar, extra-activity logger, greeting/celebration tone,
  Avatar/Hero Hub, My Books, Story Workshop, Conundrum, Chapter pool, Reading-eval infra, Math-eval infra,
  London learner profile, Functions per-child context, Image-gen theming, **Dad Lab kid view (by accident —
  name-gated)**, Stickers, Kit Builder art, Watch playback, Banner Rally, Books About Me, Book Reader,
  Generate a Book (FEAT-176), Kid Today photo capture (**writes `skillSnapshots` from a kid tap** —
  UX-151), My Stuff (parent-shaped), Barnes Bros. Most are age-independent or already London-tuned; the
  bolded ones are Ready with a P1 attached.
- **Hold-until-tuned:** 1 — Knowledge Mine. **The hold has a hole (UX-150):** applying the London
  defaults opens it.
- **N/A:** 1 — Teach-back (relationship-gated on the kid side; name-gated on the parent side, B13).
- **Reachable but untuned / URL-only:** 2 — Settings (profile-menu item, UX-76), Ask AI (typed URL only).
- **Not-built:** 0 — the London learner profile shipped 2026-06-20 (FEAT-34).

The 2026-05-31 counts (13 / 1 / 1 / 1) are superseded by this section; the earlier prose above the table
is kept as the record of how each row was reasoned.

## Hand-off — Hold-until-tuned surfaces that need a code gate next

Prioritized. Each is a **small, reviewable follow-up PR** (this run is docs-only — it set policy and the
register, it did not change gating).

1. **Knowledge Mine — gate London out until a 6-year-old reading path exists.** ✅ **Shipped** (capability
   gate on reading-snapshot presence; opens automatically once London is evaluated).
   - **Tile gate:** `src/features/avatar/MyAvatarPage.tsx:1622` — now
     `<HeroLauncherTiles isLincoln={isLincoln} hideMine={hideKnowledgeMine} />`, driven by
     `canAccessKnowledgeMine(skillSnapshot)` via the shared `useChildSkillSnapshot` hook. Held = tile
     absent (no "you can't" messaging).
   - **Route guard:** `src/app/router.tsx:65` — `/quest` is wrapped in `RequireKnowledgeMineAccess`,
     which silently redirects an ineligible child to `/today` (kid home) so a direct link can't bypass
     the tile gate.
   - **Capability signal, not name:** `canAccessKnowledgeMine` (`src/features/quest/knowledgeMineAccess.ts`)
     keys on snapshot calibration data (priority skills / completed program / working levels), **never**
     on `child.name` or `isLincoln`. **Smoke-check after merge:** confirm Lincoln still sees the Mine
     tile and can open `/quest`. Data-gap that forces this shape is tracked as `ARCH-15`.
   - **Per-quest domain gating (ARCH-16, 2026-06-01):** the Mine is a multi-domain hub, so the *entry*
     gate above stays generic but each quest tile is now gated on its **own** domain's calibration —
     `hasReadingCalibration` for the Reading quests, `hasMathCalibration` for the Math Quest. London
     (no calibration anywhere) is still held at entry, unchanged. **Design choice to note:** *if* London
     is later math-evaluated but not reading-tuned, he would enter the Mine and see **only the Math
     Quest** — never the Reading quests (reading calibration absent). That is intentional under
     Lincoln-first / shame-free absence. **Open question for the owner:** if instead you want London held
     from the *entire* Mine until his full experience (incl. math) is tuned for a 6-year-old, that is a
     broader gate (hide the tile whenever `isLincoln` is false / age < N) — flagged here, **not built**,
     pending your call. Build it only on an explicit assignment.
     **2026-09-03 (FEAT-180):** the entry gate has a hole the two cases above did not consider — applying the
     FEAT-34 London *defaults* writes non-math **and** math `prioritySkills`, which both domain gates read as
     calibration, so the whole Mine opens without any evaluation. Filed as **UX-150**; see the audit section below.

2. **Math eval (FEAT-06) — done (infra); no gate, no build needed for Lincoln.** Reconciled 2026-06-01:
   the guided math-eval flow is already live at reading parity (FEAT-06 **RESOLVED**). No harmful surface
   to gate. The only remainder is London's learner profile (`londonDefaults`) — the **Not-built** row
   below, shared with Reading eval — not a FEAT-06 build.

The **Not-built** (London learner profile) and **N/A** (teach-back) rows need no gate — the former is a
build, the latter doesn't apply.

### ARCH-15 update (2026-06-02) — London now has a complete identity profile

The data-gap that forced name-based gating (`ARCH-15`) is closed: both kids have a real identity profile
(`birthdate` + `grade`) settable in **Settings › Child Profile**, pre-filled with London's real values
(2020-02-20 / 1st grade) so it's one **Save** tap. This is **identity DATA, never a gate** — London's
experience is still held on **capability** (snapshot calibration), exactly as before. Demographics may now
**seed** sensible cosmetic/presentation defaults for a child with no avatar profile or snapshot yet
(avatar age-group, worksheet font sizing) and feed records/AI-context — but no surface opens for London on
age/grade/name. Worksheet generation, avatar/armor cosmetics, and `generateStory` interests are now
profile-/age-derived rather than name-keyed, so London is wired the same way Lincoln is.

### Reading-eval K-1 readiness (2026-06-03) — READY AS-IS; one optional polish slice

Read-only recon of whether the **reading evaluation** is age-appropriate for London's *first* eval, full
findings in **`docs/review/LONDON_EVAL_READINESS.md`**. **Verdict: London can be evaluated now.** The eval
is **parent-mediated and oral** — Shelly instructs the **parent** one short step at a time, London answers
aloud, the parent types observations; London never reads or types the chat — and the reading diagnostic
**starts at a true pre-reading K floor** (Level 0 phonemic awareness → letter sounds → CVC), caps steps at
2–3 min, and frames everything as a "frontier," not a score. So the early-reader / voice-first / no-shame
criteria are satisfied **by design** for a 6-year-old. *(The child-direct Knowledge-Mine quest is the
surface where reading/voice/tap load actually bites — it stays held behind `canAccessKnowledgeMine` until
London is evaluated/tuned; the eval is what opens it.)*

**Optional, non-blocking polish slice** (reading-prompt-only — bring `buildEvaluationPrompt`'s reading
branch to parity with the already-shipped math branch; a few lines in **one function**,
`functions/src/ai/chat.ts`, behaviour-additive, no propose-and-confirm surface touched):

3. **Reading-eval prompt → math-prompt parity (gentle-polish, do only on assignment).** Add to the reading
   branch of `buildEvaluationPrompt` (`chat.ts:556-688`): (a) an explicit *"for a young/early reader with
   no prior snapshot, START AT LEVEL 0"* line (mirrors `chat.ts:709`, makes the floor explicit not just
   implicit); (b) the explicit *"no grades, no rankings — never shaming"* guard the math branch already has
   (`chat.ts:703`); (c) a *"see child profile for age; for a 6-year-old keep steps very short, phrasing
   simple, lead with an easy win"* line (mirrors `chat.ts:695`, so the eval *uses* the age it already
   receives). **Not required for London's first eval** — it's already ready; this is marginal gentling.

### FEAT-176 (2026-09-03) — "Generate a Book" is now tuned for a 6-year-old, so it opens for London

Owner report, Nathan 2026-09-03: *"it makes books not readable by London who is 6 … regardless the words
are too advanced."* This is London-specific work landing because the surface is finally being **tuned**
for him rather than left age-blind. `generateStory` now carries a concrete READING LEVEL block (allowed
patterns, an explicit banned list, a SAFE WORDS allowlist, a sentence shape by level) and **measures** the
drafted story against London's decoding level, fixes it once, and says plainly what is still above it —
`functions/src/ai/storyDecodability.ts`. **When London has no assessed level the check falls back to
Level 2** (CVC by word family), the careful floor, and the parent-facing line says it is an estimate and
points at Working Levels on the Skill Snapshot. Gated on capability, never on his name: the level comes
from `skillSnapshots.workingLevels.phonics`, and nothing reads `isLincoln` or a child's name.
**Still open for London on this surface:** he has few sight words on file, so his SAFE WORDS list is
mostly the shared core — the block is as good as the data behind it, and an assessed phonics level would
make it markedly better than the age estimate.

### FEAT-178 (2026-09-03) — the art help's kid wording is written to a 6-year-old, and tested for it

The "How this works" sheets and the one-line hints under every paid generate button (Stickers, From a
Drawing, the Book Editor, Generate-a-Book, the Kit Builder) carry two voices, and the kid voice is written
to London's reading, not to a generic "simple" register: `artHelpContent.test.ts` fails the build if any
kid line runs over eight words, skips its full stop, or uses a word over two syllables by a vowel-group
proxy. The proxy is deliberately cheap — the repo's real orthographic classifier
(`functions/src/ai/storyDecodability.ts`) is server-only and the app cannot import it — so it is a floor on
carelessness, not a reading measurement; its job is to make "polished", "reimagine" and "characters" fail
loudly in a file a six-year-old has to read alone. Gated on capability (`isChildProfile`), never on his
name, and the kid text says "you" — it never names a child.

---

## London Audit 2026-09 (FEAT-180) — the app walked as a 6-year-old

**Run:** 2026-09-03, read-only, on `origin/main` `8b9d1d08` (baseline green: lint 0 errors, tsc clean,
6763 tests, `docs:check` clean). **Why now:** the last two weeks tuned Books for London (FEAT-176/178); the
rest of the app was built Lincoln-first and the register above had not been re-walked since 2026-05-31 —
Dad Lab kid view, Stickers, Kit Builder, Watch, Banner Rally, Books About Me and the chat portal all landed
in between. **Method:** you cannot run the app from here, so every claim is what the JSX and the writers
say, quoted with `file:line`; anything that needs a runtime is marked *unverified*. Reading-load
classification uses FEAT-178's kid-copy bar (≤ 8 words, no word over two syllables, London ≈ phonics
Level 2 + Dolch pre-primer/primer sight words) because the real classifier
(`functions/src/ai/storyDecodability.ts`) is server-only. **Severity:** P1 = London can reach a branch,
write or spend never meant for him, or a Ready surface is unusable for him; P2 = wrong for a 6-year-old but
harmless; P3 = polish. **Fixed in this run: nothing** — the one sanctioned exception (a cosmetic
`isLincoln` that is a one-line swap to a capability field the same file already reads) found **no
qualifying site**: every name-derived flag lives in a file that has no `ageGroup`/`themeStyle` in scope
(`KidTodayView` reads `avatarProfile.ageGroup` only after an async load, so swapping would flip the
greeting while the profile loads — judgement, therefore filed). The Books surfaces are being walked in
depth by the concurrent FEAT-179 (UX-102–149); this audit touches Books only where the register needed a
status confirmed.

### Part 2 — The name-gate census (ARCH-41 / ARCH-42 / ARCH-43 re-verified)

**Totals on `main` today (one scope: `src/` + `functions/src/`, `*.test.*` excluded):** `isLincoln` — **993
occurrences on 956 matching lines in 61 files** (the run-prompt's 956 is that line count, unchanged; with test
files included it is 1,030 occurrences in 69 files). Three of the 61 files only *mention* it in a comment that
says "nothing here reads `isLincoln`" — `artHelpContent.ts:19`, `useStickerArtQuota.ts:22`,
`useBookArtQuota.ts:21`. `ageGroup` —
**26 files**, every use cosmetic or a body-proportion/outfit seed (allowed: it *is* the capability field).
**Literal name comparisons:** ARCH-43's 20 sites are **all still present** (line numbers drifted, no fix,
no new Lincoln-keyed site), plus **7 London-/both-keyed siblings** ARCH-43's Lincoln-only grep never
counted (all pre-existing; the clone is 195 commits deep and `git log -S` bottoms out at the PR #1670 merge,
so "pre-existing" is *unverified* beyond that boundary).

**How `isLincoln` is derived, by family** (this is the census' real finding — the 61 files split into three
derivation roots, and only one of them is a name):

| Derivation root | Files | Nature |
|---|---|---|
| **A. `themeStyle === 'minecraft'` / `ageGroup === 'older'`** (capability) — `MyAvatarPage.tsx:246` → 27 avatar/stonebridge prop consumers; `VerseCard.tsx:70`, `UnlockCelebration.tsx:55`, `ArmorGateScreen.tsx:29`, `TierUpgradeCelebration.tsx:53`; `OutfitCustomizer.tsx:49`, `voxel/minecraftSkin.ts:209` | 33 | Cosmetic (font, palette, emoji, radius, copy tone) plus two allowed seeds (`LINCOLN_FEATURES`/`LONDON_FEATURES` at `MyAvatarPage.tsx:1289`; outfit defaults `OutfitCustomizer.tsx:55,65`). **No row.** |
| **B. `child.name.toLowerCase() === 'lincoln'`** (name) — `KidTodayView.tsx:265` → `KidChecklist`, `KidCelebration`, `KidRitualRow`, `KidConundrumResponse`; `ExplorerMap.tsx:57-58`; `TodayChecklist.tsx:401`; `TeachBackSection.tsx:40`; `UnifiedCaptureCard.tsx:99`; `RoutineSection.tsx:76`; `KidLabView.tsx:54`; `BookReaderPage.tsx:119` → `ComprehensionQuestions`; `StoryGuidePage.tsx:46` → `useStoryGuide`, `StoryGuideQuestion`; `PageEditor.tsx:78`; `StickersPage.tsx:43-48`; `BookEditorPage.tsx:200,625-626` → `printBook`, `GenerationProgress`, `StickerPicker`; `BookshelfPage.tsx:70`; `BookGenerateChat.tsx:81`; `BookReviewChat.tsx:53`; `CreateSightWordBook.tsx:55`; `MyAvatarPage.tsx:1365` (second flag, switcher only) | 28 | Mostly cosmetic — **but every behavioural site below lives here.** |
| **C. Doc-comment only** — `childDefaults.ts`, `knowledgeMineAccess.ts`, `DataReviewExportPanel.tsx`, `MineRecapCard.tsx`, `storyPageTargets.ts`, `artHelpContent.ts`, `useStickerArtQuota.ts`, `useBookArtQuota.ts` | 8 | Comments saying "never keys on `isLincoln`". No code. |

**Cosmetic counts by file (root B only — root A is all cosmetic by construction):** `KidTodayView` 47 of
49 (the 2 behavioural are the prop hand-offs to `KidChecklist:729` and `KidConundrumResponse:765`);
`BookReaderPage` 21/22; `BookEditorPage` 13/16; `BookshelfPage` 15/15 (defaults + ordering); `StoryGuidePage`
11/12; `KidChecklist` 7/9; `ExplorerMap` 8/8; `ComprehensionQuestions` 10/10; `StoryGuideQuestion` 8/8;
`printBook` 13/13; `BookGenerateChat` 6/6; `KidCelebration` 18/18; `KidRitualRow` 4/4; `GenerationProgress`
4/4; `useStoryGuide` 3/4; `RoutineSection` 3/3; `TodayChecklist` 2/2; `UnifiedCaptureCard` 2/2;
`KidConundrumResponse` 2/3; `TeachBackSection` 1/2; `KidLabView` 1/2; `StickersPage` 1/2;
`CreateSightWordBook` 1/3; `PageEditor` 2/2; `MyAvatarPage` (name-derived flag only) 3/3.

**Behavioural sites — each is a UX row in this doc (P1s also in the ledger).** The test applied: *"What
happens when London taps this? If the answer is 'the other branch, because his name isn't Lincoln,' it is
behavioural."*

| # | Site | What London gets instead | Should key on |
|---|---|---|---|
| **B1** | `KidLabView.tsx:54` `const isLincoln = childName === 'Lincoln'` → `:278 {isLincoln ? (` — the Scientific-Method flow vs the voice+draw flow | The voice+draw branch (`:424-478`) — which is the *right* one for him, by accident of name (**ARCH-42**, unchanged) | `getChildAgeGroup(child) === 'older'` for the framework flow; or retire the branch into `LabCaptureBeats` |
| **B2** | `KidChecklist.tsx:299,624` `{item.completed && !item.mastery && isLincoln && (` — the `⛏️ Easy! / 🔨 Tricky / 🧱 Hard` self-report chips | No chips: London can never mark an item `stuck`, so the FEAT-68 daily-struggle signal can only come from a parent for him | `isChildProfile` (any kid) — the chips are three taps, not a reading task |
| **B3** | `KidConundrumResponse.tsx:202` `if (isLincoln) {` (audio + quick picks) vs `:312-403` (listen + picks + drawing) | The drawing branch — correct for him, wrong key | `ageGroup === 'younger'` |
| **B4** | `BookReaderPage.tsx:134` `const childAge = isLincoln ? 10 : 6` → comprehension-questions AI input | Age 6 — correct today, wrong for a renamed/third child and never reads the birthdate that exists | `computeAge(child.birthdate)` (`childIdentity.ts`) |
| **B5** | `useStoryGuide.ts:94` `const questions = isLincoln ? LINCOLN_QUESTIONS : LONDON_QUESTIONS` (+ `:248` theme) — a different guided-story question set | The London set — a different *flow*, keyed on name | `ageGroup` / reading level |
| **B6** | `CreateSightWordBook.tsx:56` `CHILD_BOOK_DEFAULTS.lincoln \| .london`; `:256 {!isLincoln && (` the `London's Starter Words` chip | A different preset list and an extra chip | `grade` / phonics working level (parent surface, `isParent`-gated entry at `BookshelfPage.tsx:348-354`) |
| **B7** | `StickersPage.tsx:43-48` `childProfile: 'lincoln' \| 'london' \| undefined` from the name; `BookEditorPage.tsx:625-626,1966`; `StickerPicker.tsx:178,223` — **stored on the sticker doc** and used as a filter | `'london'` today; `undefined → 'both'` for any other child — a data shape keyed on a name | `child.id` |
| **B8** | `BookEditorPage.tsx:1766` `WORLD_CHIPS_LINCOLN : WORLD_CHIPS_LONDON`, `:1800` `AI_SCENE_STYLES_LINCOLN : AI_SCENE_STYLES_LONDON` — different **prompt** choice sets for the paid scene generator | A different set of scene prompts | `themeStyle` + profile interests |
| **B9** | `LabReportForm.tsx:127-128` `LINCOLN_FIELDS` / `LONDON_FIELDS` — different capture **fields** per child on the parent form (data shape) | London's field set; a third child gets both lists | `ageGroup` / `childRoles` |
| **B10** | `dailyPlanTemplates.ts:142-143` `getTemplateForChild(name)` (called from `TodayPage.tsx:203`) — a different day template by name | `londonTemplate`; a third child gets `undefined` | `grade` / `activityConfigs` |
| **B11** | `useShellyChatFlows.ts:131,143-145` — chat context resolved by name; `reflectionSuggestions.ts:57,82` | Parent surface; a third child has no chat context at all | `child.id` |
| **B12** | `AvatarCharacterDisplay.tsx:205,220` — the brothers scene finds `lincoln`/`london` **by name** | A renamed or third child never renders in the scene | `child.id` + `ageGroup` |
| **B13** | `TeachBackSection.tsx:40,51` `if (!isLincolnChild …) return null` — parent Today's teach-back hidden unless the selected child is literally Lincoln | Intentional pedagogy, wrong key — the kid side already uses `findYoungerSibling` (`KidTodayView.tsx:468`) | `findYoungerSibling(child, children)` |
| **B14** | `KidLabView.tsx:131,176` `childId: childKey` — kid Dad-Lab artifacts written with the lowercase **name** as `childId` | His artifacts carry `childId: 'london'`, not his doc id (`useChildren.ts:153` ids are Firestore auto-ids), so `where('childId','==', child.id)` readers (`KidTodayView.tsx:409-412`) never see them. *Unverified against live data.* | `child.id` |

**Run A closed B1–B5, B13 and B14 (FEAT-183, 2026-09-03).** Seven key swaps, one data fix, one test per
site; every new assertion was run against the pre-fix tree first (21 failed, as they must). What each
became: **B1** `resolveChildAgeGroup(child) === 'older'` (`KidLabView.tsx:62,296`); **B2**
`isChildProfile` (`KidChecklist.tsx:307,632`, threaded from `KidTodayView.tsx:192,730`); **B3**
`resolveChildAgeGroup` (`KidConundrumResponse.tsx:52,211` — the `isLincoln` prop is deleted, not
rewired); **B4** `computeAge(activeChild?.birthdate) ?? (isLincoln ? 10 : 6)`
(`BookReaderPage.tsx:135-142`); **B5** `useStoryGuide(ageGroup)` over `OLDER_QUESTIONS` /
`YOUNGER_QUESTIONS` (`useStoryGuide.ts:39,47,100-102,256`, called from `StoryGuidePage.tsx:57`);
**B13** `findYoungerSibling(child, children)` (`TeachBackSection.tsx:51,62`), the key the kid side
already used; **B14** `childId: child.id` on both kid lab captures (`KidLabView.tsx:147,194`).

**Why not the plain `getChildAgeGroup`.** It reads `child.birthdate` only and answers `'younger'` when
there is none — safe for seeding a font, wrong for choosing a branch. Existing child docs are **not**
auto-backfilled with identity (`useChildren.ts:141-150` seeds only a brand-new doc; an existing one
waits on a parent's Save in Settings), so on a doc that predates the ARCH-15 backfill Lincoln would
have silently dropped into London's flow. `resolveChildAgeGroup` (`childIdentity.ts`) is the same
threshold and the same `'younger'` default, widened to fall back to the canonical birthdate seed in
`childAge.ts` — the same seed `findYoungerSibling` already relies on. It is still DATA, never a gate.

**B14 — the count, and the backfill NOT run.** The audit marked the stray-`childId` claim *unverified
against live data*, and it still is: this run cannot read the family's Firestore. What it shipped
instead is the instrument — **Settings › Dev › Artifact childId Audit** (admin-only, read-only,
`auditArtifactChildIds.ts`). It reads every `families/{familyId}/artifacts` doc and reports the total,
how many carry a real child doc id, how many carry none, and every other `childId` value grouped with
its count, the child it most likely meant (matched case-insensitively on name) and up to five sample
titles. **It writes nothing.** *Run it and record the number here.*

> **Proposed backfill (NOT run — needs a human decision).** For each stray group whose `likelyChild`
> resolves, rewrite that group's `artifacts[].childId` to the child's doc id; leave any group with no
> `likelyChild` alone for a human to name. It is idempotent (a fixed doc no longer matches) and
> touches only the `childId` field. **But it is a write to artifacts under a child's record**, so it
> is propose → confirm → write: it needs its own run, its own ledger row, and a dry-run listing the
> exact doc ids before anything changes. Until then the stray artifacts stay where they are —
> reachable from the lab page that wrote them, invisible to `childId == child.id` readers. Nothing in
> this run depends on the backfill happening.

**Still open — B6–B12, the name-keyed data shapes and choice sets.** Untouched by design: the sticker
`childProfile` field stored on docs, `WORLD_CHIPS_*` / `AI_SCENE_STYLES_*` prompt sets (FEAT-181
retired the latter pair), `CreateSightWordBook`'s presets, the parent lab form's field lists, day
templates, chat context, and the brothers scene. Each is a small design, not a key swap.

Borderline, listed for completeness (cosmetic defaults or fallbacks, no row): default art style by name
(`BookshelfPage.tsx:93`, `BookEditorPage.tsx:242`, `StoryGuidePage.tsx:52`, `BookGenerateChat.tsx:83`,
`useStoryGuide.ts:248`) and theme ordering (`BookshelfPage.tsx:212`); age **fallbacks** where the birthdate
wins (`StoryGuidePage.tsx:48`, `BookGenerateChat.tsx:82`, `BookReviewChat.tsx:54`,
`ageFromBirthdate(birthdate, isLincoln ? 10 : 6)`); `childAge.ts:8-11` `CHILD_BIRTHDATES` by name (a data
seed); `ExplorerMap.tsx:57-58` (`isLondon` gets `🦕 Dino Discovery` — cosmetic, and the only place London
has his *own* theme rather than "not Lincoln").

**ARCH-41 / 42 / 43, re-verified against `main` 2026-09-03:**
- **ARCH-41 — unchanged, unfixed.** `KidTodayView.tsx:265` (drifted from `:240`, same line of code) still
  derives from the name and is threaded into `KidChecklist:729`, `KidRitualRow:687,759,780,803`,
  `KidConundrumResponse:765`, `KidCelebration:1008`; `MyAvatarPage.tsx:1365` `childIsLincoln` is byte-identical.
  What moved: nothing in the code; the *consequence* got sharper — B2 shows the name-flag now hides a
  **feature** (mastery chips), not only a font.
- **ARCH-42 — unchanged, unfixed**, `KidLabView.tsx:54,278` exact lines. What moved: the diagnosis. The
  `else` branch is not "London's simpler form" as filed — it is a voice-first + drawing capture
  (`What did you see?` / `Draw what happened!`, `:442-477`) that is the *better* 6-year-old surface. The fix
  is to key the two existing branches on `ageGroup` (one line), and separately fix B14's `childId`.
- **ARCH-43 — count unchanged at 20**, every site present at a drifted line: `AvatarCharacterDisplay:205`,
  `useShellyChatFlows:131` (was :127), `ExplorerMap:58`, `TodayChecklist:401` (was :347),
  `TeachBackSection:40`, `UnifiedCaptureCard:99` (was :95), `RoutineSection:76`, `CreateSightWordBook:55`,
  `BookReaderPage:119` (was :116), `StoryGuidePage:46`, `PageEditor:78` (was :63), `StickersPage:43` (was :41),
  `BookEditorPage:200,625` (was :174,582), `BookshelfPage:70`, `BookGenerateChat:81` (was :72),
  `BookReviewChat:53` (was :52), plus ARCH-41/42's four. **Undercounted by 7:** the London-keyed siblings
  `ExplorerMap:57`, `AvatarCharacterDisplay:220`, `StickersPage:45`, `BookEditorPage:626`,
  `useShellyChatFlows:143-145`, `dailyPlanTemplates:142-143`, `LabReportForm:127-128` never matched a
  Lincoln-only grep. Still nothing uses `childIdentity.ts`'s helper.

### Part 3 — The kid path, walked as London

**How he gets anywhere:** the kid nav (`AppShell.tsx:42-50`) is `Today · Knowledge Mine (hidden) · My Books ·
Books About Me · My Hero · My Stuff · Barnes Bros · Game Workshop · Dad Lab`, plus the profile pill's
`Settings` (UX-76). Nav labels are two words each; `Knowledge`, `Workshop`, `Barnes` are above level — he
navigates by icon and position, which is fine, and *unverified* on a real device.

**Kid Today (`/today`)** — the daily floor. *Reading:* `Good morning, London!` ✓ sight; `Must Do` ✓;
checklist labels are whatever the parent typed (out of scope); `{n} quests to go!` (`KidChecklist.tsx:344`)
— `quests` above level; `Show your work!` (`:289`) ✓; `Work captured!` ✓; `Choose 2` ✓; `Complete your
must-do items to unlock choices!` (`:489`) ✗ above level, 7 words but `complete/unlock/choices`;
`🔒 Complete {n} more quests` (`:241`) ✗; `Complete {n} more quests to unlock!` (`KidTodayView.tsx:837`) ✗;
`🔒 Finish quests first` (`:937,996`) ✗; `Light day today. Just {n} quests!` (`:716`) ~; `Talk about today's
chapter` (`:685`) ~; `Think about it` ✓; `No mining yet today` / `⛏️ Start Mining` (`:802,824`) ✗ and see
below; `📸 My Stuff` / `Add Photo` / `Add Note` ✓; `Nothing captured yet today. Take a photo of your work!`
(`:1066`) ✗ (`captured`); `Save my time` ✓ (UX-74); `How did it go? (optional)` / `It was fun!`
(`:1125-1126`) ~; `No armor forged yet—want to visit Avatar and craft your first piece?` (`:632`) ✗ (UX-81,
still open); `Suited up for today ✓ — {n}/6 pieces on` (`:608`) ~. *Dead ends:* **P2 — `⛏️ Start Mining`
renders for every kid (`:798-827`, "always open"), but the route guard bounces an ungated child to `/today`
(`router.tsx:83-91`)**: London taps a big green button and the page reloads under him, silently — the Hero
Hub hides the same tile (`MyAvatarPage.tsx:1696 hideMine`), Today does not. The armor gate early return
(`:498-512` → `ArmorGateScreen`) is UX-73, still open: the whole day replaced by `Put on the armor of God` +
the full Ephesians 6:11 with one control, `Go Suit Up`. *Unsupervised:* the per-item capture dialog
(`:1109-1136`) shows `Saving your work...` over a `CircularProgress` for the whole AI-scan round trip and
cannot be dismissed while loading (`onClose={() => !captureLoading && …}`) — a single tap spends an
**uncapped LLM scan call** (`useUnifiedCapture.ts:120` `useScan`); a recognised worksheet/textbook/test then
**creates or advances `activityConfigs`, derives `skillSnapshots.workingLevels`, syncs `learnerModels` and
`childSkillMaps`** (`:326,353`), and a detected blocker **writes `skillSnapshots.conceptualBlocks`**
(`:365-376`) — **P1, UX-151** (see write table). *Age-shaped copy:*
the extra logger is Minecraft for both kids (`⛏️ I Did More Mining!`, `KidExtraLogger.tsx:95`), and its
presets `📖 Reading Eggs / 🔢 Math App / ✏️ Writing / 🔬 Science` assume a tablet-app routine London does
not have — P3. *Writes:* see table.

**Dad Lab kid view (`/dad-lab`)** — *Reading:* `Dad Lab` ✓; `{name}'s Job` ✓; `Your Job` ✓; `What did you
see?` ✓ (5 sight words); `Tell Dad what you noticed! You can talk or type.` ~ (`noticed`); `Draw what
happened!` ✓; `Take a photo of your drawing or pick one from your pictures.` ✗ (12 words); `Capture My Work`
~; `{n} items captured` ~; `No lab running right now` / `Ask Dad when the next lab starts!` ✓/~; the
framework chips (`LAB_FRAMEWORKS[...].steps`, `:263-272`) — e.g. `Question / Prediction / Test …` — ✗
above level and *tappable but tracking nothing* (UX-89); the raw enum chip `science` (`:250`, UX-90).
*Dead ends:* none — every capture has a `Cancel`. *Unsupervised:* `uploading` disables the capture
controls during upload with no other feedback; no paid call. *Name-gate:* B1 (ARCH-42) and B14. **Verdict:
the surface he lands on is right for him; the way he lands on it is wrong, and what it writes is
mis-keyed.**

**My Hero (`/avatar`)** — the fully built London path (register row). *Reading:* `Where to next?` ✓;
tiles `Knowledge Mine` (hidden for him) / `Workshop` / `My Books` ✗/✓; the Banner Rally card (own row
below); the customizer is behind one expander button in the kid branch (`MyAvatarPage.tsx:1606-1627`).
*Unsupervised / paid:* the customizer includes the photo panel (`AvatarCustomizer.tsx:154` →
`AvatarPhotoUpload.tsx:72-75` `httpsCallable('extractFeatures')`) — a paid image call with **no
`useArtQuota` cap and no confirm** (the earlier grep of `src/features/avatar` finds no `capReached`) — **P2**:
one door the art budget does not cover, on a surface London owns. *Writes:* `avatarProfiles`
(`safeProfileWrite.ts:41,70`), `dailyArmorSessions` (`MyAvatarPage.tsx:784-965`), `ARMOR_DAILY_COMPLETE` XP
(`:801,987`), `stonebridgeProgress` (`useStonebridgeProgress.ts:141,158`), an artifact (`:1265-1269`) — all
unguarded, all his own record, all by design.

**Banner Rally / Stonebridge** — *Reading:* `🏰 Stonebridge` ✓; `{n} banners raised` ~; `{current} /
{target} reading actions` ✗ (`StonebridgeMissionCard.tsx` progress line) — `actions` is a parent word;
`🏰 Open Stonebridge` ~; `✓ Repaired · tap to revisit` ✗; `Coming soon` ✓; `Your raised colors — one for every
place you've rebuilt.` ✗ (`StonebridgeVillage.tsx:207`); `Your first banner is coming — keep reading!` ~
(`:212`); `🎉 BANNER RAISED!` / `tap to continue` (`BannerRaiseCelebration.tsx:114,190`) ✓/~. *Dead ends:*
the village is a full-screen board with a `✕` close (`aria-label="Close Stonebridge village"`, `:87-94`)
and the celebration dismisses on tap — fine. *Unsupervised:* nothing waits; no paid call; read-only on the
economy by construction (`computeStonebridgeProgress.ts:63-81`). London can progress via `BOOK_READ`
(`BookReaderPage.tsx:314`) without the Mine. **P3 copy only.**

**Books About Me (`/books-about-me`)** — *Reading:* `Books About London` ✓; `Your first book is coming!`
✓; `Mom is working on it.` ✓; month labels; in the reader `All done` ✓ and an `Exit reader` icon. *Dead
ends:* none. *Unsupervised:* the reader is a published book; nothing to wait on, nothing to spend, nothing
written. **The cleanest kid surface in the app; keep it as the reference.**

**Watch playback (from a planned item on Today)** — *Reading:* `▶ Watch` ✓; `🎬 You Can Watch` ✓; `Watch it
whenever you like — it's not a must-do.` ~ (`KidChecklist.tsx:388`); `Make it big` / `Make it small` ✓
(`WatchPlayer.tsx:282`); `All done! 🌱` ✓; `Mark it done` ✓; `Go back` ✓; the caption `When it ends, tap
“Mark it done” to count your time and save what you saw.` ✗ (`:381`). *Dead ends:* the dialog has a `Close`
icon (`WatchItemDialog.tsx:53-58`) and every overlay has one button. *Unsupervised:* the end-stop is the
point — nothing after the video is tappable; no paid call. *Writes:* an artifact
(`useWatchItemCompletion.ts:83`) + the day's minutes, no XP (D6). **Ready; P3 copy.**

**GDQ Kit Builder (`/business`)** — *Reading:* the whole form is typed prose (`Vault name`, `Look`,
`Special move`, `Power`, `Menace`, `Win condition`; placeholders `How does a defender beat an invader?`,
`steals the seeds`, `KitBuilderForm.tsx:426-599`) ✗ — parent-needed; the art buttons `Make sticker` /
`Regenerate` / `Making…` (`:145,188`) ~. *Unsupervised / paid:* capped on `capped = !canEdit`
(`KitBuilderSection.tsx:70`), the batch loop bounded by the remaining budget (`:339-352`), and at the cap
the buttons are replaced by `ART_QUOTA_MESSAGE` — the model surface for the rest. *Writes:* `kitRosters`,
`artQuota` (his own). **Ready as an art tap; P2 as a builder** — a 6-year-old cannot make a kit alone.

**Stickers (`/stickers`)** — capped, kid-voiced help, `isChildProfile`-gated audience (FEAT-165–178). The
name-keyed `childProfile` data field is B7. Reading load, tap targets and the reimagine flow are FEAT-179's
walk (UX §12 already holds the parent-side findings). **Ready.**

**Book Reader (`/books/:id/read`)** — *Reading:* `✨ Words to Watch For` ~ (`BookReaderPage.tsx:561`);
`🌟 Great reading!` ✓ (`:734`); page dots `Go to page {n}`; TTS on every page (`:360,572`) means the
text itself is read *to* him. *Writes (unguarded):* `hours` on completion (`:73`), `BOOK_READ` XP (`:314`),
`sightWordProgress` `seen`/tap interactions (`:233,337`). *Name-gate:* B4 (`childAge`). **Ready.**

**Generate a Book / My Books** — confirmed Ready per FEAT-176 (register row). Two things for FEAT-179's
list, not this one: a kid's generation lands him in the **review chat** (`BookshelfPage.tsx:1064` →
`/books/:id/review`, `BookReviewChat`), a typed LLM conversation; and the book menu offers `Delete` with
one confirm (`:928,941-949`), ungated.

**Game Workshop (`/workshop`)** — *Reading:* `Game Workshop` ~; `Create your own games! Tell a story and
turn it into a game the whole family can play.` ✗ (`WorkshopPage.tsx:1122-1126`); `What kind of game?` ✓ /
`Tap to hear, tap again to pick!` ✓ (`GameTypeStep.tsx:47-50` — a good pattern); the story-setup steps are
typed. *Unsupervised / paid:* **the largest uncapped paid surface a kid can reach** — five `generateImage`
calls (`workshopArt.ts:140,263,391,467`, `WorkshopPage.tsx:521`) and three `TaskType.Workshop` LLM calls
(`:279,381,485`) with no `useArtQuota`, no `capReached`, no confirm; UX-100's residual, re-confirmed. Behind
the universal Today gate (`gateUnlocked`), which a fully-completed morning opens. *Writes (unguarded):*
`hours` split by challenge bucket (`workshopUtils.ts:50-70,100-147,216-339,462-598`), `MANUAL_AWARD` XP
(`WorkshopPage.tsx:720,784,860`), `days` merge (`workshopUtils.ts:670`), `storyGames`, artifacts;
`CreativeTimer` → `hours` (`useCreativeTimer.ts:138`, also on the Book Editor `BookEditorPage.tsx:983`).
**Ready (age-blind) — P2 for London on cost and reading load, and the next cap to wire.**

**My Stuff (`/records/portfolio`)** — the parent Portfolio (`Portfolio / Demo Night Highlights`, `Year`,
`Month`, `Search by title`, `Subject`, `Type`, export — `PortfolioPage.tsx:289-360,617`). Nothing for him;
nothing harmful. **P2 shape.** **Barnes Bros** — sales log kid-writable by design; typed. **Settings** — the
`General` tab (`Theme`, `AI Features` switches, `SettingsPage.tsx:160-200`) via the ungated menu item
(`ProfileMenu.tsx:85-88,174-179`): **P2**, UX-76's fix closes it. **Ask AI** — URL-only for a kid (no link,
no guard); its image generator is uncapped (`useShellyChatFlows.ts:565`).

**Teach-back for London himself:** confirmed N/A — `KidTeachBack` mounts only inside
`teachBackRowVisible && youngerSibling` (`KidTodayView.tsx:488,774-792`), and `findYoungerSibling` returns
nothing for the youngest. He never sees `Teach {name} something`.

#### The kid-write table (input to the ARCH-10 decision)

Kids share the family auth; `canEdit` (`ProfileProvider.tsx:54`, `=== Parents`) is a UI flag and
`firestore.rules` is one family-wide grant (ARCH-10 / FEAT-127). **Every write below is reachable from a
kid session; the guard column is what stops it *today*.** "None" means the write is the feature working
as designed for a kid — it is listed so the rules decision can be made with the full list, not so it can be
removed. *Rules untouched by this run.*

| Collection | Write | Caller | How a kid reaches it | Guard today |
|---|---|---|---|---|
| **`days`** | checklist toggle (`completed`), `mastery` (Lincoln only), extra-activity item append | `KidChecklist.tsx:126,158`, `KidExtraLogger.tsx:63` → `persistDayLogImmediate` → `useDayLog.ts:139` `setDayLogGuarded('today-save')` | Today, one tap | **None** (the FEAT-114 preservation guard checks entity loss, not who writes) |
| `days` | watch-item completion (minutes), quest auto-complete, workshop-played merge | `useWatchItemCompletion.ts`, `useQuestSession.ts:1328,1985`, `workshopUtils.ts:670` | Today / Mine / Workshop | None / Mine gate / None |
| **`hours`** | `Save my time` (minutes, `artifactSaved:false`) | `UnifiedCaptureCard.tsx:437-443,223` | Today kid capture card, one tap | **None** |
| `hours` | reading session on book completion; page-editing minutes; `CreativeTimer` | `BookReaderPage.tsx:73`, `useBook.ts:107,117`, `useCreativeTimer.ts:138` | My Books | **None** |
| `hours` | game-play minutes split by challenge bucket | `workshopUtils.ts:50-70,100-147,216-339,462-598` | Workshop, on game end | **None** |
| `hours` | quest session minutes (`source:'knowledge-mine'`) | `useQuestSession.ts:1012,1924,2150` | Mine | `canAccessKnowledgeMine` (route + tile) — **defeated by UX-150** |
| `hours` | Dad Lab completion | `useDadLabReports.ts:70` | parent `LabReportForm` only; `KidLabView` never completes a lab | Surface-level (not a `canEdit` check; *unverified* that no kid path reaches `saveReport`) |
| **`xpLedger`** (+ diamonds) | `CHECKLIST_ITEM/PRAYER`, `CHECKLIST_DAY_COMPLETE`, `DAILY_ALL_COMPLETE`, `MANUAL_AWARD` (extra, conundrum, workshop), `BOOK_READ`, `ARMOR_DAILY_COMPLETE`, `DAD_LAB_COMPLETE`, quest awards | `KidChecklist.tsx:136`, `KidTodayView.tsx:347,367`, `KidExtraLogger.tsx:68`, `KidConundrumResponse.tsx:134,178`, `WorkshopPage.tsx:720,784,860`, `BookReaderPage.tsx:314`, `useBook.ts:301`, `MyAvatarPage.tsx:801,987`, `useQuestSession.ts:836,1039,1938`, `KidTeachBack.tsx:103` | Every kid surface | **None** beyond `dedupKey` idempotence (the economy is *designed* to be kid-driven) |
| **`skillSnapshots`** | `conceptualBlocks` merge from a detected scan blocker (+ a `scans` doc) | `useUnifiedCapture.ts:365-376` via `KidChecklist.tsx:282-290` `Show your work!` | Today, one photo | **None** — **UX-151 (P1)**: a kid tap writes a propose-and-confirm invariant collection |
| `skillSnapshots` | `workingLevels.{subject}` derived from a curriculum scan's lesson number | `useUnifiedCapture.ts:326` `syncScanToConfig` → `useScanToActivityConfig.ts:130` `updateWorkingLevelFromScan` → `:277` | Today, the same photo (page type `worksheet`/`textbook`/`test`) | **None** — part of UX-151 |
| **`activityConfigs`** | create a workbook config, or advance `currentPosition` / `defaultMinutes` | `useScanToActivityConfig.ts:128,193` via `useUnifiedCapture.ts:326` | Today, the same photo | **None** — a kid photo can create or advance a curriculum config (part of UX-151) |
| `learnerModels` | workbook position folded into the model when a bridge matches (advance-only) | `useScanToActivityConfig.ts:138` `syncWorkbookPositionToModel` → `workbookPositionSync.ts:127` | Today, the same photo | **None** — part of UX-151 |
| `childSkillMaps` | scan `skillsTargeted` → node status `mastered`/`emerging` | `useUnifiedCapture.ts:353` `updateSkillMapFromFindings` → `updateSkillMapFromFindings.ts:94` | Today, the same photo | **None** — part of UX-151 |
| `skillSnapshots` | quest working-level / priority-skill updates | `useQuestSession.ts:1148,1168` | Mine | `canAccessKnowledgeMine` — defeated by UX-150 |
| `skillSnapshots` | full-document defaults apply / edits | `SkillSnapshotPage.tsx:96,115`, `WorkingLevelsSection.tsx:140,167` | `/progress` — parent nav only, **not route-guarded**; URL only for a kid | None at the route (`RequireParent` wraps only `/weekly-review` and `/watch`) |
| **`learnerModels`** | quest model sync | `questModelSync.ts:67` | Mine | `canAccessKnowledgeMine` — defeated by UX-150 |
| `learnerModels` | stuck re-test queue; Foundations override | `stuckRetestQueue.ts:132` (parent `TodayChecklist` only — the kid mastery chip writes `days` only), `writeReviewAction.ts` | parent Today / `/progress` | Surface-level / `canEdit` prop (`FoundationsTab`) — URL-reachable |
| **`sightWordProgress`** | `seen` + tap interactions | `BookReaderPage.tsx:233,337` → `useSightWordProgress.ts:132,165` | Book Reader | **None** |
| `sightWordProgress` | `confirmMastery`; add/remove (portal) | `SightWordDashboard.tsx:70,76`; `useShellyChatActions` | `/books/sight-words` (`isParent`-gated button, `BookshelfPage.tsx:348-363`; route ungated); `/chat` (URL only) | Surface-level only |
| **`evaluations` / `evaluationSessions`** | quest session docs | `useQuestSession.ts:987,1913,2137`, `KnowledgeMinePage.tsx:294` | Mine | `canAccessKnowledgeMine` — defeated by UX-150 |
| `evaluations` | guided eval apply (+ XP `:651`) | `EvaluateChatPage.tsx` | `/evaluate` — no kid link, **not route-guarded** | None at the route |
| `artifacts` | photos/audio/notes | `KidCaptureForm.tsx:59`, `UnifiedCaptureCard.tsx:283-379`, `KidLabView.tsx:142,187` (**`childId` = name**, B14), `KidChapterPool.tsx:113`, `KidConundrumResponse.tsx:117,160`, `MyAvatarPage.tsx:1265`, `workshopUtils.ts:167,368,517,632`, `useWatchItemCompletion.ts:83` | everywhere | None (by design) |
| `books`, `stickerLibrary`, `storyGames`, `kitRosters`, `businessLog`/`businessGoals`, `avatarProfiles`, `dailyArmorSessions`, `stonebridgeProgress`, `artQuota`, `chapterResponses`, `bookProgress`, `dadLabReports` (field + artifact refs, `KidLabView.tsx:109,151,196`), `transcriptionEvents`, `errorLog` | the kid's own product / progress / telemetry | see writer list in the run | nav-reachable | None (by design); `books` **delete** (`BookshelfPage.tsx:203`) has one confirm and no gate |
| `children` (soft fields, identity), `weeks`, `activityConfigs` (the **planner/Settings** editors — the scan path above is kid-reachable), `helpCards`, `lessonCards`, `settings/plannerDefaults` | parent-only writers | `useShellyChatActions`, `applyWeekPlan`, planner/Today parent paths | `/chat`, `/planner/chat`, `/settings` — none linked from a kid page; **none route-guarded** | `canEdit` in the writer (`applyWeekPlan`, `SoftProfileSection` is `isParent`-rendered) |

**Paid calls a single kid tap can spend, and what caps them:** Stickers ×4 and Book Editor ×4 and Kit
Builder — **capped** (weekly `artQuota`, `isChildProfile`/`!canEdit`); **uncapped:** Workshop image ×5 +
LLM ×3, the avatar photo `extractFeatures`, the Today photo scan (one LLM call per capture), Generate-a-Book
+ review chat (`generateStory`/`reviseStory`/`revisePage`), the guided-story LLM (`StoryGuidePage`), the
comprehension-questions LLM on book open, Whisper transcription on every `AudioRecorder` capture, and the
Shelly image generator (URL-only). The art cap covers three of the ~nine paid doors he can reach.

#### Ranked top-10

1. **P1 · UX-150 — the Knowledge Mine hold opens on a parent's one-tap "apply London defaults".**
   `londonDefaults.ts:19-63` writes five `prioritySkills` (`reading.letterSound`, `reading.phonemicAwareness`,
   `math.placeValue`, …); `hasReadingCalibration` (`knowledgeMineAccess.ts:58-67`) is true on any non-math
   priority skill and `hasMathCalibration` (`:73-80`) on any `math.` one — so the *starting frame* reads as
   *calibration* and the tile, the route and the Today row all open, reading **and** math quests, with the
   register's "6-year-old reading-level path" still unbuilt. The register said "opens automatically once
   London is evaluated/tuned"; defaults are neither. *Direction (a decision, not a fix):* either the gate
   ignores `masteryGate: NotYet` / `level: Emerging` skills, or the defaults stop writing `prioritySkills`
   into the same field an evaluation writes, or the hold becomes an explicit profile flag.
2. **P1 · UX-151 — `Show your work!` writes `skillSnapshots.conceptualBlocks` from a kid session and spends
   an uncapped LLM scan per photo.** `useUnifiedCapture.ts:365-376` (guarded only by `try/catch`), reached
   from `KidChecklist.tsx:282-290` — and the same photo, when recognised as a worksheet, also creates or
   advances an `activityConfigs` doc, derives `skillSnapshots.workingLevels`, syncs `learnerModels` and
   `childSkillMaps` (`:326,353` → `useScanToActivityConfig.ts:128,138,193,277`). `skillSnapshots` is a
   propose-and-confirm invariant; nothing proposed, nothing confirmed, a six-year-old's photo of a worksheet
   can stamp a `conceptualBlock` and a working level on his record and move his curriculum position.
3. **P1 · UX-152 — four behavioural name-gates on London's own screens** (B2 mastery chips, B3 conundrum
   flow, B4 `childAge`, B5 story-guide questions) plus ARCH-42's B1. The rail this audit re-verifies is
   "capability, never name"; these are the sites where the name decides *what he can do*, not how it looks.
4. **P2 · B14 — kid Dad-Lab artifacts written with `childId: 'london'`** (`KidLabView.tsx:131,176`).
   Mis-keyed evidence; fix with B1 in the same PR. *Unverified against live data.*
5. **P2 — `⛏️ Start Mining` on Kid Today ignores the Mine gate** (`KidTodayView.tsx:798-827`) — a big
   button that bounces. Hide the row on `!canAccessKnowledgeMine`, exactly as the Hero Hub tile does.
6. **P2 — Workshop is uncapped and kid-reachable** (UX-100 residual; `workshopArt.ts` ×4,
   `WorkshopPage.tsx:521`, LLM ×3). The wiring shape exists (FEAT-165/168); this is the next surface.
7. **P2 — the avatar photo panel spends `extractFeatures` with no cap and no confirm**
   (`AvatarPhotoUpload.tsx:72-75`) on the surface built *for* London.
8. **P2 — Settings is one tap from the profile pill** (UX-76, still open) and shows AI-feature switches to a
   kid (`SettingsPage.tsx:160-200`).
9. **P2 — `My Stuff` is the parent Portfolio** (`AppShell.tsx:47` → `PortfolioPage.tsx:289-360`): filters,
   selects and an export on a screen a 6-year-old cannot read. Either a kid gallery or drop the nav item.
10. **P2/P3 — the gate-and-lock copy is above his level everywhere it matters** (`Complete your must-do
    items to unlock choices!`, `🔒 Complete {n} more quests`, `Complete {n} more quests to unlock!`, `🔒 Finish
    quests first`, `{n} quests to go!`) plus the Minecraft-framed extra logger, `reading actions`, the Watch
    caption and the armor-gate verse (UX-73). One wording pass in the FEAT-154 style.

#### Suggested batching (2–3 fix runs)

- **Run A — the standing rail, re-keyed (behavioural name-gates first).** B1 + B14 (`KidLabView`: key the two
  branches on `ageGroup`, write `childId: child.id`), B2 (`isChildProfile`), B3 (`ageGroup`), B4
  (`computeAge`), B5 (`ageGroup`), B13 (`findYoungerSibling`) — six files, each a one- or two-line key swap
  with the existing helper, no new gate, no behaviour change for Lincoln (his `ageGroup` is `'older'`, his
  `themeStyle` is `'minecraft'`). Add a test per site that renders a third, differently-named child. Closes
  ARCH-42, most of ARCH-43's *behavioural* residue; ARCH-41's cosmetic sites can follow or stay.
- **Run B — the holes in the hold and the unsupervised spend (decisions first, then wiring).** UX-150
  (owner decision on which of the three directions), UX-151 (owner decision: does a kid capture seed
  `conceptualBlocks` at all? — if not, gate the merge on `!isChildProfile`, which is a UI gate and exactly
  the ARCH-10 shape), the Today `Start Mining` row gate (#5), then the two uncapped paid doors (#6 Workshop,
  #7 avatar photo) on the established `useArtQuota` shape. Rules untouched; the write table above is the
  ARCH-10 input.
- **Run C — copy and shape.** The lock/gate wording pass (#10), the `My Stuff` decision (#9), UX-76's
  Settings gate (#8), the Minecraft-neutral extra logger, Banner Rally and Watch captions, Dad Lab's raw
  `labType` chip. Text only, FEAT-154 rules (no new props, handlers, reads or writes).

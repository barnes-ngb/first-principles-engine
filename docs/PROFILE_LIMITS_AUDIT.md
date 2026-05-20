# Profile-Based Limits & Experience Audit

**Date:** 2026-04-04
**Status:** Read-only inspection — no code changes

---

## Part 1: Rate Limits & Usage Tracking

### A. Chat/AI Message Limits

```
AREA: Chat/AI Message Limits
STATUS: ⚠️ PARTIAL
EVIDENCE: functions/src/ai/authGuard.ts:80-112, functions/src/ai/chat.ts:1236
CURRENT BEHAVIOR: Server-side rate limit of 100 calls per task type per 60 minutes (per uid).
  No per-session, per-day, or per-child limits. No client-side rate limiting (no debounce,
  cooldown, or max calls in useAI.ts). All task types share the same 100/60min limit regardless
  of cost (Sonnet plan vs Haiku chat). Rate limit check is non-blocking on infrastructure
  errors (authGuard.ts:106-110 — logs warning but allows request through if query fails).
RECOMMENDED: Differentiate limits by task type cost. Add daily caps. Add client-side debounce.
  Consider per-child limits for kid profiles.
```

**Rate limit implementation** (`functions/src/ai/authGuard.ts:80-112`):
```typescript
export async function checkRateLimit(
  uid: string,
  action: string,
  maxCalls: number = 50,
  windowMinutes: number = 60,
): Promise<void>
```
- Queries `families/${uid}/aiUsage` for entries matching `taskType` in the time window
- Throws `HttpsError("resource-exhausted")` if count >= maxCalls
- **Non-blocking on errors**: if the composite index is missing or query fails, the rate limit is silently skipped

**Call sites:**
| Location | Limit | Scope |
|---|---|---|
| `functions/src/ai/chat.ts:1236` | 100 calls / 60 min per task type | All chat tasks |
| `functions/src/ai/imageTasks/generateImage.ts:127` | 20 calls / 60 min | Image generation only |

**Not differentiated by:**
- Parent vs kid profile (server has no concept of profiles)
- Task cost (Sonnet plan = same limit as Haiku chat)
- Time of day or daily totals

### B. Image Generation Limits

```
AREA: Image Generation Limits
STATUS: ⚠️ PARTIAL — only generateImage has rate limiting
EVIDENCE: functions/src/ai/imageTasks/generateImage.ts:127
CURRENT BEHAVIOR: Only the main generateImage() function has rate limiting (20/60min).
  All 11 other image tasks (armor, avatar, minecraft, sketch, etc.) have NO rate limits.
  All image tasks require approved user (email allowlist) but no call-count limits.
  No daily cap, no monthly budget, no per-child limits.
RECOMMENDED: Add rate limits to ALL image generation functions. Add daily caps.
  Consider separate kid limits (lower).
```

**Image task rate limit coverage:**

| Task | Auth | Rate Limit | Model | Cost/call |
|---|---|---|---|---|
| `generateImage` | requireApprovedUser | **20/60min** | dall-e-3 or gpt-image-1 | $0.04 or $0.02 |
| `armorPiece` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `armorReference` | requireApprovedUser | **NONE** | dall-e-3 | $0.04 |
| `armorSheet` | requireApprovedUser | **NONE** | dall-e-3 | $0.04 |
| `avatarPiece` | requireApprovedUser | **NONE** | dall-e-3 | $0.04 |
| `baseCharacter` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `enhanceSketch` | requireApprovedUser | **NONE** | dall-e-3 | $0.04 |
| `extractFeatures` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `minecraftFace` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `minecraftSkin` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `photoTransform` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |
| `starterAvatar` | requireApprovedUser | **NONE** | gpt-image-1 | $0.02 |

### C. Sticker Generation Limits

```
AREA: Sticker Generation
STATUS: ❌ NO LIMITS (beyond the shared 20/60min rate limit)
EVIDENCE: src/features/books/StickerPicker.tsx (generates via generateImage)
CURRENT BEHAVIOR: No per-session or daily cap. "Try Again" immediately re-generates
  (deletes old image, calls generateImage again). Each attempt counts toward the
  shared 20/60min image rate limit. No cooldown between attempts.
RECOMMENDED: Add client-side cooldown. Consider daily sticker cap for kids (e.g., 10/day).
```

### D. Book/Scene Generation Limits

```
AREA: Book Generation
STATUS: ❌ NO PER-BOOK LIMITS
EVIDENCE: src/features/books/useBookGenerator.ts:259-319
CURRENT BEHAVIOR: Book generation loops through all pages, generating one illustration
  per page via generateImage(). A 20-page book = 20 API calls = $0.80 (DALL-E 3).
  The only limit is the shared 20/60min rate limit. No per-book illustration cap.
  Failed pages can be retried later in the editor.
RECOMMENDED: Cap book generation at reasonable page count. Consider cheaper model
  for kid-generated books. Add confirmation dialog showing estimated cost.
```

---

## Part 2: Profile & Role Detection

### A. How Parent vs Kid Is Determined

```
AREA: Profile/Role Detection
STATUS: ✅ PROPERLY GATED (client-side only)
EVIDENCE: src/core/profile/ProfileProvider.tsx:9-15, src/core/profile/context.ts:4-16
CURRENT BEHAVIOR: Pure client-side localStorage-based profile selection. Three profiles:
  UserProfile.Lincoln ('lincoln'), UserProfile.London ('london'), UserProfile.Parents ('parents').
  No Firebase Auth custom claims. No server-side role enforcement. canEdit = (profile === Parents).
  Profile selected from ProfileSelectPage, stored in localStorage('fpe_user_profile').
RECOMMENDED: Consider server-side role awareness for AI cost controls.
```

**Key hooks:**
| Hook/Function | Location | Purpose |
|---|---|---|
| `useProfile()` | `src/core/profile/useProfile.ts` | Returns `{ profile, themeMode, canEdit, selectProfile, setThemeMode, logout }` |
| `useActiveChild()` | `src/core/hooks/useActiveChild.ts` | Returns `{ activeChildId, activeChild, children, setActiveChildId, isChildProfile }` |
| `isChildProfile` | Derived | `profile === Lincoln \|\| profile === London` |
| `canEdit` | Derived | `profile === Parents` |

**Profile selection mechanism:**
- `ProfileProvider.tsx:29-40`: `selectProfile()` stores to localStorage, auto-sets theme (Lincoln → dark/Minecraft, London → pink/storybook, Parents → family)
- **No PIN or password** protects profile switching — anyone can switch to parent mode

### B. Child Identification

```
AREA: Child Identification
STATUS: ✅ PROPERLY GATED
EVIDENCE: src/core/types/family.ts:14-24, src/core/hooks/useChildren.ts:13-28
CURRENT BEHAVIOR: Children stored at families/{familyId}/children. Matched to profiles
  by name (case-insensitive). Auto-created if missing. Fields: id, name, birthdate?,
  grade?, settings?, dayBlocks?, routineItems?. No isNeurodivergent or learningProfile
  field — this is handled via AI prompt context, not stored on the child document.
RECOMMENDED: No changes needed for identification. Consider adding learningProfile
  field for more nuanced AI personalization.
```

**Child type** (`src/core/types/family.ts:14-24`):
```typescript
export interface Child {
  id: string
  name: string
  birthdate?: string
  grade?: string
  settings?: FamilySettings
  dayBlocks?: DayBlockType[]
  routineItems?: RoutineItemKey[]
}
```

---

## Part 3: Experience Differentiation — Current State

### A. Parent vs Kid Navigation

```
AREA: Navigation & Route Access
STATUS: ✅ PROPERLY GATED
EVIDENCE: src/app/AppShell.tsx:19-39, src/app/router.tsx:27-69, src/components/RequireParent.tsx
CURRENT BEHAVIOR: Parent nav shows 9 items, kid nav shows 7 items.
  Only /weekly-review has a server-side RequireParent route guard.
  Other parent-only pages are hidden from kid nav but NOT route-protected —
  a kid could navigate directly to /settings, /planner/chat, /records, etc. via URL.
RECOMMENDED: Add RequireParent route guards to all parent-only pages.
```

**Parent-only pages (hidden from kid nav):**
- `/planner/chat` — Plan My Week
- `/weekly-review` — Weekly Review (**only one with RequireParent guard**)
- `/progress` — Progress dashboard
- `/records` — Records
- `/settings` — Settings
- `/chat` — Shelly AI Chat (Ask AI)

**Kid-only pages (hidden from parent nav):**
- `/quest` — Knowledge Mine
- `/avatar` — My Armor
- `/books` — My Books
- `/records/portfolio` — My Stuff

**Shared pages (both navs):**
- `/today` — Today (renders different components based on profile)
- `/workshop` — Game Workshop
- `/dad-lab` — Dad Lab

**Not route-protected (accessible via URL by any profile):**
- `/planner/chat`, `/evaluate`, `/progress`, `/records`, `/settings`, `/chat`, `/books`, `/quest`, `/avatar`

### B. Parent vs Kid on Today Page

```
AREA: Today Page Differentiation
STATUS: ✅ PROPERLY GATED
EVIDENCE: src/features/today/TodayPage.tsx:146-147, 463-476
CURRENT BEHAVIOR: Kid profiles get KidTodayView (Minecraft-styled for Lincoln, storybook
  for London) with XP bar, diamond counter, armor gate, checklist, quest tracking.
  Parent gets full TodayPage with child selector, day log editing, all capture tools,
  plan type controls, teach-back management.
RECOMMENDED: Working as designed.
```

### C. Parent vs Kid on Books

```
AREA: Books Feature
STATUS: ⚠️ PARTIAL — no profile-based access control
EVIDENCE: src/features/books/BookshelfPage.tsx, src/app/router.tsx:51-56
CURRENT BEHAVIOR: Bookshelf page is accessible to ALL profiles (no RequireParent guard).
  Both parent and kid can generate books, create stickers, use Story Guide.
  Books are per-child (filtered by activeChildId). Parent can switch children to see
  their books. No different generation limits by profile.
RECOMMENDED: Consider limiting kid generation frequency. Parent should have higher
  or unlimited generation for curriculum material creation.
```

### D. Parent vs Kid on AI Chat

```
AREA: AI Chat Access
STATUS: ⚠️ PARTIAL — features accessible via URL regardless of profile
EVIDENCE: src/app/router.tsx:48-50, 57-59, 65-66
CURRENT BEHAVIOR:
  - Plan My Week (/planner/chat): Hidden from kid nav, but NOT route-protected
  - Evaluation (/evaluate): Not in any nav, accessible by URL to all
  - Knowledge Mine (/quest): In kid nav only, accessible by all via URL
  - Workshop (/workshop): In both navs, accessible by all
  - Story Guide (/books/story-guide): Under books, accessible by all
  - Shelly Chat (/chat): Hidden from kid nav, but NOT route-protected
RECOMMENDED: Add route guards. Parent should have unrestricted AI chat.
  Kids should have session-based limits on Knowledge Mine and Workshop.
```

### E. Lincoln vs London Experience Differences

```
AREA: Lincoln vs London Differentiation
STATUS: ✅ PROPERLY GATED — extensive theming/UX differences
EVIDENCE: ~80+ isLincoln checks across src/features/
CURRENT BEHAVIOR: Extensive UI/UX differentiation by child:
  Lincoln: Minecraft theme, "Press Start 2P" font, dark backgrounds, green/cyan accents,
    10-page books, minecraft art style, audio teach-back, XP diamond bar, "Mine More" button
  London: Storybook theme, pink/warm backgrounds, standard fonts, 6-page books,
    storybook art style, drawing-oriented activities
  AI prompts adapt per child (via CLAUDE.md context: age, reading level, motivators).
  No code-level feature gating between children (both can access same features).
RECOMMENDED: Consider age-appropriate AI complexity settings. London (6) might benefit
  from simpler Knowledge Mine questions. Lincoln's speech/neurodivergence accommodations
  are handled via AI prompt context, not hard-coded limits.
```

**Key Lincoln vs London code differences:**

| Area | Lincoln | London |
|---|---|---|
| Theme | Dark/Minecraft (`grey.900`, `#5BFCEE`) | Light/Storybook (`#fff8f0`, `#f06292`) |
| Font | `"Press Start 2P", monospace` | System default |
| Book pages | 10 pages default | 6 pages default |
| Art style | `minecraft` | `storybook` |
| Greetings | Minecraft-themed (`getGreeting()`) | Warm/encouraging |
| Celebrations | Minecraft achievements | Storybook celebrations |
| XP bar | Shown (MinecraftXpBar) | Not shown |
| Chapter response | Lincoln only | Not shown |
| Teach-back | Audio-first (Lincoln's speech needs) | Not specialized |
| Conundrum response | Minecraft-styled input | Standard input |
| Story Guide questions | `LINCOLN_QUESTIONS` (adventure/build-focused) | `LONDON_QUESTIONS` (story/character-focused) |
| Book defaults | `CHILD_BOOK_DEFAULTS.lincoln` | `CHILD_BOOK_DEFAULTS.london` |

---

## Part 4: AI Cost Awareness

### A. Token/Cost Tracking

```
AREA: AI Usage Dashboard
STATUS: ⚠️ PARTIAL
EVIDENCE: src/features/settings/AIUsagePanel.tsx
CURRENT BEHAVIOR: Dashboard shows current month's total API calls, total tokens,
  and estimated cost. Breaks down by model and by task type (call counts only).
  Accessible to ALL profiles (no parent-only guard). No per-child breakdown.
  No daily/weekly trends. No budget alerts. No cost forecasting.
RECOMMENDED: Make parent-only. Add per-child breakdown. Add daily cost alerts.
  Add monthly budget cap with warnings.
```

**Usage entry schema** (`src/core/types/common.ts:125-133`):
```typescript
export interface AIUsageEntry {
  id?: string
  childId: string
  taskType: string
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: string
}
```

**Dashboard cost rates** (`AIUsagePanel.tsx:42-59`):
| Model | Input (per 1M tokens) | Output (per 1M tokens) | Per call |
|---|---|---|---|
| Claude Sonnet 4.6 | $3 | $15 | — |
| Claude Haiku 4.5 | $0.80 | $4 | — |
| DALL-E 3 | — | — | $0.04 |
| GPT Image 1 | — | — | $0.02 |

### B. Cost per Feature

```
AREA: Cost Awareness
STATUS: ⚠️ PARTIAL — tracking exists but no enforcement
EVIDENCE: functions/src/ai/chat.ts:55-76, src/features/settings/AIUsagePanel.tsx:42-59
CURRENT BEHAVIOR: Model selection by task determines cost. Usage is logged to
  aiUsage collection with model + tokens. Dashboard estimates monthly cost.
  But NO budget enforcement — no monthly cap, no per-feature limits, no alerts.
RECOMMENDED: Add monthly budget cap (e.g., $50/month). Alert at 80% threshold.
  Consider cheaper models for kid-initiated features.
```

**Expensive features (Claude Sonnet @ ~$3/$15 per 1M input/output):**
- plan, evaluate, quest, generateStory, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, analyzePatterns

**Cheap features (Claude Haiku @ ~$0.80/$4 per 1M input/output):**
- generate, chat

**Image features (per-call pricing):**
- DALL-E 3 @ $0.04/call: book illustrations, avatar pieces, armor references, armor sheets, sketch enhancement
- GPT Image 1 @ $0.02/call: stickers, armor pieces, base characters, minecraft skins/faces, photo transforms, starter avatars, feature extraction

**Costly scenarios (no protection):**
- 20-page book with illustrations = 20 × $0.04 = $0.80
- Full armor set generation = multiple pieces × $0.02-$0.04 each
- Extended Knowledge Mine session = many Sonnet calls

---

## Part 5: Gap Analysis & Recommendations

### 1. Parent Image Generation
```
CURRENT: Same 20/60min limit as kids. No profile awareness server-side.
GAP: Parent (Shelly) needs higher limits for curriculum material creation, testing book generation, creating worksheets.
RECOMMENDED: Parent profile should have 50/60min or no limit. Server needs profile awareness.
```

### 2. Kid Image Generation
```
CURRENT: No daily cap. Shared 20/60min rate limit. Unlimited sticker retries.
GAP: Kids can burn through ~$0.80/hour on stickers alone. No protection against tap-happy generation.
RECOMMENDED: Daily cap per child (e.g., 15 images/day). Client-side cooldown (5s between generations). Confirmation after 5th generation in a session.
```

### 3. Parent Chat
```
CURRENT: 100 calls/60min per task type. Shared limit with kids.
GAP: Adequate for normal use but not differentiated.
RECOMMENDED: Increase parent limit or remove it. Planning and evaluation sessions can be long.
```

### 4. Kid Chat
```
CURRENT: Same 100/60min limit. No session-based limits.
GAP: Knowledge Mine, Workshop, and Story Guide have no per-session guardrails.
RECOMMENDED: Per-session limits (e.g., 20 exchanges per Knowledge Mine session, 15 per Workshop session). Daily AI chat cap for kids (e.g., 50 total AI calls/day).
```

### 5. Age Differences
```
CURRENT: No AI complexity differences between Lincoln (10) and London (6). Same features available.
GAP: London may not benefit from Knowledge Mine's complexity. Lincoln's speech accommodation is prompt-level only.
RECOMMENDED: Consider simpler question sets for London. Shorter sessions. Fewer answer options. AI prompts already handle this via child context, but UI could adapt too.
```

### 6. Cost Protection
```
CURRENT: No monthly budget cap. No runaway loop protection. Rate limit fails open (non-blocking on errors).
GAP: A determined kid tapping "generate" repeatedly could spend $5-10/hour on images. Rate limit silently bypassed if Firestore index is missing.
RECOMMENDED: Monthly budget cap ($50). Make rate limit fail CLOSED (block on errors). Add client-side generation counter with daily reset. Add "you've used X of Y generations today" indicator for kids.
```

---

## Summary Table

| Area | Parent Limit | Kid Limit | Current | Recommended |
|---|---|---|---|---|
| Chat messages (per hour) | 100/task type | 100/task type | Same for all | Parent: 200+ or unlimited; Kids: 50/task type |
| Chat messages (per day) | None | None | No daily limit | Parent: unlimited; Kids: 100 total/day |
| Image generation (per hour) | 20 total | 20 total | Same for all | Parent: 50/hr; Kids: 15/hr |
| Image generation (per day) | None | None | No daily limit | Parent: 100/day; Kids: 15/day |
| Sticker generation | No separate limit | No separate limit | Counted in image limit | Kids: 10 stickers/day |
| Book generation (per book) | No limit | No limit | All pages generate | Max 12 pages with illustrations |
| Armor/avatar image tasks | No rate limit | No rate limit | Only auth check | Add 10/hr rate limit |
| AI usage dashboard access | All profiles | All profiles | No access control | Parent-only |
| Monthly budget cap | None | None | No enforcement | $50/month with alert at $40 |
| Route protection | N/A | Nav-hidden only | Only /weekly-review guarded | Add RequireParent to all parent pages |
| Profile switching security | No PIN | No PIN | Anyone can switch | Consider PIN for parent profile |
| Rate limit failure mode | Fail open | Fail open | Silently allows on error | Fail closed (block on error) |

---

## Critical Findings

1. **Rate limit fails open** (`authGuard.ts:106-110`): If the Firestore composite index is missing or any query error occurs, the rate limit check is silently bypassed. This should fail closed.

2. **11 of 12 image tasks have NO rate limiting**: Only `generateImage` has `checkRateLimit()`. Armor, avatar, minecraft, sketch, and photo tasks have zero call-count protection — only email allowlist auth.

3. **No server-side profile awareness**: The server sees only `uid` (Firebase Auth UID). It has no concept of parent vs kid. All rate limits are per-family, not per-profile. Profile-based limits would require passing profile info to Cloud Functions.

4. **Most parent-only pages lack route guards**: Only `/weekly-review` uses `RequireParent`. A kid could navigate to `/settings`, `/planner/chat`, `/chat`, `/records`, `/progress` directly via URL.

5. **No monthly budget cap or alerts**: Usage is tracked and displayed but never enforced. No protection against unexpected cost spikes.

6. **No client-side rate limiting**: `useAI.ts` has no debounce, cooldown, or generation counter. All protection is server-side only.

# Knowledge Mine Crash Investigation — 2026-04-07

> **Status: RESOLVED** — All fixes landed 2026-04-07.

> Lincoln test session on production tablet. Three symptoms observed after 3 correct comprehension answers triggered a level-up from 6 → 7.

---

## 1. Summary

These three symptoms share a unified root cause chain, not a single bug. The chain is:

1. **The comprehension prompt defines difficulty only for Levels 1-6** (`chat.ts:809-812`). When the adaptive engine promotes Lincoln to Level 7 after 3 correct answers, the AI generates a question with no content guidance. This produces a question more likely to fail validation.
2. **If all AI retries fail, the fallback question generator degrades to Level 6 words** — but it works; it doesn't crash. The fallback generates a valid phonics question. However, if the AI call itself *throws* (network timeout, Cloud Function error) rather than returning null, the `submitAnswer` callback has **no try/catch** around the AI call block (`useQuestSession.ts:1083-1160`). The thrown error becomes an unhandled promise rejection.
3. **The app-level `ErrorBoundary` catches unhandled rejections** (`ErrorBoundary.tsx:42-50`) and renders a full-page error screen, replacing the quest UI — this is the "ejection" (Symptom 1).
4. **When the user navigates back to `/quest`, the `AppShell` sidebar's `AvatarThumbnail` creates a new `THREE.WebGLRenderer`** (`AvatarThumbnail.tsx:67`). On a resource-constrained tablet after a crash recovery, the WebGL context may be lost or exhausted. Three.js's `WebGLCapabilities` constructor calls `gl.getShaderPrecisionFormat()` which returns `null` on a lost context, and accessing `.precision` on `null` throws `TypeError: Cannot read properties of null (reading 'precision')` — this is the "precision" crash (Symptom 2).
5. **The precision crash is caught by React Router's default error boundary** (the `/quest` route has no `errorElement`), showing "Unexpected Application Error!" and preventing the `KnowledgeMinePage` from mounting — so the resume-session `useEffect` never fires (Symptom 3).

Nathan's hypothesis is correct: "too-tight a filter" (AI validation failure) is the trigger. But the crash cascade involves three independent gaps: missing try/catch, WebGL context exhaustion, and missing error boundaries.

---

## 2. The 'precision' Culprit

### Where it lives

`precision` is accessed inside Three.js v0.128.0 at `three.module.js:14468-14482`:

```js
// Inside WebGLCapabilities constructor
if ( gl.getShaderPrecisionFormat( 35633, 36338 ).precision > 0 &&
     gl.getShaderPrecisionFormat( 35632, 36338 ).precision > 0 ) {
```

`gl.getShaderPrecisionFormat()` returns `null` when:
- The WebGL context has been lost (`CONTEXT_LOST_WEBGL` event)
- The browser/GPU has hit its maximum number of active WebGL contexts (typically 8-16 on mobile)
- The GPU process has crashed and the context hasn't been restored

### How it's reached from Knowledge Mine

The crash does NOT happen inside quest code. It happens in `AvatarThumbnail.tsx:67`:

```tsx
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: size > 64 })
```

`AvatarThumbnail` is rendered by `AppShell.tsx:77` in the navigation sidebar — it's present on **every page**, including `/quest`. When the component remounts after navigation, its `useEffect` (line 56) creates a new `WebGLRenderer`, which internally constructs `WebGLCapabilities`, which calls `getShaderPrecisionFormat()`.

### Why it's null

On the production tablet, after the first crash (Symptom 1), the app is in a degraded state. The previous `WebGLRenderer` from the pre-crash `AvatarThumbnail` may not have been properly disposed (its cleanup runs in `useEffect` return, but error boundaries don't guarantee cleanup order). The tablet's GPU may have leaked the context. When `AvatarThumbnail` tries to create a new renderer on remount, the fresh WebGL context is either lost or the `getShaderPrecisionFormat` call fails.

### The minified stack trace decoded

```
s, new ske, Ne, new ws, Fw, P8, hh, P8, hh
```

- `ske` → `WebGLCapabilities` constructor (calls `getShaderPrecisionFormat`)
- `ws` → `WebGLRenderer` constructor (creates capabilities)
- `Ne` → Three.js internal
- `Fw, P8, hh` → React reconciler / component render chain (AvatarThumbnail → AppShell → Outlet)

---

## 3. The Validation Failure Path

Step-by-step trace from "AI returns malformed question" to "Lincoln sees error screen":

### Happy path (what should happen)

1. Lincoln answers question 3 correctly at Level 6
2. `computeNextState()` promotes to Level 7 (`questAdaptive.ts:31-35`)
3. `shouldEndSession()` returns false (only 3 questions, `MIN_QUESTIONS` is 5)
4. Screen → `QuestScreen.Loading` (`useQuestSession.ts:1051`)
5. AI called with `currentLevel: 7` for comprehension domain (`useQuestSession.ts:1083`)
6. AI returns a question → `parseQuestBlock` → `validateQuestion`
7. If validation fails → retry loop (2 attempts) (`useQuestSession.ts:1110-1150`)
8. If retries fail → `generateFallbackQuestion(7, 'reading')` → returns valid Level 6 word question
9. `setCurrentQuestion(question)` → screen → `QuestScreen.Question`

### Failure path (what likely happened)

1-5. Same as above.
6. AI call **throws** (Cloud Function timeout, network error, or 500)
   - The `chat()` function from `useAI` does not guarantee catching all errors
   - `submitAnswer` has **no try/catch** around lines 1083-1160
7. The thrown error becomes an unhandled promise rejection
8. `ErrorBoundary.handleUnhandledRejection` (`ErrorBoundary.tsx:42`) catches it
9. `ErrorBoundary` sets `hasError: true` → renders "Something went wrong" screen
10. The quest UI is completely replaced — Lincoln sees an error screen (interpreted as "returned to Today page")
11. State is now: `screen: 'loading'`, `currentQuestion: (previous question)`, `questState: (level 7 state)`

### Alternative failure path (AI returns null)

If `chat()` returns `null` (line 1091) instead of throwing:
- `endSession()` is called with the current questions and state
- Screen → `QuestScreen.Summary`
- This is a **graceful** end, not a crash
- Lincoln would see the summary screen, not be ejected
- This path is handled correctly

The key distinction: **returns null → graceful end; throws → unhandled crash**.

---

## 4. The Fallback Gap

### Current state: fallback works but is inappropriate

`questHelpers.ts:188-234` — `generateFallbackQuestion(level, domain)`:

```ts
// Reading fallback
const wordSets: Record<number, string[]> = {
  1: ['cat', 'dog', 'sun', ...],
  2: ['stop', 'frog', 'clap', ...],
  3: ['ship', 'chat', 'thin', ...],
  4: ['cake', 'bike', 'home', ...],
  5: ['train', 'sleep', 'float', ...],
  6: ['night', 'bright', 'could', ...],
}
const words = wordSets[Math.min(level, 6)] || wordSets[1]
```

At Level 7+, `Math.min(level, 6)` → uses Level 6 words. The fallback **always returns a valid question** — it never returns null or throws. The previous audit finding (Q5: "If the AI fails at Level 7+, the fallback generates a Level 6 question") is confirmed accurate.

### The real gap

The fallback is a **phonics word identification** question ("What word is this?" with stimulus), regardless of quest mode. For a comprehension quest, this is jarring — Lincoln goes from reading passages and making inferences to "What word is this? night / bright / could". But it's not a crash.

### Comprehension prompt Level 7+ gap

`chat.ts:809-812`:
```
DIFFICULTY LEVELS:
- Level 1-2: Short sentences, common vocabulary, explicit comprehension
- Level 3-4: Longer passages, less common vocabulary, simple inference
- Level 5-6: Multi-sentence passages, context clues for unknown words, deeper inference
```

No guidance for Level 7+. The AI extrapolates. The starting level is capped at 6 (`Math.min(startingLevel, 6)` at `chat.ts:768`), so you can't START above Level 6 — but you CAN reach Level 7+ by answering correctly. At Level 7+, the AI has full creative freedom, making validation failures more likely because:
- It may generate novel question formats not covered by the validation rules
- It may produce passages that are too complex for the JSON schema
- It has no guard rails on difficulty, vocabulary, or question type

---

## 5. The Error Boundary Gap

### Route configuration (`router.tsx:57`)

```tsx
{ path: '/quest', element: <KnowledgeMinePage /> }
```

**No `errorElement` prop.** No parent route has one either. The entire route tree (`router.tsx:27-70`) has zero `errorElement` definitions.

### What happens on error

1. **Render errors** (like the precision crash) bubble to React Router's built-in default error boundary, which shows "Unexpected Application Error!" with the raw error message. This is the ugliest possible UX.
2. **Unhandled promise rejections** (like the AI call throw) are caught by the app-level `ErrorBoundary` (`ErrorBoundary.tsx`), which shows "Something went wrong" with Retry/Reload buttons.

### What should be there

The `/quest` route should have an `errorElement` that:
1. Shows a Minecraft-themed error message ("The mine collapsed! 💥")
2. Offers a "Return to Mine Entrance" button (resets quest state and shows intro)
3. Logs the error for debugging
4. Optionally auto-saves the partial session before showing the error

---

## 6. The Resume Refresh Gap

### The query (`KnowledgeMinePage.tsx:140-165`)

```tsx
useEffect(() => {
  if (!activeChildId || !familyId) return
  async function loadResume() {
    const q = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', activeChildId),
      where('status', '==', 'in-progress'),
      orderBy('evaluatedAt', 'desc'),
      firestoreLimit(1),
    )
    const snap = await getDocs(q)     // ← one-time query, NOT onSnapshot
    // ...
    setResumeSession(sessions[0] ?? null)
  }
  void loadResume()
  return () => { cancelled = true }
}, [activeChildId, familyId, quest.screen])  // ← dependencies
```

### Why soft nav doesn't re-trigger

Dependencies are `[activeChildId, familyId, quest.screen]`.

On soft navigation away from `/quest` and back:
- `activeChildId` — same child, unchanged
- `familyId` — unchanged
- `quest.screen` — **this is the key**. After an error/crash, the quest hook state is either:
  - Preserved (if the component wasn't unmounted) → `screen` may still be `'loading'` or whatever it was during the crash → the useEffect won't re-fire because dependencies didn't change
  - Reset (if the component was unmounted and remounted) → `screen` resets to `'intro'` → BUT if it was `'intro'` before too (initial state), the dependency didn't "change" from React's perspective on initial mount

However, the real blocker in the crash scenario is different: **the precision error prevents `KnowledgeMinePage` from mounting at all**. React Router's error boundary catches the Three.js crash (which happens in `AppShell`'s `AvatarThumbnail`), and the entire route tree under the errored boundary is replaced by the error screen. The `useEffect` never gets a chance to run.

### Why full refresh fixes it

A full browser refresh:
1. Destroys all WebGL contexts → GPU resources freed
2. Fresh Three.js renderer creation succeeds (no exhausted contexts)
3. Component mounts cleanly → useEffect fires → Firestore query runs → resume card appears

### Additional race condition

Even without the precision crash, there's a potential timing issue:
- `resetToIntro()` saves the partial session via **fire-and-forget** `setDoc` (`useQuestSession.ts:1612-1616`)
- If the user navigates away before the Firestore write completes, and then navigates back, the resume query might not find the session yet
- This would be a narrow window (Firestore writes are fast) but could explain occasional missing resume cards

---

## 7. Proposed Fix List

| # | Fix | Symptoms Addressed | Effort | Dependencies |
|---|-----|--------------------|--------|-------------|
| **F1** | **Add try/catch in `submitAnswer` around the AI call block** (`useQuestSession.ts:1083-1160`). On catch: call `endSession(updatedQuestions, newState, false)` to end gracefully instead of crashing. Same for `handleSkip`. | S1, S2 (prevents the cascade) | S | None |
| **F2** | **Cap comprehension quest level at 6** in `computeNextState` or in the `submitAnswer` logic. If `questMode === 'comprehension'` and `currentLevel >= 6`, don't promote beyond 6. | S1 (prevents trigger) | S | None |
| **F3** | **Add `errorElement` to the `/quest` route** in `router.tsx`. Use a quest-themed error component that offers "Back to Mine" and saves partial session. | S2 | S | None |
| **F4** | **Wrap `AvatarThumbnail`'s WebGL initialization in try/catch** (`AvatarThumbnail.tsx:67`). On WebGL failure, fall back to the CSS pixel-art `MinecraftAvatar` component. | S2 | S | None |
| **F5** | **Extend comprehension prompt to define Levels 7-10** in `buildComprehensionQuestPrompt()` (`chat.ts:809`). Add content guidance for higher comprehension levels. | S1 (reduces trigger likelihood) | M | None |
| **F6** | **Add a mount-time trigger to the resume query**. Either use `onSnapshot` instead of `getDocs`, or add a counter/key dependency that increments on mount. | S3 | S | None |
| **F7** | **Add `SectionErrorBoundary` around quest UI sections** in `KnowledgeMinePage.tsx`. Isolate question rendering from the rest of the page. | S2 | S | None |

### Recommended order

1. **F1** (try/catch) — fixes the root crash cascade, 10 lines of code
2. **F4** (WebGL fallback) — prevents the precision crash regardless of cause
3. **F2** (level cap) — prevents the trigger condition entirely
4. **F3** (errorElement) — catches any future errors gracefully
5. **F6** (resume query) — fixes the resume card gap
6. **F5** (extend prompt) — longer-term, expands capability
7. **F7** (section boundary) — defense in depth

F1 + F4 together fix all three symptoms with ~20 lines of code.

---

## 8. Open Questions

1. **What exactly did the "ejection" look like?** Did Lincoln see an error screen with "Something went wrong" + retry/reload buttons? Or did the app literally navigate to `/today`? If the former, the `ErrorBoundary` caught the unhandled rejection. If the latter, there's an unknown redirect path we haven't found.

2. **Was the AI call a throw or a null return?** Cloud Function logs from the session would tell us. If the CF returned a 500, `chat()` might throw. If it returned an empty response, `chat()` returns null and the session would end gracefully (not crash). The crash theory depends on a throw, not a null.

3. **Is the WebGL context actually lost on the tablet?** The precision crash theory assumes WebGL context exhaustion. We could verify by checking `canvas.getContext('webgl')` return value and adding `webglcontextlost` event listeners to `AvatarThumbnail`.

4. **How does `useAI`'s `chat()` handle Cloud Function errors?** Does it catch internally and return null, or does it re-throw? If it always catches and returns null, the try/catch theory for Symptom 1 doesn't hold, and the ejection mechanism would be different. Need to read `src/core/ai/useAI.ts` to confirm.

5. **Is the `quest.screen` dependency on the resume useEffect actually effective?** After a crash, if the hook's state is destroyed and recreated, `quest.screen` starts at `'intro'` — which is its default. React's `useEffect` runs on mount regardless of dependency values, so this should work on a clean remount. The issue is specifically when the component **doesn't unmount** (preserved by router) or when the precision crash prevents mounting entirely.

6. **Could the tab be running low on memory?** A 3.4MB bundle with Three.js loaded globally on a tablet could hit memory pressure. The unhandled rejection might be caused by the browser killing the Cloud Function fetch due to memory pressure, not a CF failure.

---

## 9. Resolution (2026-04-07)

Four fixes landed to break the cascade. Each is independently revertable.

| Fix | What Changed | Symptoms Resolved |
|-----|-------------|-------------------|
| **F1: submitAnswer/handleSkip try/catch** (`useQuestSession.ts`) | Wrapped the AI call block in both `submitAnswer` and `handleSkip` in try/catch. On error with answered questions → `endSession()` fires, showing QuestSummary with earned diamonds. On error with zero questions → `resetToIntro()` + friendly "mine is being tricky" message. Error logged with full context. | S1 (quest crash/ejection) — prevents the cascade trigger |
| **F2+F3: AvatarThumbnail WebGL safety** (`AvatarThumbnail.tsx`) | (a) Wrapped `WebGLRenderer` creation in try/catch with CSS fallback (purple circle + child initial). (b) Added `gl.isContextLost()` check after renderer creation. (c) Added `renderer.forceContextLoss()` to `disposeScene` — was missing, causing WebGL context leaks. | S2 (precision crash) — prevents the WebGL context exhaustion |
| **F4: /quest errorElement** (`router.tsx` + `QuestErrorBoundary.tsx`) | Added Minecraft-themed error boundary to the `/quest` route: "The mine collapsed!" with Back to mine / Back to Today buttons. Logs error for debugging. | S2 fallback (if a render error still escapes) |
| **F5: Resume useEffect — no change needed** | Verified: the dependency array `[activeChildId, familyId, quest.screen]` is correct. The real blocker was the precision crash (F2) preventing component mount. With F2 fixed, the resume query fires normally on soft nav back to `/quest`. | S3 (resume card not appearing) — resolved by F2 |

### AvatarThumbnail Remount Audit

**Finding:** AvatarThumbnail is rendered inside `AppShell` which wraps `<Outlet>`. AppShell persists across navigations — AvatarThumbnail does **not** remount on page nav. The `useEffect` only re-runs when props change (e.g., `totalXp` after an XP gain, or `equippedPieces` after armor equip).

The WebGL context leak was caused by missing `forceContextLoss()` in the cleanup function. `renderer.dispose()` alone releases Three.js internal state but does NOT release the WebGL context back to the browser's pool. On a tablet that also uses WebGL elsewhere (or after multiple prop-change re-renders), this could exhaust the browser's context limit (typically 8-16 on mobile).

**Fix applied:** Added `renderer.forceContextLoss()` to `disposeScene()`. This ensures every cleanup properly releases the context.

### Routes Missing errorElement (audit)

The entire route tree has zero `errorElement` definitions besides the new `/quest` one. Kid-facing routes that should have themed error boundaries:
- `/workshop` — Story Game Workshop
- `/books` (and sub-routes) — My Books
- `/avatar` — My Armor

These are candidates for a separate cleanup pass using `QuestErrorBoundary` as the pattern.

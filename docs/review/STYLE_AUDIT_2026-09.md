# STYLE & THEME AUDIT — 2026-09-04

**Ledger row:** `FEAT-190`. **Findings:** `UX-160` → `UX-179`.
**Scope:** every pickable "style", "theme" and "look" in the app, laid next to the text it actually
sends to a model. Read-only — **one** sanctioned fix applied (§11).
**Base:** `origin/main` @ `4423fd36` — FEAT-189 and **both** its Codex follow-ups (PR #1758, PR #1759)
merged. This audit reads the post-189 state and does not re-file what 189 fixed; every rendered prompt
below was re-rendered against `4423fd36` after #1759 landed mid-run.
**Owner direction** (Nathan, 2026-09-04): *"I'm not sure the themes vary the sketch a lot — cartoon
vs fantasy was small. Themes and how they work are worth an examination at some point."*

**Method.** Every option table was read at source, then the prompts were **rendered from the compiled
server code** (`functions/lib/**`) rather than reconstructed by eye, so every "what is actually sent"
cell below is the literal string the model receives. Pairwise separation was measured mechanically
(content-word Jaccard per axis, stop-words dropped) and then read by hand, because the interesting
answer turned out not to be lexical (§3).

---

## 0. The shape of the problem, in one paragraph

There are **eleven** tables in this repo that a person would call a style or a theme, spread over
five surfaces and two projects. Four of them are hand-kept copies of another one. One word — *theme* —
means five different things. And the two questions a parent would ask of any of them — *what will this
look like?* and *does picking a different one change anything?* — have, today, five different answers
depending on which picker they are standing in front of. The recipes themselves are in good shape
(FEAT-159/174/189 did that work, and it holds up under measurement). What is not in good shape is
**reach**: several controls are honest-looking pickers whose value never arrives anywhere.

---

## 1. The table — every pickable option, next to what it sends

Six pickers reach a model. Two more (`COVER_STYLES`, the app's `ThemeMode`) are named "style"/"theme"
and reach nothing, and are included because that is itself the finding.

### 1a. Book picture style — `GENERATION_STYLES` × `STYLE_PREFIXES` / `BOOK_ILLUSTRATION_RECIPES`

**Where:** the Generate chat's *Picture style* strip (`BookGenerateChat.tsx:615-646`, options from its
own `STYLE_OPTIONS` `:42-49`) and the Book Editor's Make-a-Scene *Picture style* chips
(`BookEditorPage.tsx:1815-1830`, options from `bookTypes.ts:14-21`).
**Path:** picker id → `book-illustration-${id}` (`useBookIllustrator.ts:132`, `BookEditorPage.tsx:827`)
→ `STYLE_PREFIXES` (`generateImage.ts:201-217`) → `buildImagePrompt` (`:242-259`).
Every prefix = `summary` + `BOOK_PAGE_FRAMING` (`:159-161`) + `recipeDetail` + optional `worldPropsClause`.

| Option id · label | What the user is told (`artHelpContent.ts` parent blurb) | What is actually sent | Look or subject? | Separates from nearest sibling? |
|---|---|---|---|---|
| `minecraft` · **Minecraft** | "Blocky voxel worlds built from cubes with visible pixel steps. One flat tone per cube face… Where a page allows it the scene dresses in blocks and stepped terrain; indoors it keeps the look and drops the props." (`:154`) | 791 chars. Summary *"A children's book page drawn in the look of a blocky voxel pixel-art world."* · Palette *"a limited palette of flat, saturated colors — grass green, dirt brown, stone grey — laid down unblended, never mixed."* · Line *"no outlines at all; every form is built from hard-edged cubes with visible pixel steps."* · Shading *"flat per-face shading only — one solid tone per cube face, lighter on top, darker on the sides. No gradients, no soft light."* · Props *"cubic blocks, stepped terrain, torches, ore seams"* (`generateImage.ts:115-125`) | **Look** (props correctly demoted, FEAT-189) | Yes. Nearest is `platformer` (mean .144); differs on all three axes — cubes vs chunky rounded shapes, per-face vs two-step cel |
| `garden-warfare` · **Garden Battle** | "Leaf green and warm yellow in flat cheerful fills, bold rounded outlines with nothing sharp… in the spirit of Plants vs. Zombies." (`:159`) | 1034 chars (**the longest**, since PR #1759). Palette *"high-saturation leaf green and warm yellow against soft earth brown, in flat cheerful fills."* · Line *"a bold, rounded outline of even weight on every shape — nothing sharp, nothing spiky, nothing frightening."* · Shading *"simple two-tone cartoon shading with one soft drop shadow under each shape, lit by broad flat daylight."* · Props *"sunflowers, pea shooters, walnut barriers, garden pots, silly cartoon zombies in the background"* (`:126-136`) | **Look** | Nearest is `platformer` (mean **.204**, the closest pair in this picker). Both are "flat saturated fills + thick even outlines + two-step cel". Separated in practice only by palette (green/yellow vs blue/red/gold) and by `platformer`'s *"drawn side-on in 2D"* |
| `storybook` · **Storybook** | "Warm hand-painted watercolor: cream, soft coral and sage, with paper grain showing through." (`:164`) | 572 chars (the shortest). Palette *"warm, gently desaturated colors — cream, soft coral, sage — with visible paper white and paper grain showing through."* · Line *"a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge of a shape."* · Shading *"translucent watercolor washes with soft blooms where colors meet; no hard black shadows."* (`:97-105`) | **Look** | Yes — the only watercolor in this picker. Furthest from `platformer` (mean .043) |
| `platformer` · **Platformer World** | "Saturated primaries in flat fills, thick clean outlines around chunky shapes… the classic Mario-style game look." (`:169`) | 820 chars. Palette *"saturated primaries — bright blue, warm red, gold and green — in flat unblended fills with no gradients."* · Line *"thick, clean outlines of even weight around chunky rounded shapes; nothing wispy or sketchy."* · Shading *"flat cel shading in two steps per shape, drawn side-on in 2D with no perspective depth and no soft light."* · Props *"brick platforms, green pipes, gold coins, question blocks, fluffy clouds, mushroom shapes"* (`:137-147`) | **Look** | See `garden-warfare` |
| `comic` · **Comic Book** | "High-saturation comic primaries in flat fills, a heavy black ink outline thickest on the silhouettes, hard cel shading and halftone dots. The most graphic of the looks." (`:174`) | 656 chars. Palette *"high-saturation comic primaries — red, yellow, cyan — in flat fills with no gradients, and strong complementary contrast."* · Line *"a heavy, confident black ink outline of varying weight, thickest on the silhouettes, with speed lines and impact streaks in the background."* · Shading *"hard-edged cel shading in two or three steps, with visible halftone dot screens for the midtones, and a dramatic low or high camera angle."* (`:88-96`) | **Look** | Yes — halftone + camera angle are unique in this picker |
| `realistic` · **Realistic** | "Naturalistic muted colors with believable wood, stone and fabric. Almost no outline…" (`:179`) | 505 chars. Palette *"naturalistic, muted colors with believable wood, foliage, stone and fabric tones."* · Line *"almost no visible outline — forms are defined by tone and edge contrast."* · Shading *"soft directional light with smooth falloff, subtle bounce light, and gentle cast shadows."* (`:106-114`) | **Look** | Yes — the only one with no outline at all |

**Five of the six also carry** `BOOK_PAGE_FRAMING`: *"One single, unified scene filling the whole
image — never split panels, halves, strips, collages or borders. Environment and background only, no
characters or people."*

**Garden Battle is the exception, as of PR #1759** (a FEAT-189 Codex follow-up that landed while this
audit was being written). Its props include living things, so `propsIncludeCreatures: true` routes it
through `BOOK_PAGE_FRAMING_WITH_PROP_CREATURES` instead: the same unified-scene rule, then *"Environment
and background only: no people, and none of the story's characters. The one exception is the world's own
prop creatures listed below — those ARE allowed and expected: draw them as scenery, small and incidental
in the background, never the subject of the picture."* The reasoning generalises and is worth recording:
an earlier attempt appended a later sentence saying the zombies were *not* the story's characters, and
Codex correctly rejected it — describing what something is not never grants an exemption from a ban
already stated categorically, and a model holding a prohibition plus a later exception tends to keep the
prohibition. The contradiction is now **never emitted** rather than patched. That is the right shape,
and it is the one place in the repo where a look and a subject constraint were reconciled properly —
see §9, and contrast **UX-162**, which is the same class of defect on the sticker surface.

### 1b. Book theme presets — `PRESET_THEMES` × two server copies

**Where:** the Book Editor's Finish dialog, *"Pick a theme (optional):"* (`BookEditorPage.tsx:2068-2084`,
all 16 `BOOK_THEMES` ids). Also set without a tap by `inferBookTheme` (`bookThemeInference.ts:18`)
and by `autoSuggestTheme` (`BookEditorPage.tsx:852-878`).
**Three columns, one id** — the client field a parent could read, and the two server maps that actually
reach a model.

| id | client `imageStylePrefix` (`books.ts`) | `generateImage.ts` `PRESET_IMAGE_PREFIXES` (the picture) | `generateStory.ts` `PRESET_THEME_MAP.imageStylePrefix` (the story) | Drift |
|---|---|---|---|---|
| `adventure` | "A colorful adventure scene for a children's book. Exciting landscapes, treasure maps, hidden paths." `:53` | "…children's book." `:345` | "…children's book." `:30` | server drops sentence 2 |
| `animals` | "…of animals in nature. Soft colors, gentle expressions." `:61` | "…in nature." `:346` | "…in nature." `:36` | drops sentence 2 |
| `family` | "…of a family together. Soft lighting, happy expressions." `:69` | **absent → added by FEAT-190 (§11)** | **absent → no story guidance** | was nothing on both |
| `fantasy` | "A magical fantasy scene… Sparkling effects, enchanted forests, mythical creatures." `:77` | "A magical fantasy scene for a children's book." `:347` | same `:42` | drops sentence 2 |
| `minecraft` | "…Cubic blocks, pixelated textures, bright colors. **No character names.**" `:85` | "…bright colors." `:348` | "A blocky pixel-art Minecraft-style scene." `:48` | **three different strings**; the copyright clause survives only on the client |
| `science` | "…about science. Lab equipment, nature exploration, experiments." `:93` | **absent → added by FEAT-190** | **absent** | was nothing on both |
| `sight_words` | "A simple, clean children's book illustration. Clear scenes, minimal detail, bold colors." `:101` | **absent → added by FEAT-190** | **absent** | was nothing on both — **and this is the id `inferBookTheme` returns for every book with a word list** |
| `faith` | "…Gentle light, nature scenes, peaceful atmosphere." `:109` | **absent → added by FEAT-190** | **absent** | was nothing on both |
| `space` | "…Colorful planets, stars, rockets, and astronauts." `:117` | "…stars, rockets." `:349` | "A vivid space scene for a children's book." `:54` | three strings |
| `dinosaurs` | "…Friendly dinosaurs, lush vegetation, volcanic landscapes." `:125` | "…lush vegetation." `:350` | "A prehistoric children's book illustration." `:60` | three strings |
| `ocean` | "…Colorful coral reefs, friendly sea creatures, sparkling water." `:133` | "…friendly sea creatures." `:351` | "An underwater children's book illustration." `:66` | three strings |
| `superheroes` | "…Dynamic poses, bright costumes, city skyline." `:141` | "A bold, colorful superhero scene…" `:352` | same `:72` | drops sentence 2 |
| `cooking` | "…Colorful ingredients, friendly chefs, tasty dishes." `:149` | "A warm, cheerful kitchen scene…" `:353` | same `:78` | drops sentence 2 |
| `sports` | "…Action poses, outdoor settings." `:157` | "A bright, energetic children's book illustration of kids playing sports." `:354` | same `:84` | drops sentence 2 |
| `holidays` | "…Holiday decorations, seasonal scenes, warm family celebrations." `:165` | full `:355` | "…seasonal scenes." `:90` | story copy drops a clause |
| `other` (`BOOK_THEMES` only, `books.ts:186`) | — | — | — | pickable; matches nothing anywhere |

**Every row here is a subject**, not a look: "treasure maps", "coral reefs", "lab equipment", "city
skyline". This is the same shape FEAT-189 removed from three illustration styles — and it is still
live on this table (§2).

Each preset also carries a story-side triple, which is the half that works well:
`storyTone` / `storyWorldDescription` / `storyVocabularyLevel` → `THEME GUIDANCE` in the story prompt
(`chat.ts:2407-2416`) — for the 11 ids `PRESET_THEME_MAP` covers.

### 1c. Custom themes — `bookThemes` (`CreateThemeDialog.tsx`)

| Field the parent fills in | Where it is stored | Where it reaches a model |
|---|---|---|
| *"What kind of world is this?"* → `storyWorldDescription` (`:93-101`) | `families/{id}/bookThemes/{autoId}` | `generateStory.resolveThemeGuidance` custom branch (`:106-119`) → `STORY WORLD:` — **only if a book carries this theme id** |
| *"What style should pictures be?"* → `imageStylePrefix` (`:103-111`) | same | `generateImage.ts:360-370` custom lookup — **but only when the picked style contributes nothing**, and the book path always sends a `book-illustration-*` style, so **never** |
| *"What tone should stories have?"* → `storyTone` (`:113-121`) | same | `STORY TONE:` — same condition as row 1 |
| name / emoji | same | nowhere |

**And no book can carry a custom theme id.** `book.theme` is only ever written by `inferBookTheme`
(preset ids only), `autoSuggestTheme` (six preset ids), or the Finish dialog's chips (`BOOK_THEMES`,
preset ids only). The client never reads `bookThemes` at all — `bookThemesCollection` has exactly one
caller and it is the `addDoc` (`CreateThemeDialog.tsx:55`; `firestore.ts:410`). See **UX-160**.

### 1d. Sticker looks — `FANCY_STYLE_OPTIONS` × `STYLE_RECIPES` / `THEME_IMAGE_STYLES`

**Where:** *"Make it fancy"* (`SketchScanner`), *"Add version"* (`DrawingGroupCard`), *"Make more
versions"* (`StickerLibraryTab`) — all through `resolveFancyEnhanceParams`
(`drawingStickerStyles.ts:90-100`), which **always** sets `transparent: true`.
**Path:** option → `{style?, theme?}` → `buildEnhancePrompt` (`enhanceSketch.ts:224-280`). Exactly one
full recipe reaches the model: an explicit `style` wins and the theme drops to its one-line `summary`;
with no `style`, the theme owns the look (`:238-260`).

| Option id · label | Told (`artHelpContent.ts`) | Sent — the recipe that owns the look | Look or subject? | Separates? |
|---|---|---|---|---|
| `cartoon` · 🎨 **Cartoon** (default) | "The house default: warm hand-painted watercolor… The same recipe the Storybook book look uses." `:186` | `STYLE_RECIPES.storybook` `enhanceSketch.ts:44-52`. Palette *"…cream, soft coral, sage — with visible paper white showing through."* Line *"a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge."* Shading *"translucent watercolor washes with soft blooms where colors meet; no hard black shadows."* | **Look** | **See §3** — shares its medium (watercolor + ink) with `fantasy`, the only such pair in the picker. Also **not** byte-identical to the Storybook book recipe the help says it equals (§5) |
| `fantasy` · ✨ **Fantasy** | "Dusty lilac, moss green and candlelight gold with a faint glow… A fine tapering ink line and soft washes that bleed past it." `:191` | `THEME_IMAGE_STYLES.fantasy` `:97-106`. Palette *"dusty lilac, moss green and candlelight gold, with a faint glow around anything magical."* Line *"a fine, tapering ink line — noticeably thinner than the house cartoon style — that breaks away in places."* Shading *"soft watercolor washes that bleed past the line, with luminous highlights and no hard shadow."* | **Look** | **The owner's pair — §3** |
| `animals` · 🐾 **Animals** | "Warm creams, ginger and soft brown with pink cheek accents…" `:196` | `THEME_IMAGE_STYLES.animals` `:117-124`. Shading *"simple two-tone shading with visible fur or feather texture; no hard shadows."* | **Look** | Yes — the only one naming fur |
| `adventure` · 🗺️ **Adventure** | "Sun-bleached ochre against deep teal shadow… strong cast shadows with a bright rim light." `:201` | `THEME_IMAGE_STYLES.adventure` `:107-116`. Shading *"high-contrast directional light with strong cast shadows and a bright rim light on the silhouette."* | **Look**, but names **no medium** | Palette-only separation — and *"strong cast shadows"* needs a surface the cutout clause removes (**UX-162**) |
| `space` · 🚀 **Space Explorer** | "Deep indigo and violet darks with electric cyan and magenta nebula accents…" `:206` | `THEME_IMAGE_STYLES.space` `:134-143`. Shading *"airbrushed gradients with bloom around bright areas and fine star speckles."* | **Look** with a subject tail (*star speckles*) | Yes on medium (airbrush). "Star speckles" reads as environment on a cutout, but could be speckles *on* the subject — **ambiguous, not demonstrable** (**UX-162**) |
| `science` · 🔬 **Science** | "Clean primary red, blue and yellow on generous white space. A crisp uniform line like a well-drawn diagram…" `:211` | `THEME_IMAGE_STYLES.science` `:125-133`. Shading *"flat fills with a single soft light-grey drop shadow. No gradients, no texture."* | **Look** | Yes (technical line is unique) — a drop shadow falls behind the subject, which the cutout removes (**UX-162**) |
| `faith` · ✝️ **Faith** | "Warm amber, ivory and soft olive at low saturation. A soft line drawn in warm brown rather than black…" `:216` | `THEME_IMAGE_STYLES.faith` `:144-151`. Shading *"gentle golden light from one side with long soft shadows and no harsh contrast."* | **Look**, names **no medium** | Palette + line-colour only — *"long soft shadows"* needs a surface the cutout removes (**UX-162**) |
| `family` · 👨‍👩‍👦 **Family** | "Muted terracotta, wheat and sage — homey and deliberately desaturated. A soft pencil-textured line…" `:221` | `THEME_IMAGE_STYLES.family` `:202-209`. Shading *"soft diffuse indoor light with a visible paper grain over everything."* | **Look** | Yes on medium (pencil). "Paper grain over everything" may mean over the *subject* — **ambiguous, not demonstrable** (**UX-162**) |
| `minecraft` · ⛏️ **Blocky** | (shares the `minecraft` blurb, `:154`) | The **only** option sending both: `STYLE_RECIPES.minecraft` owns the look *and* `THEME_IMAGE_STYLES.minecraft`'s summary rides along as *"Visual theme: Blocky pixel-art Minecraft style with cubic shapes and bright colors."* (rendered prompt, 1149 chars — the longest) | **Look** | Yes, comfortably — but see **UX-167** (a third minecraft recipe exists) |

`THEME_IMAGE_STYLES` covers **all fifteen** presets — it is the only complete server copy. Six of them
(`dinosaurs`, `ocean`, `superheroes`, `holidays`, `cooking`, `sports`) are therefore written, tested by
nothing, and **unreachable from any picker** (**UX-170**). `STYLE_RECIPES.realistic` is likewise
unreachable (**UX-169**).

### 1e. Reimagine intensity — `useBackgroundReimagine`

**Where:** the drawing flow's *"Reimagine intensity"* slider, ends labelled **"Keep my style"** ↔
**"Full reimagine"**, marks *Light / Medium / Full* (`DrawingChoiceDialog.tsx:412-450`).

| Slider band | Caption sent (`BookEditorPage.tsx:680-684`) | Style sent (`useBackgroundReimagine.ts:152-153`) | What that means |
|---|---|---|---|
| ≤ 25 · *Keep my style* | *"Lightly clean up this child's drawing, keeping their art style and line work. Just smooth edges and brighten colors."* | `'storybook'` | the full watercolor recipe, under *"Follow the palette, line work, and shading described above **exactly**"* |
| 26–74 · *Medium* | *"Enhance this child's drawing into a polished illustration while keeping the original composition and character design."* | `'storybook'` — **identical to Light** | |
| ≥ 75 · *Full reimagine* | *"Reimagine this child's drawing as a professional illustration. Keep the subject matter but create it in a **polished cartoon style**."* | `'comic'` | halftone dots and hard cel shading |

Three labelled bands, two distinct styles, and both ends say something the prompt then contradicts.
**UX-161.**

### 1f. Game Workshop art — `ThemeStep` / `BoardStyleStep` / `CardStyleStep` × `workshopArt.ts`

Every Workshop picture is sent with **`style: 'general'`** — `STYLE_PREFIXES.general` is the empty
string — and no `themeId` (`workshopArt.ts:144, 226, 351, 552`; `WorkshopPage.tsx:585`). **No look
table reaches the Workshop at all.**

| Picker | Options | Sent | Look or subject? |
|---|---|---|---|
| *"What's your game about?"* (`ThemeStep.tsx:10-18`) + a free-text **"My Own Idea"** box (`:118-129`) | `dragons` `space` `ocean` `jungle` `castle` `robots` `animals`, or anything typed | interpolated raw: *"A colorful illustrated **${theme}** themed game board background, top-down bird's eye view, ${boardStyle} layout visible, children's board game art style, vibrant, fun, no text"* (`workshopArt.ts:24-26`) | **Subject** |
| *Board style* (`BoardStyleStep.tsx:10-14`) | Winding Path / Grid / Circle | `BOARD_STYLE_LABELS` → *"winding path layout visible"* (`:51-55`) | **Layout** — a board-shape word inside an art prompt |
| *Card back* (`CardStyleStep.tsx:11-29`) | Classic / Decorated / **Custom** (free text) | `"…${theme} themed, ${cardBackDesc}, repeating pattern, symmetrical, colorful, no text"` (`workshopArt.ts:403-411`); Custom's text goes in verbatim | Custom is the **one free-text look field in the app that reliably reaches a model** |

The only look language anywhere in the Workshop is three inline adjective phrases — *"children's board
game art style, vibrant, fun"* (`:25`), *"storybook illustration style, centered composition"*
(`:30, 292, 399`), *"children's game card art style, simple, colorful"* (`:44`). These are the exact
adjective-only strings FEAT-159 and FEAT-174 diagnosed as collapsing. **UX-163.**

### 1g. Fixed, no picker (read-only mention)

| Surface | Prompt text | Notes |
|---|---|---|
| Kit Builder character art (`KitBuilderSection.tsx:105-110`), the editor's sticker picker (`StickerPicker.tsx:168-173`), Make-a-sticker (`MakeStickerDialog.tsx:112-117`) | `STYLE_PREFIXES["book-sticker"]`: *"A single cute cartoon character or object, sticker style. Bold clean outline, colorful flat fill, simple shapes, fun and expressive. Child-friendly, no text, no background elements."* (`generateImage.ts:214-215`) | **Adjective-only** — no palette, no line weight, no shading. The one look three paid doors share, and the only look in the repo that never got the `VisualRecipe` treatment. **UX-164** |
| Avatar / armor (`baseCharacter.ts:22-36`, `starterAvatar.ts:24-31`, `avatarPiece.ts:31-38`, `armorSheet.ts:33-102`, `armorReference.ts:33-80`, `photoTransform.ts:40`, `minecraftSkin.ts:51-60`) | keyed on `avatarProfile.themeStyle` ∈ `minecraft` \| `platformer` — e.g. *"Pixel art video game character, blocky 8-bit style…"* vs *"Cute cartoon platformer character, rounded cheerful style…"* | **Not a picker.** Seeded once from `ageGroup` (`MyAvatarPage.tsx:357`, capability not name) and never re-chosen. The two are well separated. The armor *sheets* additionally name palettes per tier (`armorSheet.ts:33-102`) — the most specific fixed look in the repo |
| Shelly chat images (`useShellyChatFlows.ts:565-570`) | `style: 'general'` → **empty prefix**; the kid's typed prompt reaches the model bare | free-text, no look, no cap surface |
| `schedule-card` / `reward-chart` / `theme-illustration` (`generateImage.ts:202-207`) | three adjective-only prefixes | **no caller in the repo** — dead entries in the style union |

### 1h. Named "style"/"theme", reaches nothing

| Picker | Options | What it does |
|---|---|---|
| **Cover style** — *Write it myself* sheet (`BookshelfPage.tsx:1121-1142`, `COVER_STYLES` `bookTypes.ts:3-11`) | Storybook · Minecraft · Comic Book · **Photo Album** · Realistic · Garden Battle · Platformer World | Writes `book.coverStyle`. Nothing renders a cover from it. Its **only** functional read is a third-level fallback for the review chat's picture regen (`useBookReview.ts:383-387`) — where **Photo Album** becomes `book-illustration-photo`, which is not in the callable's `validStyles` (`generateImage.ts:301-319`), so the request is **rejected at the argument gate**; `useBookIllustrator` catches it per page (`:252-255`) and marks the page failed. Not a look-less picture — **no picture**. **UX-165** |
| **App theme** — `ThemeMode` `family` \| `lincoln` \| `london` (`enums.ts:96-101`, `ProfileProvider.tsx:7`) | — | MUI colour scheme in `localStorage`. A fifth meaning of "theme" (§6) |
| **Seasonal theme** (`avatar/voxel/seasonalTheme.ts:60`) | spring/summer/autumn/winter | Three.js particle colours. A sixth, internal only |

---

## 2. Question 1 — is it a look or a subject?

A **look** names palette, line and shading. A **subject** names what is in the picture. FEAT-189
established why the distinction is load-bearing: `buildImagePrompt` appends the page's own scene after
the prefix, so a subject list in the prefix is a second, competing scene and the model splits the canvas.

**Clean (looks):** all six book illustration styles; all four `STYLE_RECIPES`; fourteen of the fifteen
`THEME_IMAGE_STYLES`; the two avatar `themeStyle` prompts.

**Subject-shaped rows — every one a finding:**

1. **The whole of `PRESET_THEMES.imageStylePrefix`** (§1b) — fifteen ids, each a scene list ("Exciting
   landscapes, treasure maps, hidden paths"; "Lab equipment, nature exploration, experiments"; "coral
   reefs, friendly sea creatures, sparkling water"). This is the same table FEAT-174 found overriding
   the picked style, and the same failure shape FEAT-189 fixed on the three world styles. It is
   currently harmless **only** because FEAT-174 made the style win; the moment any caller sends
   `style: 'general'` with a `themeId`, a scene list becomes the whole prefix. **UX-166.**
2. **The Workshop's theme** (§1f) — subject by construction, and the only art direction it has.
3. **`THEME_IMAGE_STYLES.space`** — *"fine star speckles"* is set dressing, not shading (`:142`).
4. **`STYLE_PREFIXES["book-sticker"]`** — *"A single cute cartoon character or object"* is a subject
   constraint doing duty as a look (**UX-164**).
5. **`BoardStyleStep`** — "winding path layout" is a board topology reaching an art prompt (§1f).

---

## 3. Question 2 — does it separate? (and the owner's report, measured)

Measured pairwise on content-word overlap per axis (Jaccard, stop-words dropped). **Nothing in the repo
is a lexical collapse.** The closest pairs anywhere:

| Picker | Closest pair | palette | line | shading | mean |
|---|---|---|---|---|---|
| Book styles (6) | `garden-warfare` ↔ `platformer` | .20 | .22 | .19 | **.204** |
| Sticker themes (15) | `holidays` ↔ `cooking` | .13 | .20 | .29 | **.206** |
| Sticker base styles (4) | `storybook` ↔ `realistic` | .05 | .06 | .11 | .070 |

By that measure FEAT-159's and FEAT-174's work holds: the recipes are specific and distinct.

### The owner's pair, measured

`Cartoon` (`STYLE_RECIPES.storybook`) vs `Fantasy` (`THEME_IMAGE_STYLES.fantasy`):

| axis | Jaccard | shared content words | verdict |
|---|---|---|---|
| palette | **0.00** | — | fully distinct: *cream / soft coral / sage / paper white* vs *dusty lilac / moss green / candlelight gold / faint glow* |
| line | 0.10 | `ink`, `line` | same instrument, differing by **one weight adjective**: *"medium weight… lifts off the edge"* vs *"fine, tapering… noticeably thinner than the house cartoon style"* |
| shading | 0.24 | `watercolor`, `washes`, `soft`, `hard` | **the same medium**: *"translucent watercolor washes… no hard black shadows"* vs *"soft watercolor washes that bleed past the line… no hard shadow"* |

**The owner's eye is right, and the cause is not word overlap.** Cartoon and Fantasy are the **only two
options in the sticker picker that name the same medium** — a mechanical scan for medium words across
all nine options:

```
cartoon    watercolor, wash     ← same medium
fantasy    watercolor, wash     ← same medium
Blocky     pixel, cube          adventure  (none named)
animals    two-tone, fur        faith      (none named)
science    diagram, flat fill   family     pencil
space      airbrush, gradient
```

Medium is the axis a viewer reads first. Two watercolor options differing by palette and line weight
will look like variations of one thing — which is exactly the report. And **the one axis that does
fully separate them is the one the surface constrains**: the prompt says *"Keep the same composition,
characters, and scene layout from the original drawing"*, so the palette of a re-drawn child's drawing
is largely the drawing's. That is **UX-179**, and it is the mechanism behind the owner's report — it
rests on a measurement (the medium scan above), not on inference.

> **Correction, 2026-09-04 — this section originally over-claimed, and a Codex review on PR #1760
> caught it.** The first draft folded a second finding into this one and called the pair "the P1 of
> this audit's sticker half, and the mechanism behind the owner's report". That was wrong on both
> counts, and the split below is the corrected reading. The shadow conflict is real but **narrower**
> than stated, and — decisively — **neither Cartoon nor Fantasy is in the conflicting set**: both say
> *"no hard shadow(s)"*, which the cutout clause is perfectly happy with. So the shadow conflict cannot
> be the mechanism behind the owner's specific report. The two are now filed separately: **UX-179**
> (the measured medium collapse, the owner's pair) and **UX-162** (the shadow conflict, narrowed and
> demoted to P2).

**The separate, narrower finding — UX-162.** Because `resolveFancyEnhanceParams` always sets
`transparent: true`, every fancy prompt ends *"No background scene, no ground, **no shadows on the
ground**, no environment, no border."* Three of the nine options ask for something that clause
**demonstrably** removes, because each needs a surface the cutout does not have:

| option | shading clause | why it conflicts |
|---|---|---|
| `adventure` | *"strong cast shadows and a bright rim light on the silhouette"* | a cast shadow is cast **onto** something; the rim light is fine and survives |
| `faith` | *"gentle golden light from one side with long soft shadows"* | a long shadow lies on a ground plane that is removed |
| `science` | *"flat fills with a single soft light-grey drop shadow"* | a drop shadow falls behind the subject, onto the background |

Two more were originally listed here and are **not** demonstrable from the prompt text alone, because
the clause forbids background, ground and shadows *on the ground* — not shading, texture or detail on
the subject itself: `family`'s *"a visible paper grain over everything"* (which may mean over the
subject) and `space`'s *"fine star speckles"* (which may be speckles on the subject). Both are recorded
as **ambiguous — needs looking at real output**, not as conflicts.

So: **3 of 9 demonstrable, 2 of 9 ambiguous, and the owner's own pair in neither group.** UX-162 is a
P2.

**Second-closest, worth naming:** `garden-warfare` ↔ `platformer` (.204). Both are *"flat saturated
fills + thick even outlines + two-step cel shading"*. `platformer` adds *"drawn side-on in 2D with no
perspective depth"*, which is a real difference; `garden-warfare` adds nothing structural. Under
FEAT-189 their props are now conditional, so on an indoor page the two are separated by palette alone.
**UX-171.**

**Where FEAT-159 named a recipe, the recipe is what still ships** — verified: all nine sticker payloads
were re-rendered from compiled code and each carries exactly one full palette/line/shading block, as
FEAT-159 designed.

---

## 4. Question 3 — where does each table reach?

| Table | Reaches | Does not reach |
|---|---|---|
| `GENERATION_STYLES` → `STYLE_PREFIXES` | every book picture, always wins (FEAT-174) | — |
| `PRESET_THEMES.imageStylePrefix` (client) | **nothing.** It is the display copy; both server maps carry their own abridged text | any model |
| `PRESET_IMAGE_PREFIXES` | **nothing, from any caller in the repo.** The only caller that sends `themeId` (`useBookIllustrator.ts:200`) always sends a `book-illustration-*` style, which wins outright (FEAT-174); the one style that would fall through — `book-illustration-photo` — is rejected at the callable's `validStyles` gate first (§1h). Completing the map (§11) is correct data, not a live change | every book picture path |
| `PRESET_THEME_MAP` (story) | the story prompt's `THEME GUIDANCE`, for 11 ids | the four ids in §1b, and every book whose theme is `sight_words` or `other` |
| custom `bookThemes` | **nothing** — no book can carry the id (§1c) | everything |
| `THEME_IMAGE_STYLES` | the sticker reimagine, 9 of 15 ids | 6 ids reachable from no picker |
| `STYLE_RECIPES` | `storybook` (Cartoon + reimagine ≤74), `comic` (reimagine ≥75), `minecraft` (Blocky) | `realistic` — no caller |
| `COVER_STYLES` | a third-level regen fallback only | any cover |
| Workshop tables | the prompt as raw subject text | any look table |

**Pickable, resolves to nothing (dishonest controls):**

- `family` / `science` / `sight_words` / `faith` had **no entry** in `PRESET_IMAGE_PREFIXES` — the map
  is completed in §11, but the map itself is unreachable, so the picker is still not honest. The
  routing gap is **UX-165**.
- `family` / `science` / `sight_words` / `faith` on the **story** path — still nothing. **UX-172.**
- `other` (`BOOK_THEMES`) — matches no map anywhere.
- Every field of a custom theme. **UX-160.**
- **Photo Album** (`COVER_STYLES`) on the regen path. **UX-165.**

**Reaches by two paths:**

- **Blocky** sends `style: minecraft` *and* `theme: minecraft`, so the prompt carries a redundant
  *"Visual theme: Blocky pixel-art Minecraft style…"* after a complete blocky recipe. Every other
  option sends one. **UX-168.**
- A theme's `imageStylePrefix` reaches the **story writer** as `IMAGE STYLE:` (`chat.ts:2413`) with the
  instruction *"Scene descriptions should match the image style"* — while the picture is drawn from a
  different table entirely, which overrides it. Two art directions, one of which the parent never sees
  and which shapes only the `sceneDescription` text. **UX-173.**
- `useBackgroundReimagine` sends style **and** theme on every call (`:158-160`); `buildEnhancePrompt`
  handles this correctly by design (`:238-260`) — noted as **verified clean**, not a finding.

---

## 5. Question 4 — the copies

| # | Table | Copy of | Drift measured |
|---|---|---|---|
| 1 | `generateImage.PRESET_IMAGE_PREFIXES` | client `PRESET_THEMES` | abridged; 4 ids were missing (§11) |
| 2 | `generateStory.PRESET_THEME_MAP` | client `PRESET_THEMES` | abridged **differently**; same 4 ids still missing. **Three texts for `minecraft`, `space`, `dinosaurs`, `ocean`** |
| 3 | `enhanceSketch.THEME_IMAGE_STYLES` | client `PRESET_THEMES` ids | complete; entirely different content (recipes, not prefixes) — a legitimate second table, not a drifted copy |
| 4 | `BookGenerateChat.STYLE_OPTIONS` (`:42-49`) | `bookTypes.GENERATION_STYLES` | same 6 values, same order, **plus emoji**. They agree today; nothing enforces it, and `artHelpStyles('generateBook')` returns `GENERATION_STYLES` — so the help sheet lists the same six **without** the emoji the strip shows. FEAT-181 removed the editor's name-keyed pair and left this one. **UX-174** |
| 5 | `enhanceSketch.STYLE_RECIPES` vs `generateImage.BOOK_ILLUSTRATION_RECIPES` | each other — four shared names | **8 of 12 axes have drifted.** `storybook`: palette drops *"and paper grain"*, line drops *"of a shape"*. `comic`: **all three** differ (the sticker copy has no *"— red, yellow, cyan —"*, no *"speed lines and impact streaks"*, no *"dramatic low or high camera angle"*). `realistic`: palette says *"skin, wood, and fabric"* vs *"wood, foliage, stone and fabric"*. `minecraft`: palette + shading differ. `artHelpContent.ts:186` tells the parent Cartoon is *"the same recipe the Storybook book look uses"* — it is not, quite. **UX-167** |
| 6 | `THEME_IMAGE_STYLES.minecraft` | a **third** minecraft look — *"a limited 16-color palette of saturated greens, browns and greys"* | three blocky recipes in one repo |
| 7 | `autoSuggestTheme` (`BookEditorPage.tsx:861-868`) | a **fifth** theme classifier, inline in a 2,113-line page | maps sticker tag `nature` → `science` and `vehicle` → `adventure`; silently sets `book.theme` on the first sticker of an untagged book. **UX-175** |

**Recommendation (do not move here).** Only #5 is a genuine ARCH-47-shaped duplication, and it does
**not** need `functions/src/shared/` — both copies are already inside `functions/`. The four shared
looks belong in `visualRecipe.ts`, which already owns the *shape*; the two call sites then extend one
base (the book copy adds `props` and page framing, the sticker copy adds nothing). #1/#2 want the
opposite treatment: they are the **server's** two views of a client display table, and the honest fix
is one server-side theme module holding the id → `{storyTone, storyWorldDescription,
storyVocabularyLevel, imageStylePrefix}` record once, imported by both tasks. `PRESET_THEMES` on the
client then keeps only what a person reads (name, emoji, `coverStyle`). #4 is a one-line import.

---

## 6. Question 5 — the vocabulary

Against the Books audit's naming table (`UX_AUDIT_BOOKS_2026-09.md` §4.1: **style** = how a picture is
drawn; **theme** = the book's world tag), *theme* currently means **five** things:

| Meaning | Where | Right word |
|---|---|---|
| the book's story world | `PRESET_THEMES` story triple, the Finish dialog's chips, the shelf filter | **theme** ✔ — keep |
| an image prefix | `PRESET_THEMES.imageStylePrefix`, `PRESET_IMAGE_PREFIXES`, `themeId` on `ImageGenRequest` | **style** — this is a look field wearing a theme's name |
| a sticker look | `THEME_IMAGE_STYLES`, `EnhanceSketchRequest.theme`, `Sticker.theme` (which holds `cartoon`, not a theme at all) | **style** |
| a game's subject | Workshop `inputs.theme` | **subject** / *"what your game is about"* — which is what the step's own heading already says |
| the app's colour scheme | `ThemeMode`, `THEME_KEY` | **colour scheme** (internal only, low priority) |

**The one-line renames that settle it** (all mechanical, none user-facing except the last two):

1. `Sticker.theme` → `Sticker.styleId` — it stores a `FANCY_STYLE_OPTIONS` id.
2. `EnhanceSketchRequest.theme` → `styleId`; `THEME_IMAGE_STYLES` → `PRESET_STYLE_RECIPES`.
3. `ImageGenRequest.themeId` → keep the wire name (it selects a *book theme* record) but rename the
   field it reads from `imageStylePrefix` → `pictureHint`, so nothing calls it a style.
4. Workshop `inputs.theme` → `inputs.subject`.
5. User-facing: `CreateThemeDialog`'s *"What style should pictures be?"* is the only place a person is
   asked for a style inside a theme; if UX-160 is fixed by removing custom themes, the question goes
   with it. If it is fixed by wiring them up, the field is genuinely a style and the dialog should say
   so.

**UX-176.**

---

## 7. Question 6 — what a parent cannot do: describe a look in their own words

**Two free-text look fields already exist**, and their fates are the whole answer:

- The Workshop's **Custom card back** (`CardStyleStep.tsx:26-28`, `workshopArt.ts:403-407`) — typed
  text reaches the prompt verbatim. It works.
- `CreateThemeDialog`'s **"What style should pictures be?"** — typed text reaches nothing (§1c).

**Where it would plug in.** `buildImagePrompt` already takes a third argument for exactly this shape
(`generateImage.ts:242-246`), and the callable already resolves a custom string out of Firestore
(`:360-370`). The missing pieces are (a) somewhere to put it, and (b) a precedence rule. FEAT-174's
rule — *a picked style always wins, a theme fills in only where the style is silent* — is the right
one and should not be reopened: two whole-image style sentences are two art directions.

**The cheapest honest design** is therefore **not** a new field but a **"+ My own look" chip at the end
of the six-style strip**, which sets the style to `general` and opens a one-line box. That makes the
parent's words the *style*, not a theme, so FEAT-174's precedence handles it with no new rule, and the
existing `themeImagePrefix` argument carries it with no signature change.

**What it would cost.**

- *Client:* one chip + one `TextField` in two pickers, one string on `ImageGenRequest`. ~60 lines.
- *Server:* accept and pass the string; **cap and sanitise it** — the existing `rewriteForCopyright`
  pass (`:334`) already covers the user prompt and would need to cover this too, or a parent types a
  franchise name into a field that bypasses the copyright rewriter. That is the real cost, and the
  reason this is a design item and not a batch-A string change.
- *Honesty:* free text has no `styleBlurb`, so `artHelpContent`'s "every look has a line" invariant
  needs an explicit "you wrote this one" case.
- *Kid surfaces:* parent-gated. A kid typing a look is a different design (the readability bar has
  nothing to say about a free-text field).

**UX-177** files it as design, ranked by the owner.

---

## 8. Owner-reported

> *"I'm not sure the themes vary the sketch a lot — cartoon vs fantasy was small."*

**Measured, and correct.** §3 has the numbers. In short: the recipes are not too similar as *text*
(palette overlap is literally zero), but Cartoon and Fantasy are the only two of nine options that name
the **same medium** — watercolor washes with a soft ink line — and medium is what the eye reads first.
Compounding it on this specific surface: the picture is a re-draw of the child's own drawing, so the
palette (the axis that does separate them) is the axis the source most constrains. That is **UX-179**.

A separate defect — three options asking for shadows the transparent-cutout clause removes (**UX-162**)
— was **wrongly folded into this answer in the first draft** and is not the cause here: neither Cartoon
nor Fantasy is among them. See the correction note in §3.

> *"Themes and how they work are worth an examination at some point."*

**They do not work, in three distinct ways.** (1) The word covers five different things (§6). (2) The
*picture* half of a theme is a subject list, which is the failure FEAT-189 just removed from three
styles and which is still live on all fifteen themes (§2). (3) The reach is broken end to end: four ids
resolved to nothing on the picture path until §11, the same four still resolve to nothing on the story
path, six theme recipes are unreachable, and the custom-theme feature cannot reach anything at all.

---

## 9. Notably good

- **`visualRecipe.ts` is the right abstraction, and it worked.** Two independent near-collapse reports
  (FEAT-159 stickers, FEAT-174 books) were fixed by the same three questions, and the mechanical
  separation measure now finds no close pair anywhere. It should absorb the four duplicated recipes
  (§5) rather than be replaced.
- **FEAT-189's `worldPropsClause` + `BOOK_PAGE_FRAMING` split is exactly right.** Each recipe supplies
  only the noun list; the *rule* about those nouns is stated once, so three styles cannot phrase it
  three ways, and the unified-scene guardrail sits where the next style inherits it.
- **PR #1759's `propsIncludeCreatures` opt-in is the best single piece of prompt reasoning in the
  area** (§1a). Faced with a look that needs zombies and a framing that bans characters, it does not
  append an exception — it **selects a different framing so the contradiction is never emitted**, and
  it makes the flag opt-in rather than automatic on every world style, so Minecraft and Platformer
  World (whose props are blocks and pipes) cannot inherit a creature allowance they should not have.
  Every other prompt conflict in this audit — UX-161's "Keep my style", UX-162's cutout shadows — is
  the same class of problem and none of them is handled this well.
- **`buildEnhancePrompt`'s "exactly one full recipe, ever"** (`enhanceSketch.ts:238-260`) is the single
  best-reasoned piece of prompt plumbing in the area, and its comment names the concrete case it
  prevents (a minecraft-themed book at storybook intensity asking for watercolor washes and per-face
  cube shading in one breath).
- **FEAT-174's precedence note** (`generateImage.ts:220-241`) correctly documents that `sight_words` —
  the theme most blamed for overriding a picked style — could never have done it, because it was
  absent from the map. That is the kind of correction that keeps an audit trail honest.
- **`artHelpContent.ts` derives its style list from the pickers** rather than copying it, so a style
  added to a picker cannot go undescribed. Its blurbs are genuinely derived from the server recipes —
  spot-checked against the rendered prompts, they agree on palette, line and shading in all fifteen
  cases.
- **`artHelpStyles` returns `[]` for the Workshop and the Hero Hub** rather than inventing a picker
  that isn't there.

---

## 10. Ranked top ten

| # | ID | P | One line | Batch |
|---|---|---|---|---|
| 1 | **UX-160** | P1 | Custom book themes are a write-only dead end: a parent fills in four fields, no book can ever carry the id, the client never reads the collection, and creating one silently blanks the shelf | B |
| 2 | **UX-179** | P1 | Cartoon and Fantasy are the only two of nine sticker looks naming the **same medium** (watercolor washes + a soft ink line), and the one axis that fully separates them — palette — is the axis a re-draw of the child's own drawing most constrains. **The measured cause of the owner's report** | A ✅ |
| 3 | **UX-161** | P1 | "Keep my style" sends the full watercolor recipe under *"follow it exactly"*; three labelled intensity bands resolve to two styles, two of which are identical; "Full reimagine" says cartoon and sends comic halftones | A ✅ + B |
| 4 | **UX-172** | P1 | Four theme ids still reach the **story** writer as nothing — including `sight_words`, which `inferBookTheme` returns for *every* book made from a word list | B |
| 5 | **UX-166** | P2 | All fifteen theme picture-prefixes are subject lists — the exact shape FEAT-189 removed from three styles, still live one table over, held harmless only by FEAT-174's precedence rule | A ✅ |
| 6 | **UX-167** | P2 | Four look recipes exist twice inside `functions/`, and 8 of their 12 axes have drifted; the help copy asserts two of them are identical | B |
| 7 | **UX-163** | P2 | The Game Workshop sends `style: 'general'` — an empty prefix — for every picture, and the help sheet tells the parent it is "one fixed children's-game look" | A ✅ |
| 8 | **UX-164** | P2 | `book-sticker`, the fixed look behind three paid doors, is adjective-only — the one look never given the `VisualRecipe` treatment | A ✅ |
| 9 | **UX-165** | P2 | "Cover style" renders no cover; its only effect is a hidden regen fallback, where **"Photo Album" is rejected at the callable's argument gate** and the page just fails. Also the reason `PRESET_IMAGE_PREFIXES` is unreachable from every path | B |
| 10 | **UX-162** | P2 | Three of the nine fancy looks ask for cast/long/drop shadows that the transparent-cutout clause removes; two more (`family`, `space`) are ambiguous and need real output to judge | A ⚠️ |

**The rest:** UX-176 ("theme" means five things; five mechanical renames settle it) ·
UX-168 (Blocky sends two paths) · UX-169 (`STYLE_RECIPES.realistic` unreachable) ·
UX-170 (six theme recipes unreachable) · UX-171 (`garden-warfare` ↔ `platformer`, the closest measured
pair — **fixed, FEAT-193**) · UX-173 (`IMAGE STYLE:` reaches the story writer while a different table draws the picture) ·
UX-174 (a fourth copy of `GENERATION_STYLES`) · UX-175 (`autoSuggestTheme`, a fifth classifier, maps to
a dead id) · UX-177 (the free-text look — design) · UX-178 (`schedule-card` / `reward-chart` /
`theme-illustration` have no caller).

---

## 11. The one exception, applied

**A pickable id that reaches the model as nothing is a dishonest control.** Four of the fifteen ids in
the Book Editor's *"Pick a theme (optional):"* chips — `family`, `science`, `sight_words`, `faith` —
were absent from `generateImage.ts`'s `PRESET_IMAGE_PREFIXES` and resolved to no prefix at all. The run
prompt sanctions exactly this fix if it is a four-line copy of the client's existing strings. It is:

```
+ family:      "A warm, cozy children's book illustration of a family together. Soft lighting, happy expressions."
+ science:     "A bright, educational children's book illustration about science. Lab equipment, nature exploration, experiments."
+ sight_words: "A simple, clean children's book illustration. Clear scenes, minimal detail, bold colors."
+ faith:       "A warm, reverent children's book illustration. Gentle light, nature scenes, peaceful atmosphere."
```

Copied **verbatim** from `src/core/types/books.ts`, not abridged to match the eleven neighbours: the
client string is the one a person can read, and abridging would add a fifth variant of one string. The
duplication itself is **not** solved here — it is filed as UX-167 / §5 (batch B).

**Blast radius: none — and that is itself a finding.**

> **Correction, 2026-09-04 — the first draft of this section claimed these entries would fire on the
> `photo` cover-style fallback. They cannot, and a Codex review on PR #1760 caught it.** These entries
> only reach a prompt when the picked style contributes no look (`buildImagePrompt`, FEAT-174), and
> **no caller in the repo produces that state**: `useBookIllustrator` is the only sender of `themeId`
> and always sends a `book-illustration-*` style alongside. The one style that *would* fall through —
> `book-illustration-photo` — is not in the callable's `validStyles`, so that request is rejected at
> the argument gate (`generateImage.ts:301-319`) **before** reaching this map; `useBookIllustrator`
> catches the error per page and marks the page failed (`:252-255`).

So completing the map is **correct data, not a live change**: the fifteen ids a parent can pick now all
have an entry, and the map no longer lies about its own coverage. Making one of them actually reach a
prompt is a **routing** change — send `general` on the photo path, or add `book-illustration-photo` to
`validStyles` and the recipe table — which is a behaviour change well outside a four-line data copy.
Filed as **UX-165**. `functions` build + 50/1219 tests green.

**Deliberately not fixed here:** the same four ids are still missing from `generateStory.ts`'s
`PRESET_THEME_MAP`, so a `sight_words`- or `faith`-themed book still gets no `THEME GUIDANCE`. That is
a **story-prompt** change, outside the sanctioned exception. Filed as **UX-172**.

---

## 12. Fix batches

### Batch A — recipe and copy rewrites (server strings, cheap, no plumbing)

> **All seven done — FEAT-193, 2026-09-04.** Two carry a deliberate remainder,
> named on the item: **UX-162** left `family` and `space` alone (this audit could
> not settle them from the text, and said so), and **UX-161** fixed only the
> captions (161a) — the routing half is 161b, batch B.


1. **UX-179 — the owner's pair, and the highest-leverage single change here.** ✅ **FIXED (FEAT-193).**
   Give `fantasy` a medium
   of its own, or give `cartoon` one; they are the only two watercolors in a nine-option picker.
   Cheapest: move `fantasy` to *"coloured pencil and ink with a soft glow"* and leave `cartoon` as the
   house watercolor. While there, check the three options that name **no** medium at all (`adventure`,
   `faith`, `holidays`/`cooking`/`sports` in the wider table) — a look with no medium separates on
   palette alone, and palette is the axis this surface constrains.
   *Landed:* `fantasy` → **opaque matte gouache**, not the coloured pencil suggested here —
   `family` already owns a pencil-textured line in the same picker, which the new medium rule
   forbids. `cartoon` keeps the house watercolor. `adventure` (acrylic), `faith` (chalk pastel),
   `animals` (marker) and `science` (technical pen) gained one, as did the six unreachable
   recipes, `sight_words` and `STYLE_RECIPES.realistic` — so **every** recipe in both tables
   names a medium and no two options in a picker share one, enforced by `recipeMediums` plus a
   per-picker distinctness test.
2. **UX-162** — ⚠️ **PARTIALLY FIXED (FEAT-193) — `family` and `space` deliberately left.**
   Make the three demonstrably-conflicting recipes cutout-aware: give `VisualRecipe` an
   optional `shadingCutout` used when `transparent`, or rewrite those shading lines to describe shading
   *on the subject* (`faith`: "warm light falling across the form from one side, no cast shadow").
   Before touching `family` and `space`, generate one sticker in each and look — the audit could not
   settle those two from the text.
   *Landed:* the `shadingCutout` route — the book reimagine can still ask for a whole scene,
   where a cast shadow is right, so only the cutout path swaps. Applied to `adventure`, `faith`
   and `science`, plus `sports` and `STYLE_RECIPES.realistic`, which name ground shadows and
   would hit the same defect the moment either became reachable. **`family` and `space` are
   untouched and this item stays open for them** — each needs one real generated sticker, which
   is the owner's call rather than a guess.
3. **UX-166** — ✅ **FIXED (FEAT-193).** Rewrite the fifteen `imageStylePrefix` strings as *hints*, not scenes ("a warm domestic
   picture-book look" rather than "Soft lighting, happy expressions"), so the theme can never be a
   second scene if precedence ever changes.
   *Landed:* both **picture** copies — the client's `PRESET_THEMES` and the server's
   `PRESET_IMAGE_PREFIXES` — rewritten to the same fifteen strings, which also removes the drift
   between those two (still two hand-kept tables; **UX-167 stands**). The server map was hoisted
   out of the callable so a test can read it, no behaviour change. `generateStory.ts`'s third
   copy feeds the *story* writer rather than a picture and is left to UX-172 / UX-173.
4. **UX-163** — ✅ **FIXED (FEAT-193).** Give the Workshop one real look. Simplest honest version: send
   `style: 'book-illustration-storybook'` (or a new `game-art` recipe) instead of `'general'`, and make
   `artHelpContent`'s claim true.
   *Landed:* a new **`game-art`** recipe rather than `book-illustration-storybook` — that style's
   framing bans characters and people, which would break every challenge card and token. It
   carries `UNIFIED_SCENE_RULE` but not `BOOK_PAGE_FRAMING`, and its shading is cutout-safe for
   the transparent parent token. All **five** call sites send it (the fifth is `WorkshopPage`'s
   after-the-words title card), and the inline adjective phrases came out of the prompts in the
   same change — leaving them would put two art directions in one prompt.
5. **UX-164** — ✅ **FIXED (FEAT-193).** Promote `book-sticker` to a `VisualRecipe`.
   *Landed:* flat vector fills, a bold even outline closed all the way round, one turned-away
   tone and one highlight, and no shadow of any kind (it is always transparent). Its
   single-subject rule moved into a separate `STICKER_FRAMING` carrying `UNIFIED_SCENE_RULE`, so
   the recipe answers only the three look questions and "a sticker" cannot come back as a
   *sheet* of them.
6. **UX-161a** — ✅ **FIXED (FEAT-193).** Fix the three reimagine captions so they describe what the style actually does.
   *Landed:* the three captions and both slider end labels ("Keep my style" → *Watercolor look*,
   "Full reimagine" → *Comic-book look*) moved into a pure `reimagineCaptions.ts`;
   `reimagineStyleFor` was extracted verbatim out of the hook so a test holds the copy to the
   routing itself rather than to a copy of it. **161b — three bands, two styles — is untouched
   and stays in batch B.**
7. **UX-171** — ✅ **FIXED (FEAT-193).** Add one structural clause to `garden-warfare` so it does not rest on palette alone.
   *Landed:* *"seen from a low three-quarter view looking slightly down across the ground with
   everything standing upright in real depth"* — deliberately the opposite of Platformer World's
   *"drawn side-on in 2D with no perspective depth"* — plus its own medium (gouache against the
   platformer's vector fills).

### Batch B — plumbing (one source of truth; some of it propose-and-confirm)

8. **UX-160** — decide custom themes: **wire them up** (a "Theme" chip row that includes custom themes
   in the Finish dialog, and read `bookThemes` on the client) or **retire them** (delete
   `CreateThemeDialog`, the "+ New Theme" chip, and the two server custom-theme lookups — the ARCH-07
   precedent). *Recommend retire:* the story-side triple is the half that works, and it already ships
   fifteen presets.
9. **UX-172 + UX-167 + UX-174** — one server theme module; the four shared looks into `visualRecipe.ts`;
   `BookGenerateChat` imports `GENERATION_STYLES`.
10. **UX-161b** — three intensity bands → three distinct styles, or two labelled bands.
11. **UX-165** — either render a cover from `coverStyle` or rename the control and drop `photo` from the
    regen fallback chain.
12. **UX-168 / UX-175** — Blocky sends one path; `autoSuggestTheme` moves out of the page and stops
    mapping to ids the story map does not carry.
13. **UX-169 / UX-170 / UX-178** — delete or wire the unreachable entries.

### Batch C — design + naming (human-ranked)

14. **UX-177** — the free-text look, as the "+ My own look" chip (§7), with the copyright-rewriter cost
    stated up front.
15. **UX-176** — the five renames (§6).

---

*Filed by the FEAT-190 run, 2026-09-04. Read-only except §11. Nothing near quota, hours, XP,
compliance or `firestore.rules`.*

*Batch A landed in full on 2026-09-04 as **FEAT-193** — the seven items above carry a `Landed:`
note each. Two keep a named remainder: `family` and `space` (UX-162) were left for the owner to
judge from a real generated sticker, and UX-161b's routing was left where it was filed. The
audit's measured findings held up under the fix: the medium scan of §3 is now a test
(`recipeMediums`, per picker), and every claim this document makes about what a look sends was
re-checked against the rewritten recipes rather than carried forward.*

*Revised 2026-09-04 after a Codex review on PR #1760 raised two P2s, both of which were verified and
both of which were right: the §11 blast-radius claim was wrong (the `photo` path is rejected at the
argument gate, so the completed map is unreachable — now UX-165), and UX-162 over-claimed (three of
five shadow conflicts are demonstrable, two are ambiguous, and neither of the owner's two options is
among them — the owner's mechanism is split out as UX-179 and UX-162 is demoted to P2).*

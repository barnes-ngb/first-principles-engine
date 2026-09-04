import { GENERATION_STYLES } from './bookTypes'
import { FANCY_STYLE_OPTIONS } from './drawingStickerStyles'

/**
 * Every word of help around image and sticker generation, in one module
 * (FEAT-178).
 *
 * **Why this exists.** The paid image doors had almost no guidance: three
 * `Tooltip`s across six surfaces, one of which was "Change background". The
 * style pickers were bare labels — a label and an emoji and nothing that said
 * what the picture would look like. Nothing said a generation is a paid call
 * with a weekly budget, what counts against it (a whole book spends one call
 * per page; "Make more versions" spends N), or what to do at the cap beyond
 * `ART_QUOTA_MESSAGE`. A parent found out by trying; a kid found out when the
 * button disappeared.
 *
 * **Two audiences, gated on capability.** A kid acting as a kid profile
 * (`useActiveChild().isChildProfile`) reads the `'kid'` copy; everyone else
 * reads `'parent'`. Nothing here reads `isLincoln`, a child's name, or any
 * profile string — the kid text says "you" and never a name.
 *
 * **The kid copy has a readability bar, enforced by
 * `artHelpContent.test.ts`:** every kid line is at most eight words, ends with
 * a period, and contains no word over two syllables by a **vowel-group proxy**.
 * The proxy is deliberately cheap — the repo's real orthographic classifier
 * lives in `functions/src/ai/storyDecodability.ts`, which the app cannot import
 * (it is server-only by design, not in `functions/src/shared/`) — so it counts
 * maximal runs of vowels after stripping a trailing silent `e`/`es`. It
 * over-counts some words and under-counts others; it is a floor on carelessness,
 * not a reading-level measurement, and it is what keeps this copy honest for a
 * six-year-old.
 *
 * **The style blurbs are derived, never paraphrased from memory.** Each one
 * restates the palette / line / shading of the *actual* recipe the server sends
 * for that style, so the help and the prompt agree:
 * `functions/src/ai/imageTasks/generateImage.ts` (`STYLE_PREFIXES` +
 * `BOOK_ILLUSTRATION_RECIPES`) for the book looks, and `enhanceSketch.ts`
 * (`STYLE_RECIPES` + `THEME_IMAGE_STYLES`) for the sticker looks. Where two
 * picker ids resolve to the same recipe they share one blurb, because they
 * genuinely produce the same look.
 *
 * **Budget lines carry no numbers.** The static lines below say what counts and
 * how; the live figures come from the surface's own quota hook through
 * {@link artBudgetLines}, so the sheet can never print a stale hard-coded cap
 * after someone edits `DEFAULT_WEEKLY_ART_QUOTA`.
 *
 * Copy only. Nothing in this module or its sheet triggers a generation, reads
 * Firestore, or touches quota math, a prompt, a style prefix or a write path.
 */

// ── Shapes ──────────────────────────────────────────────────────

/**
 * `workshop` (the Game Workshop's board / adventure / card art) and
 * `avatarPhoto` (the Hero Hub's "Transform!" photo read) joined in FEAT-184 —
 * the two paid doors a kid could reach that had no cap and no word about cost.
 */
export type ArtHelpSurface =
  | 'stickers'
  | 'sketch'
  | 'bookImages'
  | 'generateBook'
  | 'kitArt'
  | 'workshop'
  | 'avatarPhoto'
export type ArtHelpAudience = 'kid' | 'parent'

export interface ArtHelpSection {
  /**
   * Stable id. `'styles'` is the one section whose body is not `lines` — the
   * sheet fills it from {@link artHelpStyles} so a style added to a picker shows
   * up here without a second list to keep in step.
   */
  id: 'what' | 'styles' | 'fit' | 'level' | 'ask' | 'budget' | 'never'
  heading: string
  lines: string[]
}

export interface ArtHelpContent {
  title: string
  sections: ArtHelpSection[]
}

/** One entry in the "what the looks look like" list. */
export interface ArtHelpStyleEntry {
  id: string
  label: string
  emoji?: string
}

/** The paid doors a one-line hint can sit under. */
export type ArtHelpDoor =
  | 'makeSticker'
  | 'makeItFancy'
  | 'addVersion'
  | 'makeVersions'
  | 'bookScene'
  | 'illustrateBook'
  | 'kitArt'
  | 'kitArtBatch'
  /** "Create My Game!" — the batch of pictures a new game makes (FEAT-184). */
  | 'workshopGame'
  /** My Games → "Regenerate Art" — the board set again, for a game missing pieces. */
  | 'workshopRegenerate'
  /** The Hero Hub's "Transform!" — reads one photo into the character's look. */
  | 'avatarPhoto'
  /**
   * The review chat's "Change this" (UX-147): a voice note that rewrites one
   * page and, when the words that describe the scene change with it, redraws
   * that page's picture. The quietest paid door in the area — the kid says
   * "make the dragon green" and pays for a picture — and the only CONDITIONAL
   * one, which is why its hint ignores `count`.
   */
  | 'revisePagePicture'

/** What the surface's quota hook currently says. `remaining` may be `Infinity`. */
export interface ArtBudgetState {
  limit: number
  remaining: number
  /** False for a parent — uncapped, and never subscribed to the counter. */
  capped: boolean
}

// ── Style blurbs ────────────────────────────────────────────────

/**
 * One line per look, per audience — derived from the server recipe that look
 * actually sends (see the module header).
 *
 * `cartoon` (the sticker default) and `storybook` (the book default) resolve to
 * the *same* watercolor recipe — `enhanceSketch.ts` `STYLE_RECIPES.storybook`
 * and `generateImage.ts` `BOOK_ILLUSTRATION_RECIPES["book-illustration-storybook"]`
 * are the same palette, line and shading — so they read alike on purpose.
 * `minecraft` is one key serving both pickers for the same reason.
 *
 * **Why three parent blurbs name an outside game (FEAT-189).** A parent picking
 * "Platformer World" or "Garden Battle" from a bare label has no way to know
 * which look that is; the owner asked for the reference by name. This is
 * descriptive help copy inside the family's own app — it names a reference so a
 * parent can choose between six looks. It never reaches a prompt and never draws
 * the thing: `copyrightUtils.rewriteForCopyright` and the `COPYRIGHT_BLOCK` in
 * `chat.ts` govern generated content and are untouched by this file, which is
 * strings only. The kid blurbs do not carry the reference — they are held to the
 * readability bar and a six-year-old is picking by what the picture looks like.
 *
 * The three world blurbs also state the FEAT-189 set-dressing rule, because that
 * is now what those looks actually do: the props appear where the page's scene
 * allows them and are dropped indoors, keeping the look.
 */
const STYLE_BLURBS: Record<string, Record<ArtHelpAudience, string>> = {
  // ── Book illustration looks (GENERATION_STYLES) ──────────────
  minecraft: {
    parent:
      'Blocky voxel worlds built from cubes with visible pixel steps. One flat tone per cube face — lighter on top, darker on the sides — with no gradients and no outlines. Where a page allows it the scene dresses in blocks and stepped terrain; indoors it keeps the look and drops the props.',
    kid: 'Blocky cubes. Flat colors. No outlines.',
  },
  'garden-warfare': {
    parent:
      'Leaf green and warm yellow in flat cheerful fills, bold rounded outlines with nothing sharp, and simple two-tone shading in broad daylight — in the spirit of Plants vs. Zombies. Where a page allows it the scene dresses in sunflowers, pea shooters and silly cartoon zombies; indoors it keeps the look and drops the props.',
    kid: 'A silly garden battle. Bright and green.',
  },
  storybook: {
    parent:
      'Warm hand-painted watercolor: cream, soft coral and sage, with paper grain showing through. A soft uneven ink line and translucent washes, no hard black shadows.',
    kid: 'Soft paint colors. Gentle lines.',
  },
  platformer: {
    parent:
      'Saturated primaries in flat fills, thick clean outlines around chunky shapes, and flat cel shading drawn side-on in 2D — the classic Mario-style game look. Where a page allows it the scene dresses in brick platforms, green pipes and gold coins; indoors it keeps the look and drops the props.',
    kid: 'A game world. Bricks, pipes and gold coins.',
  },
  comic: {
    parent:
      'High-saturation comic primaries in flat fills, a heavy black ink outline thickest on the silhouettes, hard cel shading and halftone dots. The most graphic of the looks.',
    kid: 'Thick black lines. Bright flat colors.',
  },
  realistic: {
    parent:
      'Naturalistic muted colors with believable wood, stone and fabric. Almost no outline — form comes from soft directional light and gentle cast shadows.',
    kid: 'Looks real. Soft light and shadows.',
  },

  // ── Sticker looks (FANCY_STYLE_OPTIONS) ─────────────────────
  cartoon: {
    parent:
      'The house default: warm hand-painted watercolor, a soft uneven ink line and translucent washes. The same recipe the Storybook book look uses.',
    kid: 'Soft paint colors. Gentle lines.',
  },
  fantasy: {
    parent:
      'Dusty lilac, moss green and candlelight gold with a faint glow around anything magical. A fine tapering ink line and soft washes that bleed past it.',
    kid: 'Soft magic colors. A gentle glow.',
  },
  animals: {
    parent:
      'Warm creams, ginger and soft brown with pink cheek accents. A thick rounded outline with no sharp corners, and simple two-tone shading with visible fur.',
    kid: 'Warm colors. Thick round lines. Soft fur.',
  },
  adventure: {
    parent:
      'Sun-bleached ochre against deep teal shadow with one hot highlight color. A confident varied-weight brush line and strong cast shadows with a bright rim light.',
    kid: 'Bright sun and deep shadows. Bold lines.',
  },
  space: {
    parent:
      'Deep indigo and violet darks with electric cyan and magenta nebula accents. Little outline — forms are defined by glow and bright edge light, with fine star speckles.',
    kid: 'Dark sky. Bright stars and glowing edges.',
  },
  science: {
    parent:
      'Clean primary red, blue and yellow on generous white space. A crisp uniform line like a well-drawn diagram, flat fills and a single soft grey drop shadow.',
    kid: 'Clean flat colors. Neat even lines.',
  },
  faith: {
    parent:
      'Warm amber, ivory and soft olive at low saturation. A soft line drawn in warm brown rather than black, with gentle golden light from one side.',
    kid: 'Warm gold light. Soft brown lines.',
  },
  family: {
    parent:
      'Muted terracotta, wheat and sage — homey and deliberately desaturated. A soft pencil-textured line and diffuse indoor light over a visible paper grain.',
    kid: 'Cozy colors. Soft pencil lines.',
  },
}

/**
 * What a look will actually produce, in one line. Falls back to a plain, honest
 * sentence for an id no blurb covers rather than inventing a description —
 * `artHelpContent.test.ts` asserts every id in both pickers is covered, so the
 * fallback should never render.
 */
export function styleBlurb(styleId: string, audience: ArtHelpAudience): string {
  const blurb = STYLE_BLURBS[styleId]
  if (blurb) return blurb[audience]
  return audience === 'kid' ? 'A look for your picture.' : 'A look for your picture.'
}

/**
 * The looks the given surface can actually pick, with the picker's own labels —
 * derived from `GENERATION_STYLES` / `FANCY_STYLE_OPTIONS` rather than copied,
 * so adding a style to a picker adds it to the help.
 *
 * The Stickers page shares the sketch looks: "Make it fancy", "Add version" and
 * "Make more versions" all draw from the same theme list. The Kit Builder has no
 * style picker at all — its stickers are the fixed `book-sticker` look — so it
 * returns nothing and the sheet omits the section.
 */
export function artHelpStyles(surface: ArtHelpSurface): ArtHelpStyleEntry[] {
  switch (surface) {
    case 'bookImages':
    case 'generateBook':
      return GENERATION_STYLES.map((s) => ({ id: s.value, label: s.label }))
    case 'stickers':
    case 'sketch':
      return FANCY_STYLE_OPTIONS.map((o) => ({ id: o.id, label: o.label, emoji: o.emoji }))
    case 'kitArt':
    case 'workshop':
    case 'avatarPhoto':
      // No style picker on these surfaces: the Workshop's art is one fixed
      // children's-game look and the photo read makes no picture at all.
      return []
  }
}

// ── Shared sections ─────────────────────────────────────────────

/**
 * The budget section — **no numbers, ever**. What counts and how, in words; the
 * live figures come from {@link artBudgetLines} so this copy cannot go stale
 * when `DEFAULT_WEEKLY_ART_QUOTA` moves (it has moved twice already).
 */
function budgetSection(audience: ArtHelpAudience): ArtHelpSection {
  return audience === 'kid'
    ? {
        id: 'budget',
        heading: 'Your art',
        lines: [
          'Art costs money. You get some each week.',
          'Each picture uses one.',
          'A whole book uses one for each page.',
          'Ask a grown-up if you need more.',
        ],
      }
    : {
        id: 'budget',
        heading: 'The art budget',
        lines: [
          'Making a picture costs real money, so each child has a weekly art budget shared across stickers, books and kits — not a separate allowance per surface.',
          'Each picture counts as one. A whole book counts one per page, and a batch counts one per picture it makes.',
          'The budget is a per-child counter that resets at the start of each school week. A parent is not capped and never touches it.',
          'Running out never locks anything free: writing, editing, saving, reading and printing all keep working.',
        ],
      }
}

/** The charter's honesty rail: a surface that writes nothing says so. */
function neverSection(audience: ArtHelpAudience): ArtHelpSection {
  return audience === 'kid'
    ? {
        id: 'never',
        heading: 'What it never does',
        lines: ['It never changes your words.', 'Your school work stays the same.'],
      }
    : {
        id: 'never',
        heading: 'What this never does',
        lines: [
          'Making pictures does not change your words, your sight words, or anything in your school records. It is art, and only art.',
        ],
      }
}

function stylesSection(audience: ArtHelpAudience): ArtHelpSection {
  return {
    id: 'styles',
    heading: audience === 'kid' ? 'What each look does' : 'What each style looks like',
    lines: [],
  }
}

// ── Per-surface content ─────────────────────────────────────────

const CONTENT: Record<ArtHelpSurface, Record<ArtHelpAudience, ArtHelpContent>> = {
  stickers: {
    kid: {
      title: 'How stickers work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Type a few words. Get one sticker.',
            'A photo of your drawing is free.',
            'Make it fancy redraws your drawing.',
            'Add version makes one more look.',
          ],
        },
        stylesSection('kid'),
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Say what it looks like.', 'Do not use a hero name.', 'One idea for each sticker.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How sticker making works',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            '"Make a Sticker" turns a few typed words into one cut-out picture you can drop into a book or print on a sheet.',
            '"From a drawing" photographs a real drawing and cuts it out. That cleanup is free — only "Make it fancy" spends a picture.',
            '"Make it fancy" redraws the same drawing in a look you pick, keeping its shapes, characters and layout.',
            '"Add version" and "Make more versions" each make one more look of a drawing you already have — one picture per tap, and every earlier look stays.',
          ],
        },
        stylesSection('parent'),
        {
          id: 'ask',
          heading: 'How to ask for a good picture',
          lines: [
            'Describe what the thing looks like rather than naming a character: "a green dragon with tiny wings" works where a name from a film gets blocked by the safety filter.',
            'One idea per sticker. Say the look once by tapping it and let the picker carry it.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  sketch: {
    kid: {
      title: 'How fancy drawings work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Cleaning your drawing is free.',
            'Make it fancy makes a new picture.',
            'It keeps your shapes the same.',
            'Make it again makes one more.',
          ],
        },
        stylesSection('kid'),
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Pick one look.', 'Type a name for your drawing.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How "Make it fancy" works',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Photographing, cropping and cleaning up a drawing is free, and the cut-out sticker you get from that costs nothing.',
            '"Make it fancy" is the paid step: it redraws the child\'s drawing in the look you pick and keeps the same composition, characters and layout.',
            '"Make it with this style" is another paid picture, not a free retry — both versions stay saveable.',
          ],
        },
        stylesSection('parent'),
        {
          id: 'ask',
          heading: 'How to get a good one',
          lines: [
            'Crop to the drawing before cleaning. The cleaner reads what is in the frame, so a table edge or a carpet sliver becomes part of the sticker.',
            'Pick one look at a time. The look tapped when you press the button is the one that reaches the picture maker.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  bookImages: {
    kid: {
      title: 'How book pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Make it makes one page picture.',
            'It uses the words you type.',
            'You can redo a page picture.',
            'Adding your own drawing is free.',
          ],
        },
        stylesSection('kid'),
        {
          id: 'fit',
          heading: 'Show the whole picture',
          lines: [
            'Show the whole picture fits it all in.',
            'Fill the page cuts the edges off.',
            'Both live in the picture menu.',
          ],
        },
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Tell it the place.', 'Add your people after.', 'Tap one style.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How book pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            '"Make it" makes one full-page picture for the page you are on, from the words you type.',
            '"Change picture" reopens the picture maker for a page that already has one. The new picture replaces the old one and costs another picture.',
            'When you photograph a drawing, "Reimagine" redraws it as a polished illustration — also a paid picture. Cropping, cleaning and using the drawing as it is are all free.',
            'The sticker picker inside the editor can generate a new sticker too, and that counts the same as any other picture.',
          ],
        },
        stylesSection('parent'),
        {
          id: 'fit',
          heading: 'Show the whole picture, or fill the page',
          lines: [
            '"Show the whole picture" fits the entire image inside the page and fills the leftover space with a blurred, enlarged copy of itself.',
            '"Fill the page" crops the image to the frame. That is the original behaviour and stays the default for every background.',
            'Both live in the wallpaper menu above the page and affect only the full-page picture. Stickers and placed pieces never move, on screen or in the PDF.',
          ],
        },
        {
          id: 'ask',
          heading: 'How to ask for a good picture',
          lines: [
            'Describe the place and the moment, not the character. Every page prompt asks the picture maker for the environment only, and it deliberately draws no people.',
            'Add your characters afterwards with a drawing or a sticker — that is the flow the editor is built for.',
            'Say the style once by tapping it. Writing a style into the words as well gives the picture maker two art directions.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  generateBook: {
    kid: {
      title: 'How story pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'One picture for each story page.',
            'Pages with no scene get skipped.',
            'Your story is saved either way.',
            'Writing the story is free.',
          ],
        },
        stylesSection('kid'),
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Pick a style first.', 'Tell it about the place.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How story pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Writing and revising the story is free. Tapping "Make my book!" saves the book and then makes the pictures — one per page that carries a scene.',
            'A page with no scene is skipped and costs nothing.',
            'If the week\'s budget cannot cover the whole book, nothing is spent at all and the story is still saved. A book that stops half-illustrated is the worse outcome.',
          ],
        },
        stylesSection('parent'),
        {
          // UX-111 — this used to be a 20-word parenthetical inside the draft
          // turn, telling a parent inside a book dialog to walk to a Progress
          // tab she cannot tap through to. The line now just says the level was
          // a guess; how to fix the guess belongs here, with every other
          // explanation FEAT-178 moved behind the "?".
          id: 'level',
          heading: 'The reading level',
          lines: [
            'The story is written to the child\u2019s assessed reading level, and the draft turn says plainly which words came out above it.',
            'With no assessed level the story is sized from age instead, and the draft turn says so. An age guess is the most likely reason a good story gets flagged.',
            'Set a real level under Working Levels on the Skill Snapshot (Progress \u2192 Skill Snapshot) and every story after it is written to that.',
            // FEAT-191 \u2014 the second lever, and where the first one lives. A
            // parent reaching for "one step up" on every single book is telling
            // us the assessed level is stale, and this line says so once.
            '"How hard are the words?" writes just this book one or two rungs above that level, and checks it there too. It never changes the level on the Skill Snapshot \u2014 if every book needs a step up, raise the level itself.',
          ],
        },
        {
          id: 'ask',
          heading: 'How to ask for a good picture',
          lines: [
            'The style strip is the only art control here, and it applies to every page. Pick it before you commit.',
            'Describe places and moments in the idea. The picture maker draws the world, not the people — the characters come from the words on the page.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  kitArt: {
    kid: {
      title: 'How kit stickers work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Make sticker draws one person.',
            'Make the rest draws all of them.',
            'You say yes to the count first.',
            'Doing it again makes one more.',
          ],
        },
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Say what they look like.', 'Your own words go in.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How kit stickers work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            '"Make sticker" draws one character from the name and the words written about them. Typing the kit is free; only the pictures cost.',
            '"Make stickers for the rest" makes one picture for each character that has none yet. You confirm the count before anything is spent.',
            '"Regenerate" replaces a character\'s picture with a new one and costs another picture.',
          ],
        },
        {
          id: 'ask',
          heading: 'How to ask for a good picture',
          lines: [
            'The words typed about a character are what the picture maker sees: "a purple robot with one big eye" gives it far more than a name does.',
            'These are always cut-out stickers on a clear background — there is no style picker here.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  workshop: {
    kid: {
      title: 'How game pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Your game gets a board and cards.',
            'A story game gets scene pictures.',
            'A card game gets the most.',
            'Making the game words is free.',
          ],
        },
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Pick a theme you love.', 'Say what your world looks like.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How game pictures work',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            '"Create My Game!" writes the game first — that part is free — and then makes its pictures. A board game makes the board, a title card, four challenge cards and a token for each grown-up who is playing.',
            'A story adventure makes a title card, up to six scene pictures and a card for each kind of challenge it uses. A card game makes a title, a card back and up to thirteen card faces — the most any game spends.',
            'The pictures are reserved as one batch before any is made. If the week\'s budget cannot cover the whole set, the game is still made — with no pictures — and nothing is spent; "Regenerate Art" in My Games makes them later.',
            'The three writing calls (the game, the adventure, the cards) are not art and are not counted against the budget.',
          ],
        },
        {
          id: 'ask',
          heading: 'How to ask for a good picture',
          lines: [
            'The theme is the one word every picture prompt carries, so a concrete one ("underwater", "dinosaur jungle") draws better than a mood ("fun").',
            'Every picture is made in one children\'s-game look; there is no style picker here.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },

  avatarPhoto: {
    kid: {
      title: 'How your photo works',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            'Pick a photo of you.',
            'Transform reads how you look.',
            'Your hero gets your look.',
            'It uses one art each time.',
          ],
        },
        {
          id: 'ask',
          heading: 'Ask for a good one',
          lines: ['Use a clear photo of your face.', 'Good light helps.'],
        },
        budgetSection('kid'),
        neverSection('kid'),
      ],
    },
    parent: {
      title: 'How the photo transform works',
      sections: [
        {
          id: 'what',
          heading: 'What you get',
          lines: [
            '"Transform!" sends the photo to the picture model once and reads back a set of traits — hair, skin tone, eye colour, glasses — that the 3D character then wears. It makes no picture; the read is what costs.',
            'Choosing a photo and cropping it is free. Only "Transform!" spends, and it spends the same one call each time it is tapped.',
            'The photo and the traits it read are saved on the child\'s avatar profile, and nowhere else.',
          ],
        },
        {
          id: 'ask',
          heading: 'How to get a good read',
          lines: [
            'A clear, well-lit photo of the face, roughly square, reads best — the crop is centred automatically.',
          ],
        },
        budgetSection('parent'),
        neverSection('parent'),
      ],
    },
  },
}

/** The help sheet's whole content for one surface, in one audience's words. */
export function artHelp(surface: ArtHelpSurface, audience: ArtHelpAudience): ArtHelpContent {
  return CONTENT[surface][audience]
}

// ── The live budget line ────────────────────────────────────────

/**
 * The only place a real number is printed. Takes the surface's live `limit` /
 * `remaining` / `capped` straight off its quota hook, so the sheet says what is
 * actually left rather than a figure baked into copy.
 */
export function artBudgetLines(audience: ArtHelpAudience, budget: ArtBudgetState): string[] {
  if (!budget.capped) {
    return audience === 'kid'
      ? ['You have lots of art left.']
      : ['You are not capped. The weekly budget applies to a child signed in as themselves.']
  }
  if (budget.remaining <= 0) {
    return audience === 'kid'
      ? ['You used all your art this week.']
      : ['None left this week. The budget resets at the start of the next school week.']
  }
  return audience === 'kid'
    ? [`You have ${budget.remaining} left this week.`]
    : [`You have ${budget.remaining} left this week, out of ${budget.limit}.`]
}

// ── The one-line hints ──────────────────────────────────────────

const DOOR_SUBJECT: Record<ArtHelpDoor, string> = {
  makeSticker: 'One sticker from your words',
  makeItFancy: 'One new picture of this drawing',
  addVersion: 'One more look of this drawing',
  makeVersions: 'One more look of this drawing',
  bookScene: 'One picture from the words you type',
  illustrateBook: 'One picture per page with a scene',
  kitArt: 'One sticker for this character',
  kitArtBatch: 'One sticker for each character left',
  workshopGame: 'The pictures for this game',
  workshopRegenerate: 'The missing pictures for this game',
  avatarPhoto: 'Reads one photo into your hero\'s look',
  revisePagePicture: "Changes this page's words",
}

/**
 * Doors whose paid call makes no picture. "Makes 1 picture" would be false for
 * the photo read, so the kid sentence names what really happens instead.
 */
const NON_PICTURE_KID_SUBJECT: Partial<Record<ArtHelpDoor, string>> = {
  avatarPhoto: 'Reads your photo.',
}

/**
 * Doors where the picture is a CONSEQUENCE of the tap, not the tap itself, so
 * no count is knowable in advance and neither audience may be promised one.
 * Their hint says "if" rather than "N", and ignores `count` entirely.
 */
const CONDITIONAL_DOORS: ReadonlySet<ArtHelpDoor> = new Set<ArtHelpDoor>([
  'revisePagePicture',
])

/** The conditional wording, one per audience. Held to the same kid bar. */
const CONDITIONAL_HINTS: Record<ArtHelpAudience, string> = {
  kid: 'Changes the words. The picture may change too.',
  parent: "Changes this page's words \u00b7 if the picture is redrawn too, that is 1 paid image call",
}

const STICKER_DOORS: ReadonlySet<ArtHelpDoor> = new Set<ArtHelpDoor>([
  'makeSticker',
  'kitArt',
  'kitArtBatch',
])

/**
 * The caption under a paid generate button: what this tap makes, and what it
 * spends.
 *
 * `count` is live for the batch doors ("Make more versions", illustrate-the-
 * whole-book, "Make stickers for the rest") because those spend N, and a hint
 * that said "1" there would be the exact dishonesty this feature exists to fix.
 *
 * **Zero is a real answer, not a floor to clamp away** (Codex P2, PR #1739). A
 * resumed Generate-a-Book draft is rebuilt from persisted pages with
 * `sceneDescription: p.images?.[0]?.prompt ?? ''` (`useBookGenerateChat.ts`), so
 * a draft whose pages carry no image prompt has **no** scene-bearing page: the
 * illustrate loop skips every one and spends nothing. Clamping that to 1 made
 * the hint promise a picture and a charge that never happen — the same
 * over-statement the live count exists to prevent — so `count: 0` says so
 * plainly instead.
 *
 * **The parent wording never claims a budget deduction** (Codex P2, PR #1739).
 * Every host picks the parent audience from the *same* capability answer that
 * decides the cap (`isChildProfile`, or the Kit Builder's `capped = !canEdit`),
 * and `useArtQuota` makes a parent's `recordGeneration` a no-op — a parent is
 * uncapped and never touches the counter. Saying "1 of your weekly art budget"
 * to them contradicted the very sheet behind the "?", which says they are not
 * capped. "One paid image call" is true for either state and costs the parent
 * no less information: it still says this tap spends money.
 *
 * At the cap the host shows `ART_QUOTA_MESSAGE` **instead of** this — never
 * both.
 */
export function generateHint(
  door: ArtHelpDoor,
  audience: ArtHelpAudience,
  count = 1,
  opts: { atMost?: boolean } = {},
): string {
  // A door whose picture is conditional cannot honestly print a number, so it
  // never reaches the counting path below (UX-147) — `count` and `atMost` are
  // both meaningless there.
  if (CONDITIONAL_DOORS.has(door)) return CONDITIONAL_HINTS[audience]
  const n = Math.max(0, Math.floor(count))
  // FEAT-184: the Workshop's adventure and card-game batches are sized by
  // what the writing step returns, so before that step the honest number is
  // a ceiling. "Up to N" says so; a fixed N would be the over-statement the
  // live count exists to prevent.
  const atMost = Boolean(opts.atMost) && n > 0
  if (audience === 'kid') {
    const kidSubject = NON_PICTURE_KID_SUBJECT[door]
    if (kidSubject) return `${kidSubject} Uses ${n} art.`
    if (n === 0) return 'Makes no pictures. Uses no art.'
    const noun = STICKER_DOORS.has(door) ? 'sticker' : 'picture'
    const made = n === 1 ? `1 ${noun}` : `${n} ${noun}s`
    if (atMost) return `Up to ${made}. Up to ${n} art.`
    return `Makes ${made}. Uses ${n} art.`
  }
  // The door's subject line describes pictures being made, so it is the wrong
  // sentence when none are.
  if (n === 0) return 'No pictures to make here · nothing to pay for'
  const spend = n === 1 ? '1 paid image call' : `${n} paid image calls`
  return `${DOOR_SUBJECT[door]} · ${atMost ? 'up to ' : ''}${spend}`
}

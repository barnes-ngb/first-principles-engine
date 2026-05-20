# Game World Economy Design

## Two-Currency System

The game economy splits the single XP currency into two distinct currencies, modeled after Minecraft:

### XP (Experience)
- **Purpose**: Progression / level — always climbing, never decreases
- **Unlocks**: Tier access (Wood, Stone, Iron, Gold, Diamond, Netherite)
- **Earned from**: All activities (routine + active effort)
- **Cannot be spent** — it's your permanent level

### Diamonds
- **Purpose**: Inventory / currency — earned and spent
- **Used for**: Forging armor pieces, cosmetics, world decorations (future)
- **Earned from**: Active effort activities only (quests, teach-back, Dad Lab, etc.)
- **Spending is placing, not losing** — diamonds become permanent things (forged armor, cosmetics)

## Earn Rate Table

| Activity | XP | Diamonds | Notes |
|---|---|---|---|
| Daily checklist completion | 10 | 0 | Routine — XP only |
| Armor daily ritual | 5 | 0 | Routine — XP only |
| Knowledge Mine quest correct answer | existing | 1 per correct | Active effort |
| Reading a book | 15 | 3 | Active effort |
| Teach-back | 15 | 5 | High-value active effort |
| Dad Lab completion | 20 | 10 | High-value active effort |
| Evaluation apply to snapshot | 25 | 0 | XP only |
| Extra activity logging | 5 | 2 | Active effort |
| Workshop game (playing) | 5 | 3 | Active effort |
| Weekly conundrum response | 5 | 5 | Active effort |

**Rule**: Routine activities (checklist, daily ritual) earn XP only. Active effort activities (quests, teach-back, Dad Lab, creative engagement) earn both XP and Diamonds.

## Forge Costs

Armor pieces are individually forged with diamonds, not auto-given. Lincoln chooses his build order.

### Per Tier, Per Piece (in Diamonds)

| Piece | Wood | Stone | Iron | Gold | Diamond | Netherite |
|---|---|---|---|---|---|---|
| Belt | 5 | 15 | 30 | 50 | 80 | 120 |
| Shoes | 5 | 15 | 30 | 50 | 80 | 120 |
| Breastplate | 8 | 20 | 40 | 65 | 100 | 150 |
| Shield | 8 | 25 | 45 | 70 | 110 | 160 |
| Helmet | 8 | 25 | 45 | 70 | 110 | 160 |
| Sword | 10 | 30 | 50 | 80 | 130 | 200 |

**Total per tier**: 44 | 130 | 240 | 385 | 610 | 910

## Forge Flow

1. XP unlocks the TIER (access to forge pieces in that material)
2. Lincoln chooses which piece to forge
3. Verse reads aloud (existing TTS)
4. Prompt: "Why does a warrior need [piece name]?"
5. Voice record response or tap response chips
6. "Forge it!" button → deducts diamonds → piece appears with animation

## Tier Biomes

Each armor tier maps to a Minecraft-like world/biome:

| Tier | Biome | Description |
|---|---|---|
| Wood | Stonebridge Village | Home base — where every journey begins |
| Stone | The Caves | Deep underground — mine the stone, forge your armor |
| Iron | The Mountains | Towering peaks — a fortress in the clouds |
| Gold | The Desert Temple | Ancient mysteries — treasure beneath the sand |
| Diamond | The End | Beyond the world — floating islands in the void |
| Netherite | The Nether | Fire and lava — the ultimate forge |

## Portal Moments

When Lincoln forges all 6 pieces in a tier AND his XP has reached the next tier's threshold:
1. Full armor celebration (existing)
2. Screen dims, portal visual appears (purple/obsidian Nether portal aesthetic)
3. Text: "A portal opens... Step through to [Next Biome Name]?"
4. Lincoln taps "Enter the portal"
5. Transition animation (screen warp/flash)
6. New tier revealed with biome name and description
7. Armor resets to ghost outlines in new material

## Data Model

### xpLedger entries
- Add `currencyType: 'xp' | 'diamond'` field
- Add optional `category?: 'earn' | 'forge' | 'cosmetic' | 'decoration'` field
- Add optional `itemId?: string` field (references what was purchased)
- Existing entries without `currencyType` are treated as XP (backward compat)

### avatarProfile additions
- `forgedPieces: Record<string, Record<string, { forgedAt: string, verseResponse?: string, verseResponseAudio?: string }>>`
- `unlockedTiers: string[]` — tiers where XP threshold is met
- `currentTier: string` — active tier
- `diamondBalance?: number` — optional cached value

### Diamond balance
- Computed from ledger sum: positive entries = earned, negative entries = spent
- Running balance = sum of all diamond `currencyType` entries

## Future (Not Built Yet)

- Stonebridge world map (2.5D isometric, regions unlock with tiers)
- Diamond shop for cosmetics (dyes, emblems, capes, particles — gated by tier)
- World decorations (place items in Stonebridge with diamonds)
- Pet companion system (wolf/cat/parrot/Sunny)
- London's Workshop games as map locations
- Dad Lab discoveries on map
- Streak bonuses (consecutive day diamonds)
- Verse journal subcollection

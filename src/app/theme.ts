import { createTheme } from '@mui/material/styles'
import type { ThemeOptions } from '@mui/material/styles'
import type { ThemeMode } from '../core/types/enums'

/* ------------------------------------------------------------------ */
/*  Per-mode palette, shape, typography & component overrides          */
/* ------------------------------------------------------------------ */

const familyPalette = {
  primary: { main: '#5c6bc0' },
  secondary: { main: '#7e57c2' },
  background: { default: '#f5f5f7', paper: '#ffffff' },
}

/* Minecraft palette — grass green, dirt brown, stone gray, creeper dark */
const lincolnPalette = {
  primary: { main: '#5A8C32' },
  secondary: { main: '#8B6914' },
  background: { default: '#c6d9a8', paper: '#ede4cf' },
  success: { main: '#7EFC20' },   // XP green (matches in-game XP bar)
  info: { main: '#5DECF5' },      // Diamond cyan
  warning: { main: '#FCDB5B' },   // Gold yellow
}

/* Super Mario palette — Mario red, coin gold, sky blue */
const londonPalette = {
  primary: { main: '#E52521' },
  secondary: { main: '#FBD000' },
  background: { default: '#e3f2fd', paper: '#fff8e1' },
}

const palettes: Record<ThemeMode, typeof familyPalette> = {
  family: familyPalette,
  lincoln: lincolnPalette,
  london: londonPalette,
}

/* Border radius */
const shapes: Record<ThemeMode, number> = {
  family: 12,
  lincoln: 0,   // pixel-perfect blocky — Minecraft blocks have no rounding
  london: 16,   // rounded like pipes, coins, mushrooms
}

/* Heading font families */
const headingFonts: Record<ThemeMode, string> = {
  family: '"Inter", "Roboto", system-ui, sans-serif',
  lincoln: '"Press Start 2P", "Courier New", monospace',
  london: '"Luckiest Guy", "Fredoka", "Comic Neue", system-ui, sans-serif',
}

/* Body font families */
const bodyFonts: Record<ThemeMode, string> = {
  family: '"Inter", "Roboto", system-ui, sans-serif',
  lincoln: '"Space Mono", "Courier New", monospace',
  london: '"Fredoka", "Nunito", system-ui, sans-serif',
}

/* Background patterns — subtle CSS-based repeating patterns */
const backgroundPatterns: Record<ThemeMode, string> = {
  family: 'none',
  // Minecraft dirt/grass block grid with grass-top accent
  lincoln: [
    'linear-gradient(rgba(90,140,50,0.15) 1px, transparent 1px),',
    'linear-gradient(90deg, rgba(90,140,50,0.15) 1px, transparent 1px),',
    'linear-gradient(180deg, rgba(90,140,50,0.06) 0%, transparent 50%)',
  ].join('\n'),
  // Mario sky with subtle cloud puffs
  london: [
    'radial-gradient(',
    '  ellipse 40px 20px at 60px 30px,',
    '  rgba(255,255,255,0.6) 50%,',
    '  transparent 50%',
    '),',
    'radial-gradient(',
    '  ellipse 30px 16px at 40px 34px,',
    '  rgba(255,255,255,0.6) 50%,',
    '  transparent 50%',
    '),',
    'radial-gradient(',
    '  ellipse 30px 16px at 80px 34px,',
    '  rgba(255,255,255,0.6) 50%,',
    '  transparent 50%',
    ')',
  ].join('\n'),
}

const backgroundSizes: Record<ThemeMode, string | undefined> = {
  family: undefined,
  lincoln: '32px 32px, 32px 32px, 100% 100%',   // block grid + grass gradient
  london: '200px 120px',
}

/* ------------------------------------------------------------------ */
/*  buildTheme                                                         */
/* ------------------------------------------------------------------ */

export function buildTheme(mode: ThemeMode) {
  const palette = palettes[mode]
  const headingFont = headingFonts[mode]
  const bodyFont = bodyFonts[mode]

  const options: ThemeOptions = {
    palette: {
      mode: 'light',
      ...palette,
    },
    shape: {
      borderRadius: shapes[mode],
    },
    typography: {
      fontFamily: bodyFont,
      h1: { fontFamily: headingFont, fontWeight: 700 },
      h2: { fontFamily: headingFont, fontWeight: 700 },
      h3: { fontFamily: headingFont, fontWeight: 600 },
      h4: { fontFamily: headingFont, fontWeight: 600 },
      h5: { fontFamily: headingFont, fontWeight: 600 },
      h6: { fontFamily: headingFont, fontWeight: 600 },
      ...(mode === 'lincoln'
        ? {
            h1: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.8rem' },
            h2: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.5rem' },
            h3: { fontFamily: headingFont, fontWeight: 600, fontSize: '1.2rem' },
            h4: { fontFamily: headingFont, fontWeight: 600, fontSize: '1rem' },
            h5: { fontFamily: headingFont, fontWeight: 600, fontSize: '0.85rem' },
            h6: { fontFamily: headingFont, fontWeight: 600, fontSize: '0.75rem' },
          }
        : {}),
      ...(mode === 'london'
        ? {
            h1: { fontFamily: headingFont, fontWeight: 700, letterSpacing: '0.02em' },
            h2: { fontFamily: headingFont, fontWeight: 700, letterSpacing: '0.02em' },
            h3: { fontFamily: headingFont, fontWeight: 600, letterSpacing: '0.01em' },
            h4: { fontFamily: headingFont, fontWeight: 600 },
            h5: { fontFamily: headingFont, fontWeight: 600 },
            h6: { fontFamily: headingFont, fontWeight: 600 },
          }
        : {}),
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: backgroundPatterns[mode],
            ...(backgroundSizes[mode] ? { backgroundSize: backgroundSizes[mode] } : {}),
            ...(mode === 'london'
              ? { backgroundColor: '#6BB5FF' }
              : {}),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none' as const,
            fontWeight: 600,
            borderRadius: shapes[mode],
            // Minecraft: pixel-art flat buttons with hard shadow & thick border
            ...(mode === 'lincoln'
              ? {
                  border: '3px solid rgba(0,0,0,0.25)',
                  boxShadow: '3px 3px 0px rgba(0,0,0,0.3), inset 0 -3px 0 rgba(0,0,0,0.15)',
                  letterSpacing: '0.04em',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '0.7rem',
                  padding: '10px 16px',
                  '&:hover': {
                    boxShadow: '2px 2px 0px rgba(0,0,0,0.3), inset 0 -2px 0 rgba(0,0,0,0.15)',
                    transform: 'translate(1px, 1px)',
                  },
                  '&:active': {
                    boxShadow: 'inset 0 2px 0 rgba(0,0,0,0.2)',
                    transform: 'translate(2px, 2px)',
                  },
                }
              : {}),
            // Super Mario: chunky rounded buttons like ? blocks
            ...(mode === 'london'
              ? {
                  borderRadius: 24,
                  paddingLeft: 24,
                  paddingRight: 24,
                  fontFamily: '"Fredoka", sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  boxShadow: '0 4px 0 rgba(0,0,0,0.2), 0 6px 12px rgba(0,0,0,0.1)',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.12)',
                  },
                  '&:active': {
                    transform: 'translateY(2px)',
                    boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
                  },
                }
              : {}),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: shapes[mode] + 4,
            // Minecraft: stone-block style cards with hard pixel border
            ...(mode === 'lincoln'
              ? {
                  border: '3px solid #7F7F7F',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.2)',
                  borderRadius: 0,
                  backgroundImage: 'linear-gradient(135deg, rgba(139,105,20,0.03) 25%, transparent 25%, transparent 75%, rgba(139,105,20,0.03) 75%)',
                  backgroundSize: '16px 16px',
                }
              : {}),
            // Super Mario: ? block / brick style cards
            ...(mode === 'london'
              ? {
                  border: '3px solid #C8A24E',
                  borderRadius: 20,
                  boxShadow: '0 4px 0 rgba(0,0,0,0.12), 0 6px 20px rgba(229,37,33,0.08)',
                  position: 'relative' as const,
                }
              : {}),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: shapes[mode],
            ...(mode === 'lincoln'
              ? { borderRadius: 0 }
              : {}),
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            // Minecraft: dark oak plank toolbar with crafting-table texture
            ...(mode === 'lincoln'
              ? {
                  borderRadius: 0,
                  borderBottom: '4px solid rgba(0,0,0,0.35)',
                  boxShadow: '0 4px 0 rgba(0,0,0,0.15), inset 0 -1px 0 rgba(139,105,20,0.3)',
                  backgroundImage: 'linear-gradient(90deg, rgba(139,105,20,0.08) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }
              : {}),
            // Mario: pipe green accent bar
            ...(mode === 'london'
              ? {
                  boxShadow: '0 4px 0 rgba(0,0,0,0.15)',
                }
              : {}),
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            ...(mode === 'lincoln'
              ? {
                  borderRadius: 0,
                  border: '2px solid rgba(0,0,0,0.2)',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '0.6rem',
                }
              : {}),
            ...(mode === 'london'
              ? {
                  borderRadius: 20,
                  fontFamily: '"Fredoka", sans-serif',
                  fontWeight: 600,
                }
              : {}),
          },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            // Minecraft: square avatars like player heads
            ...(mode === 'lincoln'
              ? { borderRadius: 0, border: '2px solid rgba(0,0,0,0.3)' }
              : {}),
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            // Minecraft: pixel XP bar style
            ...(mode === 'lincoln'
              ? {
                  height: 10,
                  borderRadius: 0,
                  border: '2px solid rgba(0,0,0,0.3)',
                  backgroundColor: '#1A1A1A',
                }
              : {}),
          },
          bar: {
            ...(mode === 'lincoln'
              ? {
                  borderRadius: 0,
                  background: 'linear-gradient(180deg, #7EFC20 0%, #5BC010 50%, #3A8008 100%)',
                }
              : {}),
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            // Minecraft: inventory slot tabs
            ...(mode === 'lincoln'
              ? {
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '0.55rem',
                  borderRadius: 0,
                  minHeight: 40,
                  textTransform: 'none' as const,
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(90,140,50,0.15)',
                    borderBottom: '3px solid #5A8C32',
                  },
                }
              : {}),
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            // Minecraft: notification toast style
            ...(mode === 'lincoln'
              ? {
                  borderRadius: 0,
                  border: '2px solid rgba(0,0,0,0.2)',
                  fontFamily: '"Space Mono", monospace',
                  boxShadow: '3px 3px 0px rgba(0,0,0,0.15)',
                }
              : {}),
          },
        },
      },
    },
  }

  return createTheme(options)
}

/** Default exported theme (family mode) for backwards compatibility. */
export const theme = buildTheme('family')

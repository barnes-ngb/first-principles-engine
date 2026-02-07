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

const lincolnPalette = {
  primary: { main: '#43a047' },
  secondary: { main: '#66bb6a' },
  background: { default: '#e8f5e9', paper: '#f1f8e9' },
}

const londonPalette = {
  primary: { main: '#e91e63' },
  secondary: { main: '#f06292' },
  background: { default: '#fce4ec', paper: '#fff3e0' },
}

const palettes: Record<ThemeMode, typeof familyPalette> = {
  family: familyPalette,
  lincoln: lincolnPalette,
  london: londonPalette,
}

/* Border radius */
const shapes: Record<ThemeMode, number> = {
  family: 12,
  lincoln: 4,   // blocky / voxel
  london: 20,   // rounded / retro-bubble
}

/* Heading font families */
const headingFonts: Record<ThemeMode, string> = {
  family: '"Inter", "Roboto", system-ui, sans-serif',
  lincoln: '"Space Mono", "Courier New", monospace',
  london: '"Fredoka", "Comic Neue", "Nunito", system-ui, sans-serif',
}

/* Background patterns — subtle CSS-based repeating patterns */
const backgroundPatterns: Record<ThemeMode, string> = {
  family: 'none',
  lincoln: [
    'repeating-linear-gradient(',
    '  45deg,',
    '  transparent,',
    '  transparent 10px,',
    '  rgba(67,160,71,0.04) 10px,',
    '  rgba(67,160,71,0.04) 20px',
    ')',
  ].join('\n'),
  london: [
    'radial-gradient(',
    '  circle 8px at 16px 16px,',
    '  rgba(233,30,99,0.05) 50%,',
    '  transparent 50%',
    ')',
  ].join('\n'),
}

const backgroundSizes: Record<ThemeMode, string | undefined> = {
  family: undefined,
  lincoln: undefined,
  london: '32px 32px',
}

/* ------------------------------------------------------------------ */
/*  buildTheme                                                         */
/* ------------------------------------------------------------------ */

export function buildTheme(mode: ThemeMode) {
  const palette = palettes[mode]
  const headingFont = headingFonts[mode]

  const options: ThemeOptions = {
    palette: {
      mode: 'light',
      ...palette,
    },
    shape: {
      borderRadius: shapes[mode],
    },
    typography: {
      fontFamily: '"Inter", "Roboto", system-ui, sans-serif',
      h1: { fontFamily: headingFont, fontWeight: 700 },
      h2: { fontFamily: headingFont, fontWeight: 700 },
      h3: { fontFamily: headingFont, fontWeight: 600 },
      h4: { fontFamily: headingFont, fontWeight: 600 },
      h5: { fontFamily: headingFont, fontWeight: 600 },
      h6: { fontFamily: headingFont, fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: backgroundPatterns[mode],
            ...(backgroundSizes[mode] ? { backgroundSize: backgroundSizes[mode] } : {}),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none' as const,
            fontWeight: 600,
            borderRadius: shapes[mode],
            ...(mode === 'lincoln'
              ? { boxShadow: '2px 2px 0px rgba(0,0,0,0.15)', letterSpacing: '0.04em' }
              : {}),
            ...(mode === 'london'
              ? { borderRadius: 24, paddingLeft: 20, paddingRight: 20 }
              : {}),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: shapes[mode] + 4,
            ...(mode === 'lincoln'
              ? { border: '2px solid rgba(67,160,71,0.2)', boxShadow: '3px 3px 0px rgba(0,0,0,0.08)' }
              : {}),
            ...(mode === 'london'
              ? { border: '2px solid rgba(233,30,99,0.15)', boxShadow: '0 4px 16px rgba(233,30,99,0.08)' }
              : {}),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: shapes[mode],
          },
        },
      },
    },
  }

  return createTheme(options)
}

/** Default exported theme (family mode) for backwards compatibility. */
export const theme = buildTheme('family')

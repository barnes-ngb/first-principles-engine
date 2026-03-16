import type { BookPage } from '../../core/types/domain'

export const COVER_STYLES = [
  { value: 'storybook', label: 'Storybook' },
  { value: 'minecraft', label: 'Minecraft' },
  { value: 'comic', label: 'Comic Book' },
  { value: 'photo', label: 'Photo Album' },
  { value: 'realistic', label: 'Realistic' },
] as const

/** Styles available for AI-generated book illustrations. */
export const GENERATION_STYLES = [
  { value: 'minecraft', label: 'Minecraft' },
  { value: 'storybook', label: 'Storybook' },
  { value: 'comic', label: 'Comic Book' },
  { value: 'realistic', label: 'Realistic' },
] as const

export const PAGE_LAYOUTS = [
  { value: 'image-top', label: 'Picture on top' },
  { value: 'image-left', label: 'Picture on left' },
  { value: 'full-image', label: 'Full page picture' },
  { value: 'text-only', label: 'Words only' },
] as const

export function generatePageId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export const TEXT_SIZE_STYLES = {
  big: { fontSize: '1.8rem', lineHeight: 1.4 },
  medium: { fontSize: '1.1rem', lineHeight: 1.6 },
  small: { fontSize: '0.9rem', lineHeight: 1.5 },
} as const

export const TEXT_FONT_FAMILIES = {
  handwriting: '"Fredoka", cursive',
  print: 'inherit',
  pixel: '"Press Start 2P", monospace',
} as const

export const TEXT_SIZES = [
  { value: 'big', label: 'Big' },
  { value: 'medium', label: 'Medium' },
  { value: 'small', label: 'Small' },
] as const

export const TEXT_FONTS = [
  { value: 'handwriting', label: 'Handwriting' },
  { value: 'print', label: 'Print' },
  { value: 'pixel', label: 'Pixel' },
] as const

export function createEmptyPage(pageNumber: number): BookPage {
  return {
    id: generatePageId(),
    pageNumber,
    text: '',
    images: [],
    layout: 'image-top',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

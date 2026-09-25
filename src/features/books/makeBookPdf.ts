import { printBook } from './printBook'
import type { PrintBookOptions } from './printBook'
import type { Book } from '../../core/types'

/**
 * Shown when no PDF was made at all. `printBook` loads jsPDF on first use
 * (FIX-253), so an offline device or a tab left open across a deploy can
 * fail here even when every picture was fine.
 */
export const PRINT_FAILED_NOTICE = "Couldn't make the PDF. Please try again."

export function skippedImagesNotice(skippedImageCount: number): string | null {
  if (skippedImageCount <= 0) return null
  return `${skippedImageCount} picture${skippedImageCount === 1 ? '' : 's'} couldn't be printed and ${skippedImageCount === 1 ? 'was' : 'were'} left blank.`
}

/**
 * The one way a book page makes a PDF: runs `printBook` and answers the
 * sentence to show, or `null` when there is nothing to say. Never rejects,
 * so no caller can drop a failure on the floor.
 */
export async function makeBookPdf(
  book: Book,
  options: PrintBookOptions,
  print: typeof printBook = printBook,
): Promise<string | null> {
  try {
    const { skippedImageCount } = await print(book, options)
    return skippedImagesNotice(skippedImageCount)
  } catch (err) {
    console.error('Make a PDF failed', err)
    return PRINT_FAILED_NOTICE
  }
}

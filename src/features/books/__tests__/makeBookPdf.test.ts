import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Book } from '../../../core/types'
import { makeBookPdf, PRINT_FAILED_NOTICE, skippedImagesNotice } from '../makeBookPdf'

const book = { id: 'b1', title: 'T', pages: [] } as unknown as Book
const opts = { childName: 'Kid', isLincoln: false }

describe('makeBookPdf (FIX-253)', () => {
  it('says nothing when every picture printed', async () => {
    const print = vi.fn().mockResolvedValue({ skippedImageCount: 0 })
    await expect(makeBookPdf(book, opts, print)).resolves.toBeNull()
    expect(print).toHaveBeenCalledWith(book, opts)
  })

  it('names skipped pictures, singular and plural', async () => {
    expect(await makeBookPdf(book, opts, vi.fn().mockResolvedValue({ skippedImageCount: 1 }))).toBe(
      "1 picture couldn't be printed and was left blank.",
    )
    expect(skippedImagesNotice(3)).toBe("3 pictures couldn't be printed and were left blank.")
  })

  it('turns a failed lazy jsPDF load into a sentence instead of a rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const print = vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'))
    await expect(makeBookPdf(book, opts, print)).resolves.toBe(PRINT_FAILED_NOTICE)
  })

  it('every book page makes its PDF through the wrapper, never printBook directly', () => {
    for (const page of ['BookshelfPage', 'BookEditorPage', 'BookReaderPage']) {
      const src = readFileSync(resolve(__dirname, `../${page}.tsx`), 'utf8')
      expect(src, page).toMatch(/await makeBookPdf\(/)
      expect(src, page).not.toMatch(/\bprintBook\(/)
    }
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'

const { uploadBytesMock, deleteObjectMock, getMetadataMock, refMock, getDocMock } = vi.hoisted(
  () => ({
    uploadBytesMock: vi.fn(async () => undefined),
    deleteObjectMock: vi.fn(async () => undefined),
    getMetadataMock: vi.fn(async () => ({ updated: '2026-07-18T12:00:00.000Z' })),
    refMock: vi.fn((_storage: unknown, path: string) => ({ path })),
    getDocMock: vi.fn(),
  }),
)

vi.mock('firebase/storage', () => ({
  ref: refMock,
  uploadBytes: uploadBytesMock,
  deleteObject: deleteObjectMock,
  getMetadata: getMetadataMock,
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_collection: unknown, id: string) => ({ id })),
  getDoc: getDocMock,
}))

vi.mock('../../core/firebase/firestore', () => ({
  booksCollection: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/storage', () => ({
  storage: {
    app: { options: { storageBucket: 'test-bucket.appspot.com', projectId: 'test-project' } },
  },
}))

import {
  catalogOrderEndpoint,
  getPublishedState,
  publicCatalogPath,
  publicCatalogUrl,
  publishCatalogSite,
  unpublishCatalogSite,
} from './catalogSitePublish'

const FAMILY = 'fam-1'
const PATH = publicCatalogPath(FAMILY)

const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
  id: 'p1',
  title: 'Seed Vault Kit',
  type: 'StarterKit',
  description: '',
  priceCents: 0,
  images: [],
  madeBy: ['Lincoln'],
  status: 'listed',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  uploadBytesMock.mockClear()
  deleteObjectMock.mockClear()
  getMetadataMock.mockClear()
  refMock.mockClear()
  getDocMock.mockReset()
})

/** Read the HTML back out of the single uploaded Blob. */
async function uploadedHtml(): Promise<string> {
  const [, blob] = uploadBytesMock.mock.calls[0] as unknown as [unknown, Blob]
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsText(blob)
  })
}

describe('publicCatalogUrl', () => {
  it('is a stable, token-less URL at the per-family public path', () => {
    const url = publicCatalogUrl(FAMILY)
    expect(url).toContain('test-bucket.appspot.com')
    expect(url).toContain(encodeURIComponent(PATH))
    expect(PATH).toContain(FAMILY)
    expect(url).not.toContain('token')
  })
})

describe('publishCatalogSite', () => {
  it('uploads a text/html page to the public catalog path and returns the URL + time', async () => {
    const state = await publishCatalogSite(FAMILY, [product({ title: 'Listed Kit', status: 'listed' })])

    expect(refMock).toHaveBeenCalledWith(expect.anything(), PATH)
    expect(uploadBytesMock).toHaveBeenCalledTimes(1)
    const [, blob, meta] = uploadBytesMock.mock.calls[0] as unknown as [unknown, Blob, { contentType: string }]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toContain('text/html')
    expect(meta.contentType).toContain('text/html')
    expect(state.url).toBe(publicCatalogUrl(FAMILY))
    expect(state.publishedAt).toBe('2026-07-18T12:00:00.000Z')
  })

  it('renders the listed products into the uploaded HTML (drafts excluded)', async () => {
    await publishCatalogSite(FAMILY, [
      product({ id: 'a', title: 'Listed Kit', status: 'listed' }),
      product({ id: 'b', title: 'Draft Kit', status: 'draft' }),
    ])
    const [, blob] = uploadBytesMock.mock.calls[0] as unknown as [unknown, Blob]
    const html = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(blob)
    })
    expect(html).toContain('Listed Kit')
    expect(html).not.toContain('Draft Kit')
  })

  it('bakes an opt-in book preview inline — cover + first N pages, capped, priced CTA', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      id: 'book-9',
      data: () => ({
        title: 'Tom Tom',
        coverImageUrl: 'https://cdn/cover.png',
        pages: [
          { pageNumber: 1, text: 'Page one', images: [{ url: 'https://cdn/p1.png' }] },
          { pageNumber: 2, text: 'Page two', images: [{ url: 'https://cdn/p2.png' }] },
          { pageNumber: 3, text: 'Page three', images: [{ url: 'https://cdn/p3.png' }] },
          { pageNumber: 4, text: 'Secret ending', images: [{ url: 'https://cdn/p4.png' }] },
        ],
      }),
    })

    await publishCatalogSite(FAMILY, [
      product({
        id: 'p-book',
        title: 'Tom Tom the Crab',
        type: 'Book',
        status: 'listed',
        priceCents: 800,
        includePreview: true,
        previewPageCount: 2,
        sourceRef: { kind: 'book', id: 'book-9' },
      }),
    ])

    const html = await uploadedHtml()
    // Cover + exactly the first 2 pages (capped) hotlinked; page 3+ withheld.
    expect(html).toContain('Peek inside')
    expect(html).toContain('https://cdn/cover.png')
    expect(html).toContain('https://cdn/p1.png')
    expect(html).toContain('https://cdn/p2.png')
    expect(html).not.toContain('https://cdn/p3.png')
    expect(html).not.toContain('Secret ending')
    // Warm, priced CTA — never the whole book.
    expect(html).toContain('The real book is $8.00')
  })

  it('does not fetch or render a preview for a product that did not opt in', async () => {
    await publishCatalogSite(FAMILY, [
      product({
        id: 'p-book',
        title: 'No Peek Book',
        type: 'Book',
        status: 'listed',
        sourceRef: { kind: 'book', id: 'book-1' },
      }),
    ])
    expect(getDocMock).not.toHaveBeenCalled()
    const html = await uploadedHtml()
    expect(html).not.toContain('Peek inside')
  })

  it('publishes without a peek when the source book is missing (never blocks)', async () => {
    getDocMock.mockResolvedValue({ exists: () => false })
    const state = await publishCatalogSite(FAMILY, [
      product({
        id: 'p-book',
        title: 'Ghost Book',
        type: 'Book',
        status: 'listed',
        includePreview: true,
        sourceRef: { kind: 'book', id: 'gone' },
      }),
    ])
    expect(state.url).toBe(publicCatalogUrl(FAMILY))
    const html = await uploadedHtml()
    expect(html).toContain('Ghost Book')
    expect(html).not.toContain('Peek inside')
  })
})

describe('catalogOrderEndpoint (FEAT-89)', () => {
  it('builds the deterministic us-central1 cloudfunctions URL for the project', () => {
    expect(catalogOrderEndpoint('test-project')).toBe(
      'https://us-central1-test-project.cloudfunctions.net/submitCatalogOrder',
    )
  })
})

describe('publishCatalogSite — order form baking (FEAT-89)', () => {
  it('bakes the order endpoint + familyId into the published page', async () => {
    await publishCatalogSite(FAMILY, [product({ title: 'Listed Kit', status: 'listed' })])
    const html = await uploadedHtml()
    expect(html).toContain('<form id="orderForm"')
    expect(html).toContain(catalogOrderEndpoint('test-project'))
    expect(html).toContain(`"familyId":"${FAMILY}"`)
    // FEAT-92: the interactive card now carries a qty stepper (not the old toggle).
    expect(html).toContain('qty-row')
  })
})

describe('getPublishedState', () => {
  it('returns the state when the page exists', async () => {
    const state = await getPublishedState(FAMILY)
    expect(state).toEqual({ url: publicCatalogUrl(FAMILY), publishedAt: '2026-07-18T12:00:00.000Z' })
  })

  it('returns null when the page was never published (object-not-found)', async () => {
    getMetadataMock.mockRejectedValueOnce(new Error('storage/object-not-found'))
    expect(await getPublishedState(FAMILY)).toBeNull()
  })
})

describe('unpublishCatalogSite', () => {
  it('deletes the published page', async () => {
    await unpublishCatalogSite(FAMILY)
    expect(deleteObjectMock).toHaveBeenCalledTimes(1)
    expect(refMock).toHaveBeenCalledWith(expect.anything(), PATH)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogProduct } from '../../core/types/business'

const { uploadBytesMock, deleteObjectMock, getMetadataMock, refMock } = vi.hoisted(() => ({
  uploadBytesMock: vi.fn(async () => undefined),
  deleteObjectMock: vi.fn(async () => undefined),
  getMetadataMock: vi.fn(async () => ({ updated: '2026-07-18T12:00:00.000Z' })),
  refMock: vi.fn((_storage: unknown, path: string) => ({ path })),
}))

vi.mock('firebase/storage', () => ({
  ref: refMock,
  uploadBytes: uploadBytesMock,
  deleteObject: deleteObjectMock,
  getMetadata: getMetadataMock,
}))

vi.mock('../../core/firebase/storage', () => ({
  storage: { app: { options: { storageBucket: 'test-bucket.appspot.com' } } },
}))

import {
  getPublishedState,
  PUBLIC_CATALOG_PATH,
  publicCatalogUrl,
  publishCatalogSite,
  unpublishCatalogSite,
} from './catalogSitePublish'

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
})

describe('publicCatalogUrl', () => {
  it('is a stable, token-less URL at the public path', () => {
    const url = publicCatalogUrl()
    expect(url).toContain('test-bucket.appspot.com')
    expect(url).toContain(encodeURIComponent(PUBLIC_CATALOG_PATH))
    expect(url).not.toContain('token')
  })
})

describe('publishCatalogSite', () => {
  it('uploads a text/html page to the public catalog path and returns the URL + time', async () => {
    const state = await publishCatalogSite([product({ title: 'Listed Kit', status: 'listed' })])

    expect(refMock).toHaveBeenCalledWith(expect.anything(), PUBLIC_CATALOG_PATH)
    expect(uploadBytesMock).toHaveBeenCalledTimes(1)
    const [, blob, meta] = uploadBytesMock.mock.calls[0] as unknown as [unknown, Blob, { contentType: string }]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toContain('text/html')
    expect(meta.contentType).toContain('text/html')
    expect(state.url).toBe(publicCatalogUrl())
    expect(state.publishedAt).toBe('2026-07-18T12:00:00.000Z')
  })

  it('renders the listed products into the uploaded HTML (drafts excluded)', async () => {
    await publishCatalogSite([
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
})

describe('getPublishedState', () => {
  it('returns the state when the page exists', async () => {
    const state = await getPublishedState()
    expect(state).toEqual({ url: publicCatalogUrl(), publishedAt: '2026-07-18T12:00:00.000Z' })
  })

  it('returns null when the page was never published (object-not-found)', async () => {
    getMetadataMock.mockRejectedValueOnce(new Error('storage/object-not-found'))
    expect(await getPublishedState()).toBeNull()
  })
})

describe('unpublishCatalogSite', () => {
  it('deletes the published page', async () => {
    await unpublishCatalogSite()
    expect(deleteObjectMock).toHaveBeenCalledTimes(1)
    expect(refMock).toHaveBeenCalledWith(expect.anything(), PUBLIC_CATALOG_PATH)
  })
})

import { describe, it, expect } from 'vitest'

import {
  readerDocumentKey,
  readerIdentityKey,
  readerSessionKey,
  resolveReaderSession,
  nextReaderSession,
  readerSessionAdmits,
  readerSessionCovers,
  readerSessionLabel,
  ReaderOwnership,
  type ReaderIdentityInputs,
  type ReaderSession,
  type ReaderSessionIdentity,
} from './readerSession'

// ── helpers ──────────────────────────────────────────────────────

function childInputs(overrides: Partial<ReaderIdentityInputs> = {}): ReaderIdentityInputs {
  return {
    familyId: 'fam-1',
    book: { id: 'book-1', childId: 'london' },
    documentProven: true,
    isChildProfile: true,
    activeChildId: 'lincoln',
    activeChildName: 'Lincoln',
    identitySettled: true,
    identityFailed: false,
    ...overrides,
  }
}

function parentInputs(overrides: Partial<ReaderIdentityInputs> = {}): ReaderIdentityInputs {
  return {
    familyId: 'fam-1',
    book: { id: 'book-1', childId: 'london' },
    documentProven: true,
    isChildProfile: false,
    activeChildId: 'lincoln',
    activeChildName: 'Lincoln',
    identitySettled: true,
    identityFailed: false,
    ...overrides,
  }
}

function makeSession(overrides: Partial<ReaderSession> = {}): ReaderSession {
  return {
    id: 1,
    key: 'fam-1|book-1|child-reader|lincoln',
    questionId: 1,
    familyId: 'fam-1',
    bookId: 'book-1',
    readerChildId: 'lincoln',
    readerName: 'Lincoln',
    ownership: ReaderOwnership.ChildReader,
    ...overrides,
  }
}

// ── readerDocumentKey ────────────────────────────────────────────

describe('readerDocumentKey', () => {
  it('joins familyId and bookId with a pipe', () => {
    expect(readerDocumentKey('fam-1', 'book-1')).toBe('fam-1|book-1')
  })

  it('uses empty string when bookId is undefined', () => {
    expect(readerDocumentKey('fam-1', undefined)).toBe('fam-1|')
  })

  it('handles empty familyId', () => {
    expect(readerDocumentKey('', 'book-1')).toBe('|book-1')
  })
})

// ── readerIdentityKey ────────────────────────────────────────────

describe('readerIdentityKey', () => {
  it('child profile includes profile and activeChildId', () => {
    expect(readerIdentityKey(true, 'prof-lincoln', 'child-1')).toBe(
      'child|prof-lincoln|child-1',
    )
  })

  it('parent profile excludes activeChildId — switching child does not change identity', () => {
    expect(readerIdentityKey(false, 'prof-parent', 'child-1')).toBe(
      'parent|prof-parent',
    )
    expect(readerIdentityKey(false, 'prof-parent', 'child-2')).toBe(
      'parent|prof-parent',
    )
  })

  it('null profile produces empty segment', () => {
    expect(readerIdentityKey(true, null, 'child-1')).toBe('child||child-1')
    expect(readerIdentityKey(false, null, 'child-1')).toBe('parent|')
  })
})

// ── readerSessionKey ─────────────────────────────────────────────

describe('readerSessionKey', () => {
  it('encodes all four identity fields', () => {
    const identity: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'lincoln',
      readerName: 'Lincoln',
      ownership: ReaderOwnership.ChildReader,
    }
    expect(readerSessionKey(identity)).toBe('fam-1|book-1|child-reader|lincoln')
  })

  it('book-owner key differs from child-reader key on the same document', () => {
    const child: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'lincoln',
      readerName: 'Lincoln',
      ownership: ReaderOwnership.ChildReader,
    }
    const parent: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'lincoln',
      readerName: '',
      ownership: ReaderOwnership.BookOwner,
    }
    expect(readerSessionKey(child)).not.toBe(readerSessionKey(parent))
  })
})

// ── resolveReaderSession ─────────────────────────────────────────

describe('resolveReaderSession', () => {
  describe('null-returning branches', () => {
    it('returns null when familyId is empty', () => {
      expect(resolveReaderSession(childInputs({ familyId: '' }))).toBeNull()
    })

    it('returns null when book is null', () => {
      expect(resolveReaderSession(childInputs({ book: null }))).toBeNull()
    })

    it('returns null when book is undefined', () => {
      expect(resolveReaderSession(childInputs({ book: undefined }))).toBeNull()
    })

    it('returns null when document is not proven', () => {
      expect(resolveReaderSession(childInputs({ documentProven: false }))).toBeNull()
    })

    it('returns null for child profile when identity not settled', () => {
      expect(
        resolveReaderSession(childInputs({ identitySettled: false })),
      ).toBeNull()
    })

    it('returns null for child profile when identity failed', () => {
      expect(
        resolveReaderSession(childInputs({ identityFailed: true })),
      ).toBeNull()
    })

    it('returns null for child profile when activeChildId is empty', () => {
      expect(
        resolveReaderSession(childInputs({ activeChildId: '' })),
      ).toBeNull()
    })

    it('returns null for parent when book has no childId', () => {
      expect(
        resolveReaderSession(parentInputs({ book: { id: 'book-1', childId: '' } })),
      ).toBeNull()
    })
  })

  describe('child profile — ChildReader ownership', () => {
    it('resolves to the active child, not the book owner', () => {
      const result = resolveReaderSession(childInputs())
      expect(result).not.toBeNull()
      expect(result!.ownership).toBe(ReaderOwnership.ChildReader)
      expect(result!.readerChildId).toBe('lincoln')
      expect(result!.readerName).toBe('Lincoln')
      expect(result!.bookId).toBe('book-1')
      expect(result!.familyId).toBe('fam-1')
    })

    it('uses activeChildId even on a sibling-owned book', () => {
      const result = resolveReaderSession(
        childInputs({
          book: { id: 'book-london', childId: 'london' },
          activeChildId: 'lincoln',
          activeChildName: 'Lincoln',
        }),
      )
      expect(result!.readerChildId).toBe('lincoln')
      expect(result!.ownership).toBe(ReaderOwnership.ChildReader)
    })

    it('does not depend on the book childId at all', () => {
      const withoutBookChild = resolveReaderSession(
        childInputs({ book: { id: 'book-1', childId: '' } }),
      )
      expect(withoutBookChild).not.toBeNull()
      expect(withoutBookChild!.readerChildId).toBe('lincoln')
    })
  })

  describe('parent profile — BookOwner ownership', () => {
    it('resolves to the book owner, with empty readerName', () => {
      const result = resolveReaderSession(parentInputs())
      expect(result).not.toBeNull()
      expect(result!.ownership).toBe(ReaderOwnership.BookOwner)
      expect(result!.readerChildId).toBe('london')
      expect(result!.readerName).toBe('')
    })

    it('is NOT gated on identitySettled — parent does not wait for children read', () => {
      const result = resolveReaderSession(
        parentInputs({ identitySettled: false, identityFailed: false }),
      )
      expect(result).not.toBeNull()
      expect(result!.ownership).toBe(ReaderOwnership.BookOwner)
    })

    it('is NOT gated on identityFailed — parent does not depend on children', () => {
      const result = resolveReaderSession(
        parentInputs({ identityFailed: true }),
      )
      expect(result).not.toBeNull()
    })
  })
})

// ── nextReaderSession ────────────────────────────────────────────

describe('nextReaderSession', () => {
  it('increments the id by 1', () => {
    const identity: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'lincoln',
      readerName: 'Lincoln',
      ownership: ReaderOwnership.ChildReader,
    }
    const session = nextReaderSession(5, 3, identity)
    expect(session.id).toBe(6)
    expect(session.questionId).toBe(3)
    expect(session.key).toBe(readerSessionKey(identity))
    expect(session.familyId).toBe('fam-1')
    expect(session.bookId).toBe('book-1')
    expect(session.readerChildId).toBe('lincoln')
  })

  it('starts from 0 for the first session', () => {
    const identity: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'london',
      readerName: '',
      ownership: ReaderOwnership.BookOwner,
    }
    const session = nextReaderSession(0, 1, identity)
    expect(session.id).toBe(1)
  })
})

// ── readerSessionAdmits ──────────────────────────────────────────

describe('readerSessionAdmits', () => {
  it('returns true when both are the same incarnation', () => {
    const session = makeSession({ id: 3 })
    expect(readerSessionAdmits(session, session)).toBe(true)
  })

  it('returns true for separate objects with the same id', () => {
    expect(
      readerSessionAdmits(makeSession({ id: 7 }), makeSession({ id: 7 })),
    ).toBe(true)
  })

  it('returns false when ids differ', () => {
    expect(
      readerSessionAdmits(makeSession({ id: 2 }), makeSession({ id: 3 })),
    ).toBe(false)
  })

  it('returns false when live is null', () => {
    expect(readerSessionAdmits(null, makeSession())).toBe(false)
  })

  it('returns false when incarnation is null', () => {
    expect(readerSessionAdmits(makeSession(), null)).toBe(false)
  })

  it('returns false when both are null', () => {
    expect(readerSessionAdmits(null, null)).toBe(false)
  })
})

// ── readerSessionCovers ──────────────────────────────────────────

describe('readerSessionCovers', () => {
  it('returns true when session matches familyId and bookId', () => {
    const session = makeSession({ familyId: 'fam-1', bookId: 'book-1' })
    expect(readerSessionCovers(session, 'fam-1', { id: 'book-1' })).toBe(true)
  })

  it('returns false when familyId mismatches', () => {
    const session = makeSession({ familyId: 'fam-1', bookId: 'book-1' })
    expect(readerSessionCovers(session, 'fam-other', { id: 'book-1' })).toBe(false)
  })

  it('returns false when bookId mismatches', () => {
    const session = makeSession({ familyId: 'fam-1', bookId: 'book-1' })
    expect(readerSessionCovers(session, 'fam-1', { id: 'book-other' })).toBe(false)
  })

  it('returns false when session is null', () => {
    expect(readerSessionCovers(null, 'fam-1', { id: 'book-1' })).toBe(false)
  })

  it('returns false when book is null', () => {
    expect(readerSessionCovers(makeSession(), 'fam-1', null)).toBe(false)
  })

  it('returns false when book is undefined', () => {
    expect(readerSessionCovers(makeSession(), 'fam-1', undefined)).toBe(false)
  })
})

// ── readerSessionLabel ───────────────────────────────────────────

describe('readerSessionLabel', () => {
  it('child-reader returns the frozen readerName', () => {
    const identity: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'lincoln',
      readerName: 'Lincoln',
      ownership: ReaderOwnership.ChildReader,
    }
    expect(readerSessionLabel(identity, 'London')).toBe('Lincoln')
  })

  it('book-owner returns the legacy active child name', () => {
    const identity: ReaderSessionIdentity = {
      familyId: 'fam-1',
      bookId: 'book-1',
      readerChildId: 'london',
      readerName: '',
      ownership: ReaderOwnership.BookOwner,
    }
    expect(readerSessionLabel(identity, 'London')).toBe('London')
  })
})

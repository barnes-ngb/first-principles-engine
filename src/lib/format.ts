const formatYmd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export const formatDateYmd = (date: Date) =>
  formatYmd(date.getFullYear(), date.getMonth() + 1, date.getDate())

export const parseDateYmd = (value: string) => {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(year, month - 1, day)

  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null
  }

  return candidate
}

const resolveDateValue = (value: Date | string) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = parseDateYmd(value)
  if (parsed) return parsed

  const fallback = new Date(value)
  if (Number.isNaN(fallback.getTime())) return null
  return fallback
}

export const formatDateForUi = (value: Date | string) => {
  const date = resolveDateValue(value)
  return date ? formatDateYmd(date) : ''
}

export const formatDateForCsv = (value: Date | string) => {
  const date = resolveDateValue(value)
  return date ? formatDateYmd(date) : ''
}

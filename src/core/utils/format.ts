const pad2 = (value: number) => String(value).padStart(2, '0')

export const formatDateYmd = (date: Date) => {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return `${year}-${month}-${day}`
}

export const parseDateYmd = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
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

export const normalizeDateString = (value: string) => {
  const parsed = parseDateYmd(value)
  return parsed ? formatDateYmd(parsed) : value
}

export const formatDateForInput = (value: Date | string) => {
  if (typeof value === 'string') {
    return normalizeDateString(value)
  }
  return formatDateYmd(value)
}

export const formatDateForCsv = (value: Date | string) => formatDateForInput(value)

export const parseDateInput = (value: string) => parseDateYmd(value)

export const toCsvValue = (value: string | number | null | undefined) => {
  const stringValue = `${value ?? ''}`
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

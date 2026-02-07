const UI_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
})

const CSV_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const parseDateInput = (value: string): Date | null => {
  if (!value) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

export const formatDateForInput = (date: Date): string =>
  date.toISOString().slice(0, 10)

export const formatDateForUi = (date: Date): string =>
  UI_DATE_FORMATTER.format(date)

export const formatDateForCsv = (date: Date): string =>
  CSV_DATE_FORMATTER.format(date)

export const escapeCsvValue = (
  value: string | number | null | undefined,
): string => {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

export interface DateRange {
  start: Date
  end: Date
}

const createUtcDate = (year: number, monthIndex: number, day: number): Date =>
  new Date(Date.UTC(year, monthIndex, day))

const stripTimeToUtc = (date: Date): Date =>
  createUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

export const getCurrentSchoolYearRange = (today: Date = new Date()): DateRange => {
  const utcToday = stripTimeToUtc(today)
  const year = utcToday.getUTCFullYear()
  const schoolYearStart = createUtcDate(year, 6, 1)

  if (utcToday >= schoolYearStart) {
    return {
      start: schoolYearStart,
      end: createUtcDate(year + 1, 5, 30),
    }
  }

  return {
    start: createUtcDate(year - 1, 6, 1),
    end: createUtcDate(year, 5, 30),
  }
}

import { formatDateYmd } from './format'

type SchoolYearRange = {
  start: string
  end: string
}

export const getSchoolYearRange = (today = new Date()): SchoolYearRange => {
  const year = today.getFullYear()
  const monthIndex = today.getMonth()
  const isAfterJune = monthIndex >= 6
  const startYear = isAfterJune ? year : year - 1
  const endYear = isAfterJune ? year + 1 : year

  return {
    start: formatDateYmd(new Date(startYear, 6, 1)),
    end: formatDateYmd(new Date(endYear, 5, 30)),
  }
}

import { formatDateYmd } from './format'

export type WeekRange = {
  start: string
  end: string
}

export const getWeekRange = (date: Date = new Date(), weekStartsOn = 1): WeekRange => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfWeek = start.getDay()
  const offset = (dayOfWeek - weekStartsOn + 7) % 7
  start.setDate(start.getDate() - offset)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: formatDateYmd(start),
    end: formatDateYmd(end),
  }
}

type SchoolYearRange = {
  start: string
  end: string
}

export const getSchoolYearRange = (today: Date = new Date()): SchoolYearRange => {
  const year = today.getFullYear()
  const monthIndex = today.getMonth()
  const isAfterJune = monthIndex >= 6
  const startYear = isAfterJune ? year : year - 1
  const endYear = isAfterJune ? year + 1 : year

  const startDate = new Date(startYear, 6, 1)
  const endDate = new Date(endYear, 5, 30)

  return {
    start: formatDateYmd(startDate),
    end: formatDateYmd(endDate),
  }
}

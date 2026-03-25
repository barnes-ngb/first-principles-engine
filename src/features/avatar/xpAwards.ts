import { XP_EVENTS } from '../../core/types'

/** XP award amounts by activity. Maps to XP_EVENTS for type safety. */
export const XP_AWARDS = {
  checklistItem: XP_EVENTS.CHECKLIST_ITEM,           // 3 — per completed daily checklist item
  checklistPrayer: XP_EVENTS.CHECKLIST_PRAYER,       // 5 — prayer/formation items worth more
  questComplete: XP_EVENTS.QUEST_COMPLETE,           // 15 — Knowledge Mine quest finished
  questDiamondBonus: XP_EVENTS.QUEST_DIAMOND,        // 2 — per diamond mined in a quest
  bookComplete: XP_EVENTS.BOOK_READ,                 // 15 — finished reading a book (alias)
  bookPageRead: XP_EVENTS.BOOK_PAGE_READ,            // 1 — per page read (partial progress)
  dadLabComplete: XP_EVENTS.DAD_LAB_COMPLETE,        // 20 — finished a Dad Lab
  evaluationComplete: XP_EVENTS.EVALUATION_COMPLETE, // 25 — completed an evaluation
  dailyAllComplete: XP_EVENTS.DAILY_ALL_COMPLETE,    // 15 — bonus: finished ALL items for the day
  weeklyAllComplete: XP_EVENTS.WEEKLY_ALL_COMPLETE,  // 50 — bonus: all 5 days completed
} as const

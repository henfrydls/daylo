import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDisplayDate,
  formatMonthYear,
  getYearDays,
  getWeekDay,
  getFirstDayOffset,
  checkIsToday,
  checkIsSameDay,
  parseDateString,
  getDaysDifference,
  generateId,
} from './dates'

describe('dates utility functions', () => {
  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2024, 0, 15) // January 15, 2024
      expect(formatDate(date)).toBe('2024-01-15')
    })

    it('should pad single digit months and days', () => {
      const date = new Date(2024, 5, 5) // June 5, 2024
      expect(formatDate(date)).toBe('2024-06-05')
    })
  })

  describe('formatDisplayDate', () => {
    it('should format date for display', () => {
      const date = new Date(2024, 0, 15)
      expect(formatDisplayDate(date)).toBe('Jan 15, 2024')
    })
  })

  describe('formatMonthYear', () => {
    it('should format month and year', () => {
      const date = new Date(2024, 5, 15)
      expect(formatMonthYear(date)).toBe('June 2024')
    })
  })

  describe('getYearDays', () => {
    it('should return 365 days for a non-leap year', () => {
      const days = getYearDays(2023)
      expect(days.length).toBe(365)
    })

    it('should return 366 days for a leap year', () => {
      const days = getYearDays(2024)
      expect(days.length).toBe(366)
    })

    it('should start on January 1st', () => {
      const days = getYearDays(2024)
      expect(days[0].getMonth()).toBe(0)
      expect(days[0].getDate()).toBe(1)
    })

    it('should end on December 31st', () => {
      const days = getYearDays(2024)
      const lastDay = days[days.length - 1]
      expect(lastDay.getMonth()).toBe(11)
      expect(lastDay.getDate()).toBe(31)
    })
  })

  describe('getWeekDay', () => {
    it('should return 0 for Sunday', () => {
      const sunday = new Date(2024, 0, 7) // January 7, 2024 is Sunday
      expect(getWeekDay(sunday)).toBe(0)
    })

    it('should return 1 for Monday', () => {
      const monday = new Date(2024, 0, 8) // January 8, 2024 is Monday
      expect(getWeekDay(monday)).toBe(1)
    })
  })

  describe('getFirstDayOffset', () => {
    it('should return correct offset for 2024 (Monday)', () => {
      const offset = getFirstDayOffset(2024)
      expect(offset).toBe(1) // January 1, 2024 is Monday
    })
  })

  describe('checkIsToday', () => {
    it('should return true for today', () => {
      const today = new Date()
      expect(checkIsToday(today)).toBe(true)
    })

    it('should return false for yesterday', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      expect(checkIsToday(yesterday)).toBe(false)
    })
  })

  describe('checkIsSameDay', () => {
    it('should return true for same day', () => {
      const date1 = new Date(2024, 5, 15, 10, 30)
      const date2 = new Date(2024, 5, 15, 14, 45)
      expect(checkIsSameDay(date1, date2)).toBe(true)
    })

    it('should return false for different days', () => {
      const date1 = new Date(2024, 5, 15)
      const date2 = new Date(2024, 5, 16)
      expect(checkIsSameDay(date1, date2)).toBe(false)
    })
  })

  describe('parseDateString', () => {
    it('should parse YYYY-MM-DD string', () => {
      const date = parseDateString('2024-06-15')
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(5)
      expect(date.getDate()).toBe(15)
    })
  })

  describe('getDaysDifference', () => {
    it('should return correct difference', () => {
      const date1 = new Date(2024, 5, 15)
      const date2 = new Date(2024, 5, 10)
      expect(getDaysDifference(date1, date2)).toBe(5)
    })

    it('should return negative for earlier date', () => {
      const date1 = new Date(2024, 5, 10)
      const date2 = new Date(2024, 5, 15)
      expect(getDaysDifference(date1, date2)).toBe(-5)
    })
  })

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it('should return string', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
    })
  })
})

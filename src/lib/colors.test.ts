import { describe, it, expect } from 'vitest'
import { getHeatmapColor, calculateHeatmapLevel, HEATMAP_COLORS, ACTIVITY_COLORS } from './colors'

describe('colors utility functions', () => {
  describe('HEATMAP_COLORS', () => {
    it('should have 5 levels', () => {
      expect(Object.keys(HEATMAP_COLORS).length).toBe(5)
    })

    it('should have Tailwind classes for each level', () => {
      expect(HEATMAP_COLORS[0]).toContain('bg-')
      expect(HEATMAP_COLORS[1]).toContain('bg-')
      expect(HEATMAP_COLORS[2]).toContain('bg-')
      expect(HEATMAP_COLORS[3]).toContain('bg-')
      expect(HEATMAP_COLORS[4]).toContain('bg-')
    })
  })

  describe('ACTIVITY_COLORS', () => {
    it('should have multiple color options', () => {
      expect(ACTIVITY_COLORS.length).toBeGreaterThan(0)
    })

    it('should have name and value for each color', () => {
      ACTIVITY_COLORS.forEach((color) => {
        expect(color).toHaveProperty('name')
        expect(color).toHaveProperty('value')
        expect(color.value).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })
  })

  describe('getHeatmapColor', () => {
    it('should return correct class for level 0', () => {
      expect(getHeatmapColor(0)).toBe(HEATMAP_COLORS[0])
    })

    it('should return correct class for level 4', () => {
      expect(getHeatmapColor(4)).toBe(HEATMAP_COLORS[4])
    })
  })

  describe('calculateHeatmapLevel', () => {
    it('should return 0 when no activities', () => {
      expect(calculateHeatmapLevel(0, 0)).toBe(0)
    })

    it('should return 0 when no completions', () => {
      expect(calculateHeatmapLevel(0, 5)).toBe(0)
    })

    it('should return 1 for 1-25% completion', () => {
      expect(calculateHeatmapLevel(1, 4)).toBe(1) // 25%
      expect(calculateHeatmapLevel(1, 10)).toBe(1) // 10%
    })

    it('should return 2 for 26-50% completion', () => {
      expect(calculateHeatmapLevel(3, 10)).toBe(2) // 30%
      expect(calculateHeatmapLevel(5, 10)).toBe(2) // 50%
    })

    it('should return 3 for 51-75% completion', () => {
      expect(calculateHeatmapLevel(6, 10)).toBe(3) // 60%
      expect(calculateHeatmapLevel(7, 10)).toBe(3) // 70%
    })

    it('should return 4 for 76-100% completion', () => {
      expect(calculateHeatmapLevel(8, 10)).toBe(4) // 80%
      expect(calculateHeatmapLevel(10, 10)).toBe(4) // 100%
    })
  })
})

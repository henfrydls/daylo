import { test, expect } from '@playwright/test'

test.describe('Activity Tracker App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display Activity Tracker header', async ({ page }) => {
    const header = page.getByTestId('app-header')
    await expect(header).toBeVisible()
    await expect(header).toContainText('Activity Tracker')
  })

  test('should create a new activity', async ({ page }) => {
    // Click the Add button
    const addButton = page.getByTestId('add-activity-button')
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Wait for modal to appear
    const modal = page.getByTestId('activity-form-modal')
    await expect(modal).toBeVisible()

    // Fill in the activity name
    const nameInput = page.getByTestId('activity-name-input')
    await nameInput.fill('Exercise')

    // Select a color (click the second color option)
    const colorButtons = page.getByTestId('color-option')
    await colorButtons.nth(1).click()

    // Submit the form
    const submitButton = page.getByTestId('activity-form-submit')
    await submitButton.click()

    // Verify the activity appears in the list
    const activityItem = page.getByTestId('activity-item').filter({ hasText: 'Exercise' })
    await expect(activityItem).toBeVisible()
  })

  test('should open QuickLog when clicking a calendar day', async ({ page }) => {
    // First create an activity so we have something to log
    const addButton = page.getByTestId('add-activity-button')
    await addButton.click()

    const nameInput = page.getByTestId('activity-name-input')
    await nameInput.fill('Test Activity')

    const submitButton = page.getByTestId('activity-form-submit')
    await submitButton.click()

    // Wait for modal to close
    await expect(page.getByTestId('activity-form-modal')).not.toBeVisible()

    // Click on a calendar day cell
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    // Verify QuickLog modal appears
    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()
  })

  test('should toggle activity completion in QuickLog', async ({ page }) => {
    // Create an activity first
    const addButton = page.getByTestId('add-activity-button')
    await addButton.click()

    const nameInput = page.getByTestId('activity-name-input')
    await nameInput.fill('Meditation')

    const submitButton = page.getByTestId('activity-form-submit')
    await submitButton.click()

    // Wait for modal to close
    await expect(page.getByTestId('activity-form-modal')).not.toBeVisible()

    // Click on a calendar day to open QuickLog
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    // Wait for QuickLog to appear
    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()

    // Find the activity checkbox and toggle it
    const activityCheckbox = page.getByTestId('quicklog-activity-checkbox').first()
    await expect(activityCheckbox).not.toBeChecked()
    await activityCheckbox.click()
    await expect(activityCheckbox).toBeChecked()

    // Toggle it off
    await activityCheckbox.click()
    await expect(activityCheckbox).not.toBeChecked()
  })

  test('should show heatmap color after marking activity as completed', async ({ page }) => {
    // Create an activity first
    const addButton = page.getByTestId('add-activity-button')
    await addButton.click()

    const nameInput = page.getByTestId('activity-name-input')
    await nameInput.fill('Reading')

    const submitButton = page.getByTestId('activity-form-submit')
    await submitButton.click()

    // Wait for modal to close
    await expect(page.getByTestId('activity-form-modal')).not.toBeVisible()

    // Get the first day cell and check initial state (should have gray/empty color)
    const dayCell = page.getByTestId('day-cell').first()

    // Click to open QuickLog
    await dayCell.click()

    // Mark the activity as completed
    const activityCheckbox = page.getByTestId('quicklog-activity-checkbox').first()
    await activityCheckbox.click()

    // Close QuickLog
    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    // Wait for QuickLog to close
    await expect(page.getByTestId('quicklog-modal')).not.toBeVisible()

    // Verify the day cell now has a heatmap color class (emerald indicates completion)
    // The cell should have the emerald color class after completion
    await expect(dayCell).toHaveClass(/bg-emerald/)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { onScreen } from './onScreen'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the element somebody could reach', () => {
  it('passes over one inside an inert view', () => {
    document.body.innerHTML = `
      <div inert><button data-testid="bar" id="hidden">a</button></div>
      <button data-testid="bar" id="shown">b</button>`
    expect(onScreen('[data-testid="bar"]')?.id).toBe('shown')
  })

  it('passes over one that is not drawn', () => {
    document.body.innerHTML = `
      <div style="visibility: hidden"><button data-testid="bar" id="invisible">a</button></div>
      <div style="display: none"><button data-testid="bar" id="gone">a</button></div>
      <button data-testid="bar" id="shown">b</button>`
    expect(onScreen('[data-testid="bar"]')?.id).toBe('shown')
  })

  it('is nothing when there is nothing to reach', () => {
    document.body.innerHTML = `<div inert><button data-testid="bar">a</button></div>`
    expect(onScreen('[data-testid="bar"]')).toBeNull()
  })
})

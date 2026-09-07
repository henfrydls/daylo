import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Estos tests documentan el comportamiento de createDeferredStorage (src/store/index.ts).
 * La escritura a localStorage esta diferida a requestIdleCallback con timeout de 1000 ms y
 * no hay ningun flush en visibilitychange / pagehide / beforeunload, asi que un cierre
 * dentro de esa ventana pierde el cambio. El catch de flushWrite tampoco informa de nada.
 *
 * Estos tests PASAN describiendo el defecto, no el comportamiento deseado. Si algun dia
 * fallan es porque se corrigio, y entonces hay que reescribirlos al reves: que el dato SI
 * sobreviva al cierre y que un fallo de localStorage llegue al usuario.
 */
describe('createDeferredStorage: durabilidad de la escritura', () => {
  let idleCallbacks: Array<() => void>

  beforeEach(() => {
    localStorage.clear()
    idleCallbacks = []
    // requestIdleCallback que REGISTRA pero no ejecuta: simula el hilo ocupado
    // (animaciones) o el proceso terminado antes de que el navegador quede libre.
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      idleCallbacks.push(cb)
      return idleCallbacks.length
    })
    vi.stubGlobal('cancelIdleCallback', () => {})
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('pierde el cambio si la app se cierra antes de que corra el idle callback', async () => {
    const { useCalendarStore } = await import('./index')

    useCalendarStore.getState().addActivity('Ejercicio', '#22c55e')

    // El estado en memoria tiene la actividad.
    expect(useCalendarStore.getState().activities).toHaveLength(1)

    // Pero localStorage no la tiene: el idle callback quedo pendiente.
    const guardado = localStorage.getItem('simple-calendar-storage')
    const persistido = guardado ? JSON.parse(guardado).state.activities : []
    expect(persistido).toHaveLength(0)

    // Si el callback llega a correr, si se guarda. El problema es que al cerrar no corre.
    idleCallbacks.forEach((cb) => cb())
    const trasFlush = JSON.parse(localStorage.getItem('simple-calendar-storage')!)
    expect(trasFlush.state.activities).toHaveLength(1)
  })

  it('descarta el dato en silencio si localStorage falla', async () => {
    const { useCalendarStore } = await import('./index')
    useCalendarStore.getState().addActivity('Leer', '#3b82f6')

    const err = new DOMException('cuota excedida', 'QuotaExceededError')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw err
    })

    // El flush no lanza: el catch se lo come.
    expect(() => idleCallbacks.forEach((cb) => cb())).not.toThrow()
    expect(setItem).toHaveBeenCalled()

    setItem.mockRestore()
    // Y no queda nada guardado, sin que nadie se lo diga al usuario.
    expect(localStorage.getItem('simple-calendar-storage')).toBeNull()
  })

  it('no hay ningun listener de cierre que fuerce el flush', async () => {
    const añadidos: string[] = []
    vi.spyOn(window, 'addEventListener').mockImplementation(((ev: string) => {
      añadidos.push(ev)
    }) as typeof window.addEventListener)

    await import('./index')

    expect(añadidos).not.toContain('beforeunload')
    expect(añadidos).not.toContain('visibilitychange')
    expect(añadidos).not.toContain('pagehide')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Durabilidad de createDeferredStorage (src/store/index.ts).
 *
 * La escritura a localStorage esta diferida para que la UI responda al instante, asi que
 * hace falta una red de seguridad que escriba SI O SI cuando la app se oculta o se cierra.
 * Sin ella se pierde el ultimo cambio, que es justo el flujo principal de la app: abrir,
 * marcar el dia, cerrar.
 *
 * Estos tests describen el comportamiento CORRECTO. Si alguno falla, alguien reintrodujo
 * el defecto: o quito el flush de cierre, o volvio a silenciar los fallos de escritura.
 */
describe('createDeferredStorage: durabilidad de la escritura', () => {
  let idleCallbacks: Array<() => void>

  const ocultarPagina = () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('visibilitychange'))
  }

  beforeEach(() => {
    localStorage.clear()
    idleCallbacks = []
    // requestIdleCallback que REGISTRA pero no ejecuta: simula el hilo ocupado por las
    // animaciones, o el proceso terminado antes de que el navegador quede libre.
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

  const leerGuardado = () => {
    const raw = localStorage.getItem('simple-calendar-storage')
    return raw ? JSON.parse(raw).state.activities : []
  }

  it('guarda el cambio en pagehide aunque el idle callback no haya corrido', async () => {
    const { useCalendarStore } = await import('./index')
    useCalendarStore.getState().addActivity('Ejercicio', '#22c55e')

    // Todavia no se escribio: el idle callback esta pendiente a proposito.
    expect(leerGuardado()).toHaveLength(0)

    window.dispatchEvent(new Event('pagehide'))

    // La red de seguridad tuvo que escribirlo de forma sincrona.
    expect(leerGuardado()).toHaveLength(1)
    expect(leerGuardado()[0].name).toBe('Ejercicio')
  })

  it('guarda el cambio cuando la app pasa a segundo plano (visibilitychange -> hidden)', async () => {
    const { useCalendarStore } = await import('./index')
    useCalendarStore.getState().addActivity('Leer', '#3b82f6')
    expect(leerGuardado()).toHaveLength(0)

    ocultarPagina()

    expect(leerGuardado()).toHaveLength(1)
    expect(leerGuardado()[0].name).toBe('Leer')
  })

  it('registra los listeners de cierre al crear el storage', async () => {
    const eventos: string[] = []
    vi.spyOn(window, 'addEventListener').mockImplementation(((ev: string) => {
      eventos.push(ev)
    }) as typeof window.addEventListener)

    const { useCalendarStore } = await import('./index')
    // El storage se instancia de forma perezosa: hace falta una escritura para crearlo.
    useCalendarStore.getState().addActivity('Meditar', '#a855f7')

    expect(eventos).toContain('pagehide')
    expect(eventos).toContain('visibilitychange')
  })

  it('avisa por consola si localStorage falla, en vez de tragarselo', async () => {
    const { useCalendarStore } = await import('./index')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota excedida', 'QuotaExceededError')
    })

    useCalendarStore.getState().addActivity('Correr', '#ef4444')
    idleCallbacks.forEach((cb) => cb())

    expect(setItem).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain('localStorage')
  })

  it('conserva el cambio pendiente para reintentarlo si la escritura falla', async () => {
    const { useCalendarStore } = await import('./index')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota excedida', 'QuotaExceededError')
    })

    useCalendarStore.getState().addActivity('Estirar', '#f59e0b')
    idleCallbacks.forEach((cb) => cb())

    // Se recupera el almacenamiento (el usuario libero espacio) y se vuelve a intentar.
    setItem.mockRestore()
    window.dispatchEvent(new Event('pagehide'))

    // El dato no se habia descartado: el reintento lo salva.
    expect(leerGuardado()).toHaveLength(1)
    expect(leerGuardado()[0].name).toBe('Estirar')
  })
})

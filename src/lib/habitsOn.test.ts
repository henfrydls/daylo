import { describe, it, expect } from 'vitest'
import { habitsThatExistedOn } from './activityYear'
import type { Activity } from '../types'

function made(id: string, on: string): Activity {
  return {
    id,
    name: id,
    color: '#10B981',
    createdAt: `${on}T09:00:00.000Z`,
    updatedAt: `${on}T09:00:00.000Z`,
  }
}

describe('how many habits existed on a day', () => {
  // Adding a habit used to repaint the whole year paler: a day in March was judged against
  // the habits of today, so creating a fourth one turned half a year grey. Nobody did
  // anything differently in March.
  it('counts only the habits that existed by then', () => {
    const on = habitsThatExistedOn([made('a', '2026-01-10'), made('b', '2026-06-01')])

    expect(on('2026-01-09', 0)).toBe(0)
    expect(on('2026-01-10', 0)).toBe(1)
    expect(on('2026-05-31', 0)).toBe(1)
    expect(on('2026-06-01', 0)).toBe(2)
    expect(on('2026-11-03', 0)).toBe(2)
  })

  it('answers zero when there are no habits at all', () => {
    expect(habitsThatExistedOn([])('2026-11-03', 0)).toBe(0)
  })

  // An imported file can carry logs older than the habit they belong to: the export keeps
  // the logs and the habit is created fresh on the way in. Counting only by createdAt would
  // make a day with work done come out grey, which is worse than the fault being fixed.
  it('never reports fewer habits than the day has completed logs', () => {
    const on = habitsThatExistedOn([made('a', '2026-06-01')])

    expect(on('2026-01-10', 2)).toBe(2)
    expect(on('2026-06-02', 1)).toBe(1)
  })

  // `createdAt` se guarda con `toISOString()`, que es UTC, y `dateStr` sale de `formatDate`,
  // que es local. Cortar los diez primeros caracteres mezcla los dos calendarios.
  //
  // Los dos casos, y los dos existen entre los usuarios de Daylo: en Santo Domingo (UTC-4)
  // un habito creado despues de las 20:00 nacia al dia siguiente, asi que ese dia no
  // contaba y se pintaba mas verde de lo que era; en India (UTC+5:30, de donde sale casi
  // la mitad de las sesiones de la Store) uno creado antes de las 05:30 nacia el dia
  // anterior, y ese dia salia mas palido.
  //
  // Las dos fechas se construyen con componentes locales, asi que la prueba dice lo mismo
  // en cualquier zona. El banco esta fijado a Asia/Kolkata en vitest.config.ts para que
  // esto no sea verde por accidente en el CI, que corre en UTC.
  it('reads the day a habit was made in local time, not in UTC', () => {
    const earlyOnThe15th = new Date(2026, 5, 15, 3, 0).toISOString()
    const lateOnThe15th = new Date(2026, 5, 15, 23, 30).toISOString()

    for (const createdAt of [earlyOnThe15th, lateOnThe15th]) {
      const on = habitsThatExistedOn([{ ...made('a', '2026-01-01'), createdAt }])

      expect(on('2026-06-14', 0)).toBe(0)
      expect(on('2026-06-15', 0)).toBe(1)
    }
  })
})

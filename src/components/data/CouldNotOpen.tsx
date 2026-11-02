import { useState } from 'react'
import { useRescueStore } from '../../store/rescue'
import { saveTextFile, formatSavedMessage } from '../../lib/fileSave'

/**
 * The screen for the one failure that used to have no screen at all.
 *
 * When hydration threw, `_hasHydrated` stayed false and App returned the loading skeleton
 * for ever. No header, so no Settings, so no Export: the activities were sitting on the
 * disk and there was no way left to reach them, and nothing on screen said anything had
 * happened. For an app whose argument is that the data is yours, that is the worst
 * ten lines in it.
 *
 * Two rules hold this together, and both are about not depending on what just broke:
 *
 * It reads nothing from the calendar store. That store is the thing that failed.
 *
 * What it hands back is the raw text off the disk, never anything parsed, because parsing
 * is what did not work. A file Daylo cannot read is still a file somebody else can: a text
 * editor, another device, or us.
 */
export function CouldNotOpen() {
  const failure = useRescueStore((state) => state.failure)
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null)

  if (failure === null) return null

  const save = async () => {
    if (failure.raw === null) return
    setSaid(null)

    try {
      const today = new Date()
      const name = `daylo-unopened-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.json`
      const result = await saveTextFile(failure.raw, name, 'application/json')

      if (!result.saved) return
      setSaid({
        good: true,
        text: result.path ? formatSavedMessage(result.path, name) : `A copy was saved as ${name}.`,
      })
    } catch (error) {
      // Nothing here may throw: this is the last screen left, and an error boundary over
      // it would leave somebody with even less than the skeleton did.
      setSaid({
        good: false,
        text: error instanceof Error ? error.message : 'The copy could not be made.',
      })
    }
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-gray-50 px-6"
      data-testid="could-not-open"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-gray-900">Daylo could not open your data</h1>

        {failure.reason === 'unreadable' ? (
          <>
            {/* First, because it is the only thing somebody wants to know in that second. */}
            <p className="text-sm text-gray-600">
              Everything you have tracked is still on this device. Daylo just could not make sense
              of the file it keeps it in, so it has not opened it and has not changed it.
            </p>
            <p className="text-sm text-gray-600">
              Save a copy before anything else. It is the file exactly as it is now, and whoever
              looks at it next will want it untouched.
            </p>
          </>
        ) : (
          /* Not a damaged file, and it must not read like one: there is nothing wrong with
             the data, and saying there is sends somebody looking for damage to repair. */
          <p className="text-sm text-gray-600">
            Daylo cannot reach the storage it keeps your activities in. Some browsers block it with
            site data turned off, and some private windows do too. Nothing has been lost: with
            storage allowed again, everything is where it was.
          </p>
        )}

        {failure.raw === null ? null : (
          <button
            type="button"
            onClick={() => void save()}
            data-testid="could-not-open-save"
            className="min-h-[44px] w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Save a copy of it
          </button>
        )}

        {said === null ? null : (
          <p
            className={`text-sm ${said.good ? 'text-gray-600' : 'text-red-600'}`}
            aria-live="polite"
            data-testid={said.good ? 'could-not-open-saved' : 'could-not-open-failed'}
          >
            {said.text}
          </p>
        )}

        <p className="text-sm text-gray-500">
          Writing to daylo@henfrydls.com with that copy is the fastest way to get it back.
        </p>
      </div>
    </div>
  )
}

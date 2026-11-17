import { useCallback, useEffect, useRef, type FocusEvent } from 'react'
import { Modal } from '../ui'
import { StreakChip } from './StreakChip'
import { StreakDetails, StreakPanel, type StreakDetailsProps } from './StreakSheet'

interface HeaderStreakProps extends StreakDetailsProps {
  /**
   * What the chip opens. The header mounts this twice (a row on the phone, another from
   * 640px up) and only one is seen; each opens its own surface: a sheet from the bottom
   * edge on the phone, a panel hanging from the chip on a wide screen.
   */
  surface: 'sheet' | 'panel'
  /**
   * Whether it is open. Held by App and not here, so that App can close it: a tap on the
   * daily reminder opens today's sheet, and this one sits above it (#270).
   */
  open: boolean
  /**
   * Asked to open or close it: the chip, Escape, a press outside, the run going. App also
   * holds the feedback question back while it is open, the way it does for the day sheet.
   */
  onOpenChange: (open: boolean) => void
}

/**
 * The run in the header: the chip, and the sheet it opens.
 *
 * Nothing at all with no run, wrapper included: an empty box in the header row would still
 * take its share of the gap beside the gear.
 */
export function HeaderStreak({
  surface,
  open: asked,
  onOpenChange,
  ...details
}: HeaderStreakProps) {
  const chipRef = useRef<HTMLButtonElement>(null)

  // Untick the one day there was and the run goes, and the sheet with it: there is nothing
  // left to show, and the chip it would give the focus back to is gone too. Read as closed
  // in this very render, so no frame shows a sheet about a run of nothing; and whoever
  // holds it is told, so it does not come back by itself with the next run.
  const open = asked && details.streak > 0
  useEffect(() => {
    if (asked && details.streak === 0) onOpenChange(false)
  }, [asked, details.streak, onOpenChange])

  const close = useCallback(
    (giveFocusBack = true) => {
      onOpenChange(false)
      if (giveFocusBack) chipRef.current?.focus()
    },
    [onOpenChange]
  )
  const closeSheet = useCallback(() => close(true), [close])

  // The panel goes when the focus leaves for something outside it: tabbing on to the gear
  // and opening the menu should not leave two things open at once. A blur with nowhere to
  // go (a press on nothing) is the press handler's business, not this one's.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (open && next instanceof Node && !event.currentTarget.contains(next)) close(false)
  }

  if (details.streak === 0) return null

  return (
    <div className="relative" onBlur={surface === 'panel' ? onBlur : undefined}>
      <StreakChip
        ref={chipRef}
        streak={details.streak}
        todayDone={details.todayDone}
        onOpen={() => onOpenChange(!open)}
        expanded={open}
      />
      {surface === 'panel' && open ? <StreakPanel {...details} onClose={close} /> : null}
      {surface === 'sheet' ? (
        <Modal isOpen={open} onClose={closeSheet} title="Your streak" data-testid="streak-sheet">
          <StreakDetails {...details} />
        </Modal>
      ) : null}
    </div>
  )
}

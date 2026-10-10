import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useFocusTrap, useAnimatedPresence, useArrival } from '../../hooks'
import { XIcon } from './Icons'

/**
 * The dialog, and on a phone the sheet that comes up from the bottom.
 *
 * On a phone it comes up from the bottom edge and goes back down, the same way and on the
 * same curve as the day sheet, because on a phone it is the same object: a sheet. Above
 * `sm` there is no bottom edge to come from, so it stays what it was, something that grows
 * into the middle of the screen. One component, two behaviours, decided by width and not
 * by platform: a narrow window on a desktop gets the sheet.
 *
 * It comes up and goes down at all, which took two fixes and neither was the transition itself.
 * One is the frame it comes from, which is what useArrival is for. The other is that
 * `scale-95` sets the `scale` property and the transition named `transform`: Tailwind 4
 * scales the way it translates, with the property of that name, so the list named
 * something this element never changes. Both measured in e2e/dialog.spec.ts, frame by
 * frame, because a class list that names a transition proves nothing about movement.
 *
 * The bottom padding is the design's own plus whatever the system has reserved down
 * there. A phone on gesture navigation keeps a strip at the bottom of the screen for its
 * own bar, and a sheet that reaches the bottom edge — which this one does, by design —
 * has its last row sitting in it. Reported from a phone: the button that stops the
 * reminder was flush against the gesture bar with no air at all.
 *
 * calc rather than max. With max the system's strip eats the padding the design asked
 * for, and the button clears the bar by exactly nothing; with calc it keeps its own
 * breathing room above whatever the system takes. Where there is no inset — every
 * desktop, and a phone on button navigation — env() is 0 and this is exactly the padding
 * it always had, so nothing moves anywhere else.
 *
 * It needs viewport-fit=cover in the viewport meta to be anything but zero, which
 * index.html has.
 */
/**
 * What the leaving classes say, and what the dialog is given to do it in.
 *
 * 250 and one curve in both directions, which is the day sheet's, because on a phone this
 * is the same object: something that comes up from the bottom edge. Two durations and two
 * eases is what a dialog that grows in the middle of the screen wants, and that is still
 * what it does above `sm`.
 */
export const DIALOG_LEAVES_IN = 250
/**
 * The day sheet's curve, so that two things that move the same way move the same way.
 *
 * Written out at every use rather than interpolated into a class. Tailwind reads the
 * source as text, so `duration-[${n}ms]` is a class nobody ever writes down: nothing
 * generates it, and the transition quietly has no duration at all.
 */
export const DIALOG_CURVE = 'ease-[cubic-bezier(0.32,0.72,0,1)]'
/**
 * Two frames more than the transition itself.
 *
 * The timer starts when React commits the leaving classes; the browser starts the
 * transition at the next paint, so the two are a frame apart and the timer finishes first.
 * Measured with the timer set to the transition's own length: the dialog was taken out of
 * the page at opacity 0.34, which is a cut rather than a fade, and the ease it leaves on
 * does most of its work at the end.
 */
export const DIALOG_STAYS_FOR = DIALOG_LEAVES_IN + 40

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * The actions. They live outside the scrolling area on purpose: put in with the rest of
   * the content they scroll away with it, and on a short window the button that finishes
   * the job ends up below the fold, where it has to be discovered. Measured at 1024x600
   * before this existed: the Import button sat at 698px with the modal ending at 570.
   */
  footer?: ReactNode
  'data-testid'?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  'data-testid': testId,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, DIALOG_STAYS_FOR)
  // A frame at the state it comes from, before it is told to go to the other one. Without
  // it the dialog is painted finished and the transition has nothing to run: it was simply
  // there, measured at opacity 1 on the first frame it existed.
  const arrived = useArrival(isVisible)

  useFocusTrap(modalRef, isOpen, { onEscape: onClose, autoFocus: false })

  if (!shouldRender) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-[250ms] ${arrived ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 px-6 pt-4 sm:pt-6 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] max-h-[90dvh] flex flex-col overflow-hidden motion-safe:transition-[translate,scale,opacity] duration-[250ms] ${DIALOG_CURVE} ${
          arrived
            ? 'translate-y-0 opacity-100 sm:scale-100'
            : 'translate-y-full opacity-0 sm:translate-y-0 sm:scale-95'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-testid={testId}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            // gray-500 and not gray-400, measured against the white behind it: gray-400
            // is 2.60:1 where 1.4.11 asks 3:1 for a control, and gray-500 is 4.84:1. Same
            // change as the two bands, same reason.
            className="p-2.5 sm:p-1 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">{children}</div>
        {footer && (
          <div className="shrink-0 pt-4 mt-2 border-t border-gray-100" data-testid="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

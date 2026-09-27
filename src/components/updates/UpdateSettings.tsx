import { Button, Modal } from '../ui'
import { useCalendarStore } from '../../store'

/**
 * What Daylo knows about a newer version, and the two things that can be done about it.
 *
 * Two lines and two buttons, and that is the whole sheet. It used to have a dot, a
 * sentence about the switch and a paragraph explaining the request; Henfry read it and
 * called it invasive, which it was: somebody who opens this wants to know whether there is
 * an update, and everything else was the app talking about itself.
 *
 * So the switch stopped being a state to read and became a thing to do. Its words say what
 * pressing it does, and the words changing is the whole acknowledgement: there is no
 * sentence about it any more, no toast and no confirmation, which is why the row it sits
 * in is spoken.
 *
 * The one line that stayed is the one about what leaves the machine. It is the only thing
 * here that answers what pressing a button sends about somebody, and it is short because
 * the long version was part of what made this sheet a lecture.
 */

/** What the sheet has to say, which is the same question the card answers differently. */
export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; canInstall: boolean }
  /** Being downloaded or installed right now, which the card behind this is narrating. */
  | { kind: 'working' }
  /** Installed, and the relaunch did not happen by itself. */
  | { kind: 'restart' }
  | { kind: 'failed' }

interface UpdateSettingsProps {
  isOpen: boolean
  onClose: () => void
  status: UpdateStatus
  /** "Check now", or what there is to do instead when there is something. */
  onAct: () => void
}

/** Null when nothing is known, because a sheet that opens knowing nothing claims nothing. */
function sentence(status: UpdateStatus): string | null {
  switch (status.kind) {
    case 'checking':
      return 'Checking…'
    case 'up-to-date':
      return 'Daylo is up to date.'
    case 'available':
      return `Daylo ${status.version} is out.`
    case 'working':
      return 'Daylo is updating itself.'
    case 'restart':
      return 'Done. Restart Daylo to finish.'
    case 'failed':
      return 'Could not check just now.'
    case 'idle':
      return null
  }
}

/** One action at a time, never two, and its words depend on what there is to do. */
function actionWords(status: UpdateStatus): string | null {
  // Gone rather than greyed out while something is happening. A disabled primary is white
  // on emerald at half opacity, which measures 1.6:1, and taking it out costs no height
  // because the row keeps the other button.
  if (status.kind === 'checking' || status.kind === 'working') return null
  if (status.kind === 'restart') return 'Restart'
  if (status.kind !== 'available') return 'Check now'
  return status.canInstall ? 'Update' : 'Get it from the downloads page'
}

export function UpdateSettings({ isOpen, onClose, status, onAct }: UpdateSettingsProps) {
  const enabled = useCalendarStore((s) => s.updatesEnabled)
  const setEnabled = useCalendarStore((s) => s.setUpdatesEnabled)
  const said = sentence(status)
  const action = actionWords(status)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Check for new versions"
      data-testid="update-settings"
      footer={
        // Spoken, because the buttons are the only acknowledgement left: pressing the
        // first one changes nothing on screen except its own words.
        <div className="flex justify-end gap-3" aria-live="polite">
          <Button
            variant="secondary"
            onClick={() => setEnabled(!enabled)}
            data-testid="update-toggle"
          >
            {enabled ? 'Stop checking automatically' : 'Start checking automatically'}
          </Button>
          {action === null ? null : (
            <Button onClick={onAct} data-testid="update-settings-action">
              {action}
            </Button>
          )}
        </div>
      }
    >
      <div>
        {/* The region is always here even when it has nothing in it: a live region that
            arrives at the same moment as its text is a live region most screen readers do
            not read. */}
        <div aria-live="polite">
          {said === null ? null : (
            <p className="font-medium text-gray-900" data-testid="update-status">
              {said}
            </p>
          )}
        </div>

        <p className="mt-4 text-sm text-gray-600">Daylo asks GitHub and sends nothing about you.</p>
      </div>
    </Modal>
  )
}

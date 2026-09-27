import { Button, Modal } from '../ui'
import { useCalendarStore } from '../../store'

/**
 * The switch for looking, and the way to look right now.
 *
 * Same shape as the check-in's sheet, which is the point: two settings that behave the
 * same way are easier to trust than two that each do their own thing. What is new here is
 * one line, the action in the body, and it is new because the check-in has nothing to do
 * on request and this does.
 *
 * The action is in the body rather than the footer. That footer is one button aligned
 * right; a second one there turns it into a row of two and asks which is the important
 * one, when one changes a setting and the other runs an errand.
 *
 * There is no toast. The sentence rewriting itself is the whole reply, the way it is in
 * the check-in's sheet, and a message that appeared over this sheet would be drawn under
 * it anyway: the dialog renders through a portal that paints above the toast layer.
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
  /** "Check now", or "Update" when there is one and this copy can take it. */
  onAct: () => void
}

function sentence(status: UpdateStatus, enabled: boolean): string {
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
      return enabled ? 'Checking is on.' : 'Checking is off.'
  }
}

/** One action at a time, never two, and its words depend on what there is to do. */
function actionWords(status: UpdateStatus): string | null {
  // Nothing to offer while it is happening: the work carries on either way, and a button
  // there would be a second Update over an update already running.
  if (status.kind === 'checking' || status.kind === 'working') return null
  if (status.kind === 'restart') return 'Restart'
  if (status.kind !== 'available') return 'Check now'
  return status.canInstall ? 'Update' : 'Get it from the downloads page'
}

export function UpdateSettings({ isOpen, onClose, status, onAct }: UpdateSettingsProps) {
  const enabled = useCalendarStore((s) => s.updatesEnabled)
  const setEnabled = useCalendarStore((s) => s.setUpdatesEnabled)
  const action = actionWords(status)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Check for new versions"
      data-testid="update-settings"
      footer={
        <div className="flex justify-end">
          <Button
            variant={enabled ? 'secondary' : 'primary'}
            onClick={() => setEnabled(!enabled)}
            data-testid="update-toggle"
          >
            {enabled ? 'Turn it off' : 'Turn it on'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Daylo asks GitHub whether a newer version exists. It sends nothing about you.
        </p>

        <div className="flex items-start gap-2" data-testid="update-status">
          <span
            className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
              enabled ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          {/* Spoken, because the switch and the check have no other acknowledgement: no
              toast, no confirmation, and this sentence rewriting itself is the reply. */}
          <div className="min-w-0" aria-live="polite">
            <p className="font-medium text-gray-900">{sentence(status, enabled)}</p>
            {action === null ? null : (
              <button
                onClick={onAct}
                className="mt-1 rounded text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                data-testid="update-settings-action"
              >
                {action}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

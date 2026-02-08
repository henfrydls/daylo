import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

const defaultProps: Partial<IconProps> = {
  size: 20,
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  'aria-hidden': true,
}

function createIconProps(props: IconProps): SVGProps<SVGSVGElement> {
  const { size = defaultProps.size, className, ...rest } = props
  return {
    width: size,
    height: size,
    fill: defaultProps.fill,
    viewBox: defaultProps.viewBox,
    stroke: defaultProps.stroke,
    'aria-hidden': defaultProps['aria-hidden'],
    className,
    ...rest,
  }
}

/** Close/X icon - Used for closing modals, dialogs, and dismissing notifications */
export function XIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

/** Simple checkmark icon - Used for completed items */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

/** Checkmark in circle - Used for success states */
export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/** Exclamation in circle - Used for error states */
export function ExclamationCircleIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/** Information icon in circle - Used for informational states */
export function InfoCircleIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/** Question mark in circle - Used for help or confirmation dialogs */
export function QuestionCircleIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/** Left chevron - Used for navigation (previous) */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  )
}

/** Right chevron - Used for navigation (next) */
export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  )
}

/** Plus icon - Used for adding new items */
export function PlusIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  )
}

/** Pencil/Edit icon - Used for edit actions */
export function PencilIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  )
}

/** Trash/Delete icon - Used for delete actions */
export function TrashIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

/** Warning triangle - Used for warning states */
export function WarningIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  )
}

/** Cloud upload icon - Used for file upload areas */
export function CloudUploadIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  )
}

/** Upload arrow icon - Used for upload actions */
export function UploadIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  )
}

/** Download arrow icon - Used for download actions */
export function DownloadIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  )
}

/** Refresh/Reload icon - Used for refresh/reload actions */
export function RefreshIcon(props: IconProps) {
  return (
    <svg {...createIconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}

/** Spinner icon - Used for loading states */
export function SpinnerIcon(props: IconProps) {
  const { size = defaultProps.size, className, ...rest } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden={props['aria-hidden'] ?? true}
      {...rest}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

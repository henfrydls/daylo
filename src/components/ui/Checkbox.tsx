import type { InputHTMLAttributes } from 'react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * The app's checkbox, drawn by the app.
 *
 * It stays a real <input type="checkbox">, so the state still reaches assistive
 * technology and every existing label and test id keeps working. Only the drawing is
 * ours: see .app-checkbox in index.css for why, and for the contrast the colours had to
 * meet.
 *
 * The box is 20px and is deliberately not the whole tap target. The row it sits in is a
 * label, so the whole row remains tappable, which is what a phone needs.
 */
export function Checkbox({ className = '', ...props }: CheckboxProps) {
  return <input type="checkbox" className={`app-checkbox ${className}`.trim()} {...props} />
}

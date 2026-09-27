/**
 * The dot that says a new version is still waiting.
 *
 * It exists because the cross on the update card means later, not no. Something has to
 * hold that "later", and a card that came back would be the app ignoring the answer it
 * was given.
 *
 * Only this has one. The check-in's line has nothing to come back to, and a dot on
 * everything is a dot that means nothing.
 *
 * emerald-600 and not emerald-500: 3.67:1 against white where 1.4.11 asks 3:1, while the
 * lighter one is 2.46:1. It is the only thing carrying this meaning, so it has to be
 * visible on its own.
 *
 * It says nothing by itself, and a dot nobody can hear is decoration. What speaks is the
 * text beside it in the menu entry, and the label of the button it sits on.
 */
export function UpdateDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full bg-emerald-600 ${className}`}
      aria-hidden="true"
      data-testid="update-dot"
    />
  )
}

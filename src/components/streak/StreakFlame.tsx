import { useId } from 'react'
import type { FlameHeat, FlameLevel } from './flameLevels'

/** The flame Daylo has always had. */
const FLAME_OUT =
  'M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z'
const FLAME_IN =
  'M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z'
/** Three tongues over one bowl: the fire that has been fed for half a year. */
const BONFIRE_OUT =
  'M12 1.6C13.4 4.2 15.6 6.6 15.6 10.4C16.9 9.6 18.2 7.9 18.9 5.6C20.2 7.8 20.6 10.4 20.6 13A8.6 8.6 0 0 1 3.4 13C3.4 10.4 3.8 7.8 5.1 5.6C5.8 7.9 7.1 9.6 8.4 10.4C8.4 6.6 10.6 4.2 12 1.6Z'
const BONFIRE_IN =
  'M12 18.2a3.6 3.6 0 0 0 .48-7.17 5.75 5.75 0 0 0-1.85 3.4 5.74 5.74 0 0 1-2.05-.96A3.6 3.6 0 0 0 12 18.2Z'
/** Two embers going up, over the bonfire's tongues. Dots, and always solid: too small to be
 *  hollow. In the bonfire's own coordinates, so they are scaled and placed with it; at the
 *  bonfire's size (1.12) they land where the design drew them. */
const EMBERS =
  'M17 1.714a1.339 1.339 0 1 0 0 2.679a1.339 1.339 0 1 0 0-2.679Z M7.179 2.071a1.116 1.116 0 1 0 0 2.232a1.116 1.116 0 1 0 0-2.232Z'

/**
 * The colour of the flame and of its heart, at each heat.
 *
 * The flame is emerald-700, the green of the focus ring, until the fire at 30 days. Against
 * the pill (emerald-50) the green is 5.09:1, the fire 3.78:1 and the blue 4.91:1, all over
 * the 3 a shape needs; measured in WebKitGTK. The hearts are decoration and are not counted:
 * the outline is what has to be seen.
 */
const HEATS: Record<FlameHeat, { ink: string; core: string | null }> = {
  green: { ink: 'text-emerald-700', core: null },
  'green-core': { ink: 'text-emerald-700', core: '#fcd34d' },
  fire: { ink: 'text-[#e04e12]', core: '#ffd43b' },
  blue: { ink: 'text-[#2563eb]', core: '#dbeafe' },
}

/** The width of the stroke of the hollow flame, as it has always been. */
const STROKE = 1.75

/**
 * The flame: only its outline while today is missing, filled once today is in, at the step
 * the run has reached.
 *
 * Two things tried and dropped in the R-09 round, both looking at the capture at 360px. A
 * dashed outline, the calendar's word for a day that has not happened yet: at 20px the
 * flame stopped being a flame and read as a broken ring. And a filled one without the inner
 * flame, to set it further from the hollow one: it did, and it looked like a leaf.
 *
 * Hollow against filled is a difference of shape, not of colour, and it holds at every step:
 * the hollow one is drawn in the colour of its step and without its heart.
 *
 * The box is still the 20px the flame has always had, so the pill is never wider than the
 * number makes it. Some steps draw a little past it, and only where there is room: the
 * bonfire (drawn at 1.12) and its embers reach above the top, and three flames and the
 * double bonfire reach to the left, into the pill's own padding. Nothing reaches towards the
 * number.
 */
export function StreakFlame({ level, lit }: { level: FlameLevel; lit: boolean }) {
  // An id for the masks that is safe inside url(#...).
  const id = 'flame' + useId().replace(/[^\w-]/g, '')
  const { shape, heat, count, bigCore = false } = level
  const { ink, core } = HEATS[heat]
  const bonfire = shape === 'bonfire' || shape === 'bonfire-embers'
  const body = bonfire ? BONFIRE_OUT : FLAME_OUT
  const inner = shape === 'ember' ? '' : bonfire ? BONFIRE_IN : FLAME_IN
  const size = shape === 'ember' ? 0.78 : bonfire ? 1.12 : 1

  // Several: the same drawing again, behind and to the left, a step apart. The one in front
  // is whole; of the ones behind, only what it leaves uncovered is drawn, with a gap.
  const scale = count === 1 ? size : size * (count === 2 ? 0.92 : 0.84)
  const step = count === 2 ? 7.4 : 6.5
  const spread = (count - 1) * step
  // What does not fit in the 20px goes to the left, never towards the number.
  const lean = count === 3 ? -1.6 : count === 2 && bonfire ? -1.4 : 0
  // Index 0 is the one in front, at the right. Each is scaled from its own foot.
  const place = (index: number) =>
    `translate(${12 + lean + spread / 2 - index * step} 21) scale(${scale}) translate(-12 -21)`

  const one = (index: number) => (
    <g key={index} mask={index > 0 ? `url(#${id}-${index})` : undefined}>
      <g transform={place(index)}>
        {lit ? (
          <>
            {/* Without a heart the inner flame is a hole, as it has always been. */}
            <path d={`${body} ${core ? '' : inner}`} fill="currentColor" fillRule="evenodd" />
            {core && inner ? (
              <path
                d={inner}
                fill={core}
                // Grown from its own foot and set 0.3 lower, so the grown heart still sits
                // inside the bottom of the flame.
                transform={
                  bigCore ? 'translate(12 18.3) scale(1.34) translate(-12 -18)' : undefined
                }
              />
            ) : null}
          </>
        ) : (
          <path
            d={body}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE / scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* The embers go with the one in front, inside its group, so they follow its size and
            its place. */}
        {index === 0 && shape === 'bonfire-embers' ? (
          <path data-part="embers" d={EMBERS} fill="currentColor" />
        ) : null}
      </g>
    </g>
  )

  // Each one behind is hidden by every one in front of it, drawn a little fatter than it is.
  const masks = Array.from({ length: count - 1 }, (_, i) => i + 1).map((index) => (
    <mask
      key={index}
      id={`${id}-${index}`}
      maskUnits="userSpaceOnUse"
      x="-8"
      y="-6"
      width="40"
      height="36"
    >
      <rect x="-8" y="-6" width="40" height="36" fill="white" />
      {Array.from({ length: index }, (_, front) => (
        <path
          key={front}
          d={body}
          transform={place(front)}
          fill="black"
          stroke="black"
          strokeWidth={(lit ? 2.6 : STROKE + 2.2) / scale}
          strokeLinejoin="round"
        />
      ))}
    </mask>
  ))

  return (
    <svg
      data-testid="streak-flame"
      data-level={level.name}
      data-lit={lit}
      viewBox="0 0 24 24"
      className={`h-5 w-5 shrink-0 overflow-visible ${ink}`}
      fill="none"
      aria-hidden="true"
    >
      {masks.length ? <defs>{masks}</defs> : null}
      {/* Drawn from the back, so the one in front is painted last. */}
      {Array.from({ length: count }, (_, i) => one(count - 1 - i))}
    </svg>
  )
}

/**
 * The two rings the month grid puts on a day number, kept in one place because the Today
 * bar draws the second one too.
 *
 * Dashed is a day that exists and has not happened yet. Today wears it in green and 2px;
 * a yesterday that is still open wears it in grey and 1px. Two differences and not one:
 * gray-500 and emerald-700 are almost the same lightness (4.84 and 5.36 against white,
 * 1.11 between them), so somebody who cannot tell the hue apart would see two identical
 * rings if only the colour changed. The weight shows without colour. gray-500 is 4.84:1
 * on white and 4.63 on the grey cell of the month before, and an outline needs 3.
 */
export const TODAY_RING = 'border-2 border-dashed border-emerald-700 text-gray-900'
export const YESTERDAY_RING = 'border border-dashed border-gray-500 text-gray-900'

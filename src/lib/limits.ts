/**
 * How long a name may be, in the one place both halves can read it.
 *
 * Its own file, and the reason is the bundle. `dataExport.ts` is six hundred lines and is
 * reached only from the export and import dialogs, which are lazy: importing it from a
 * form to read one number would pull all of it into the chunk every launch pays for.
 */
export const LONGEST_NAME = 100

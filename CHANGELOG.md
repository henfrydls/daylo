# Changelog

What changed in each release, for the people who use Daylo. Earlier versions are not
listed: this file starts at 1.1.2, when the first change worth warning about arrived.

## 1.1.3

**Exporting now asks you where to save.** Before, Daylo handed the file to the system and
the system decided where it went, usually your Downloads folder, without telling you. Now
a normal save window opens, you choose the folder and the name, and Daylo tells you where
the file ended up.

On Linux this also fixes something that would have been worse: the file could end up in a
folder that belongs to the app rather than to you, and nobody would have thought to look
there. A backup you cannot find is not a backup.

**If the save window cannot open, Daylo says so** instead of writing the file somewhere
you were never told about. On Linux the save window comes from your desktop, so a system
without one now shows an error. A message you can act on beats a file you cannot locate.

Importing has not changed. Neither has the web version, where your browser keeps handling
downloads, nor the Android and iOS apps.

## 1.1.2

**The app file is now called Daylo.** It used to be called activity-tracker, the name
the project had before it was Daylo. Nothing else changes: your data stays where it
was, and installing this version over an older one cleans up the old file and fixes
your shortcuts. If you launch Daylo from a terminal on Linux, the command is now
`Daylo`.

**Backups you export are now called `daylo-backup-2026-09-09.json`** instead of
`activity-tracker-backup-...`. Backups you already have still open: Daylo reads what
is inside the file, not its name.

**A CSV export is no longer called a backup.** It is now saved as
`daylo-export-...csv`, and the export window says plainly that CSV is for Excel or
Google Sheets and cannot be loaded back into Daylo. Only the JSON backup can. Nothing
about the file changed, only its name and what we tell you about it, because calling
it a backup invited keeping one as your only copy.

# Changelog

What changed in each release, for the people who use Daylo. Earlier versions are not
listed: this file starts at 1.1.2, when the first change worth warning about arrived.

## Unreleased

**Daylo opens on the month.** It used to open on the year on anything wider than a phone,
so the same person met a different first screen on their laptop than on their phone. The
month is where you tick today off, which is what most people open Daylo to do.

This only changes where Daylo starts for someone installing it now. If you have used
Daylo before, it remembers the view you were last on, and that does not change.

**Android can remind you each evening.** A daily notification asks how the day went, at a
time you choose, so a day does not go by unlogged. It is off until you ask for it: after
you create your first habit Daylo offers it once, and if you say no it does not ask again.
You can turn it on, move the time or turn it off from the menu at any time, and it stays
on after you restart your phone. Android decides the exact minute, so it may arrive a few
minutes either side of the time you picked. If the phone has been sitting unused for days,
Android can hold it back further while it sleeps; opening Daylo puts the next one back on
time.

The reminder is only on Android. On a computer a notification could only arrive while
Daylo was already open, which is not a reminder.

## 1.1.3

**Exporting now asks you where to save.** Before, Daylo handed the file to the system and
the system decided where it went, usually your Downloads folder, without telling you. Now
a normal save window opens, you choose the folder and the name, and Daylo tells you where
the file ended up.

On Linux this also fixes something that would have been worse: the file could end up in a
folder that belongs to the app rather than to you, and nobody would have thought to look
there. A backup you cannot find is not a backup.

**If the save window cannot open, Daylo tells you before it starts.** On Linux the save
window is provided by your desktop, and a few setups do not have one. Daylo checks, and
says so plainly instead of appearing to save a file that went nowhere. A message you can
act on beats a backup you cannot locate.

**On a Mac, Daylo now opens.** Before, macOS said the app was damaged and offered only to
move it to the Trash, with no way around it. It was never damaged: the app was not signed
in the way macOS expects, and that is what a Mac reports when the signature does not match
the app. The first time you open this version, macOS will still ask: choose Done, then
open System Settings, go to Privacy & Security, and press Open Anyway.

**Days in the year view no longer grow when you point at them.** On Mac and on Linux,
hovering a day made its square stretch and push the rest of the year out of the way. It
had been doing that since 1.1.0 and never showed up in our checks, because the checks ran
in a different browser engine to the one those apps use.

**The checkbox looks like part of Daylo.** It used to be your desktop's own checkbox, so
the same app showed a blue square on one computer and a green one on another, next to
Daylo's green. Daylo draws it now, so it looks the same everywhere. The extra tick that
sat at the end of a completed row is gone with it: the checkbox already says so.

**On Android, exporting now saves a file at all.** Before, tapping Export looked like it
worked and wrote nothing: the button went away and no file was ever created anywhere. If
you exported a backup before changing phones, you had nothing to restore from. Now
Android's own save window opens, you choose where the file goes, and Daylo confirms it.

Importing has not changed, and neither has the web version, where your browser keeps
handling downloads.

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

# Changelog

What changed in each release, for the people who use Daylo. Earlier versions are not
listed: this file starts at 1.1.2, when the first change worth warning about arrived.

## Unreleased

**Daylo opens on the month.** It used to open on the year on anything wider than a phone,
so the same person met a different first screen on their laptop than on their phone. The
month is where you tick today off, which is what most people open Daylo to do.

This only changes where Daylo starts for someone installing it now. If you have used
Daylo before, it remembers the view you were last on, and that does not change.

**Colors another activity is already using are dimmed.** When you create or rename an
activity, the colors your other activities wear are faded and say "already in use" when
you point at them. They can still be picked: two activities can share a color, it is just
harder to tell them apart. If you have used every color, nothing is dimmed, because at
that point it would only make the palette look broken.

**The year is one calendar now, instead of twelve small ones.** On a computer the year
used to be twelve separate month blocks, and a run that crossed the end of a month looked
like two shorter runs. It is now a single strip, a column per week, so a long run reads as
a long run. Underneath it you get the days you were active, how many things you completed,
and how much of each month you finished, and any of those months takes you into it.

**You can also read the year one activity at a time.** A new switch in the year view, All
activities or By activity, draws the same year once per activity in its own colour, with
the days it has behind it and the run it is on. On a phone each activity gets the last
twenty six weeks instead, one block per week, darker the more days of that week you did,
which is as much as a phone can show a week at a time and still be worth looking at.

Daylo remembers which of the two you were reading.

**The year can be walked with the arrow keys.** Tab once to reach the calendar, then move
a day at a time up and down or a week at a time left and right. It says the date and what
you did that day as you go, which it never did before.

**Your streak no longer resets on the first of January.** Daylo worked out your current
streak from the year you happened to be looking at, so on New Year's Day everybody's run
started again at one, whatever they had done in December. It counts across years now,
which is what a run is.

**And it no longer reads zero every morning.** Until today is ticked, the streak counts up
to yesterday. Before, it showed 0 from midnight until you opened Daylo and ticked
something, which is a strange thing to tell somebody who has not missed a day. It ends
when a whole day goes by unticked, as it always did.

Longest streak is now the best you have ever had rather than the best of the year on
screen. And days dated in the future, which can arrive in a file you import, no longer
count as active days or towards either streak.

Each figure now says what stretch of time it covers, under the number: your active days
are this year's, your current streak is today's, and your longest is the best of all time.

You may see these numbers change the first time you open this version. Nothing happened to
your data; only the counting changed.

**Android can remind you each evening.** A daily notification asks how the day went, at a
time you choose, so a day does not go by unlogged. It is off until you ask for it: after
you create your first habit Daylo offers it once, and if you say no it does not ask again.
You can turn it on, move the time or turn it off from the menu at any time, and it stays
on after you restart your phone. Android picks the exact moment: usually close to the time
you chose, and later if the phone has been asleep. It does not need the app open. Opening
Daylo puts the next one back on time.

The reminder is only on Android. On a computer a notification could only arrive while
Daylo was already open, which is not a reminder.

**Buttons stop glowing after you tap them.** On a phone, tapping the Year or Month switch
left a green ring around it, and if you then swiped to the other view the ring stayed
behind on the one you had left, so two buttons looked picked at once. Rings are for
keyboards now: they appear when you tab to something and not when you touch it. Text
fields still show one when you tap into them, which is where you want it. The year
calendar on a computer keeps its ring on click, because that is also how it shows you the
day you are on when you walk it with the arrow keys.

**The Android reminder actually arrives.** It could be switched on and nothing was ever
scheduled: the part of the app that hands the daily time to Android was being stripped out
when the app was packaged for release, so the phone rejected every reminder. It only
happened in the published builds, which is why it took a phone to find.

**A reminder that could not be set no longer looks like one that was.** On Android the
switch could stay on when the phone had refused to schedule anything, so the app claimed a
reminder that was never going to arrive. Daylo now waits for the phone's answer, turns the
switch back off if the answer is no, and says so.

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

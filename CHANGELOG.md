# Changelog

What changed in each release, for the people who use Daylo. Earlier versions are not
listed: this file starts at 1.1.2, when the first change worth warning about arrived.

## 1.6.0

**The month view now shows the end of the month before when the 1st falls on a Sunday.**
Those months used to start flat against the edge of the grid, so on the 2nd almost
everything you had done was on the previous screen. If you had turned up four days running,
the calendar you opened looked empty.

**Adding a habit no longer fades the days you already finished.** A day was shaded by how
many of your habits you had done that day, counted against the habits you have now, so
creating a new one turned the months behind you paler even though nothing about them had
changed. Each day is now read against the habits that existed when you lived it.

**Your run of days is now at the top of the screen, at every window size.** It says how
many days in a row you have logged something, and a small flame says whether today is
already one of them: hollow until you log something today, filled once you do. If you have
no run going, there is nothing there.

**Today's circle now shows whether you have logged today.** It used to be filled green from
the moment the day started, so the one bright thing on the calendar said you had done
something when you had not. Now it is a dashed outline until you log anything, and filled
once you do.

**Statistics now shows three figures: Active Days, This Month and Longest Streak.** Your
current streak is no longer repeated there, or in the line under the year on a phone, and
Longest Streak takes the full width of the panel.

**On Android, tapping the daily reminder opens today, ready to log.**
It used to open Daylo wherever you had left it, so you still had to find today and tap it.
Now the tap opens today's list, whether Daylo was still open in the background or not, and
puts it in front of Settings or the summary of your run, if either was open.

**The reminder no longer asks on a day you already logged.**
If you log before its time, it waits until tomorrow. Take back the day's last tick and it
comes back for today, if its time has not passed yet. It still comes every day you do not
open Daylo.

**A no to notifications is no longer a dead end.**
Android stops asking after you say no twice. The reminder's switch now says notifications
are off for Daylo and takes you to the phone's notification settings. Allow them there,
come back, and the reminder is on, without restarting Daylo. In the phone's settings, the
reminder now shows as "Daily reminder" instead of "Default".

**Daylo no longer closes by itself right after opening on slower Android phones.** When
the phone was busy while Daylo started, the app could shut about ten seconds later, before
you could do anything. Now it opens as usual, however long the phone takes.

**If Daylo cannot make sense of what it saved, it no longer starts empty on top of it.** A
saved file in a shape Daylo did not expect used to open as a brand new app, and that empty
app was saved over your days straight away. Now it shows the screen that lets you keep a
copy of that file instead, and leaves the file as it was.

**The anonymous check-in now also says whether you have started a habit.** It is only a
yes or a no: never how many habits you have, or what they are. Settings lists everything
the check-in sends under What gets sent, and you can turn it off there at any time.

**On Android 15, the buttons at the bottom are no longer under the navigation bar.**
With the three navigation buttons, the bar covered the green button, the day's Done, and
the buttons of messages and questions, and the clock and battery sat over the top of the
screen. Everything now stays clear of both bars, with buttons or with gestures.

**In the Year view, Today takes you to today.**
It used to only move to this year, so on this year it did nothing. Now it always opens the
month with today in it, where today can be logged.

**Tap your run of days at the top of the screen to see more about it.** It opens a short
summary: your run right now, the longest you have ever had, and which of the last 14 days
you logged something on. When the run you are on is your longest, it says so.

**The Today bar is now there at every window size.**
It used to show only on a phone. On a window between a phone and a full desktop, which is
where Daylo opens on many computers, nothing on screen said where to log today. Now the
bar sits above the calendar at every width, one tap from today.

**The morning after you miss a day, Daylo tells you that yesterday can still be saved.**
When a run of three days or more stopped yesterday, a row joins Today above the calendar:
"Yesterday is still open", with the number of days in a row that logging it will make.
Tapping it opens yesterday, which says the same, and once you tick something it shows the
run you kept. The row goes away by itself once yesterday is logged, or the next day.
On the calendar, yesterday gets a thin grey dashed outline, lighter than today's, so the
two are not mistaken for each other. On any other morning nothing changes.

**Your first day now starts at the top of the screen.** With no activities yet, the Today
bar says "Add your first activity", and tapping it opens today with the name field ready.
The activity you add is marked for that day, and the sheet tells you once that today is
in. The next morning the bar says what logging today will make: two days in a row. Before,
the only hint was a grey line under the calendar, and most ways in left today empty with
four zeros underneath. The Today square is now dashed until you log something and filled
once you have, the same as the calendar, and the round button on phones waits until there
is an activity to manage.

**On Android, Daylo offers the daily reminder for nine in the evening, once your first day is in.**
It still asks on the day you add your first activity, but only after you close that day, not
over it while you are still logging, and it suggests nine in the evening instead of the next
hour. Closing it without answering no longer counts as a no: it asks again on a later day,
after you log something, and after the third time it stops. "Not now" still means no.

**Daylo no longer puts a line about the anonymous check-in at the top of the screen.** It
used to appear once on each installation: the first time a new installation opened, or
the first time after updating from a version that did not have the check-in yet. The
check-in works as before: on for new installations, off if you updated from a version
without it. You can see what it sends, and turn it on or off, in Settings, under Anonymous
check-in.

**Daylo no longer offers the daily reminder when it is already on.**
If you turned the reminder on in Settings before Daylo got round to offering it, the offer no
longer asks you about something you have already done.

## 1.5.5

**Daylo from Google Play installs as an app of its own.** It is the same Daylo, but it does not update the copy you got from the website, and that copy does not update it. Daylo from the website keeps updating as before. To move your days from one to the other, use Export, then Import.

## 1.5.4

**Daylo from Google Play reminds you around the time you chose.** On recent phones Android picks the exact moment, as it does for most apps, and the settings screen says so instead of offering a phone setting that would not list Daylo. Daylo from the website keeps working as before, including on-time reminders for anyone who allowed them. The Google Play version also never offers updates from anywhere else. Google Play keeps it up to date.

## 1.5.3

**On Android, the button that offers a new version now downloads Daylo itself.** It used
to open the Daylo website, where the one file for your phone sits among the ones for
Windows, Mac and Linux, and finding it was your errand. Now the download starts straight
away, and it is the version the message just named rather than whatever happens to be
newest that minute.

**Daylo now opens on today.** It used to open wherever you left it, so if you had been
looking back at March, March is what you saw when you came back, with today a swipe away
and nothing to tell you. If a day was open when you closed it, that came back too, over a
day that was no longer the day. The same went for the year: one tap on Year, or one
sideways swipe on a phone, and Daylo kept opening there, where there is no Today bar and
no quick way to tick today off. It opens on this month now, and the year is one tap away.
How you like the year read is still remembered.

**Daylo now notices that a new day has started, even if you never closed it.** Before, if you ticked your habit in the evening and left Daylo open overnight, the next morning it still showed yesterday as today, with your habit already marked as done. Now it moves to today, on the month view, as soon as you come back to it, or at midnight if you are looking at it. If you are writing something when the day changes, you do not lose it: Daylo stays on the old day until you save it or clear it.

**On a phone, the list the green button opens now scrolls with your finger.** With several
activities it is taller than the screen, and it used to stay put: pushing it up did nothing,
pulling it down closed it, and whatever was at the bottom, including your statistics, could
not be reached. Now it moves like any list. Pulling it down once you are back at the top
closes it, as does the grey bar at the top or a tap above it.

**On a computer, the pointer now turns into a hand over anything you can press.** It stayed
an arrow over the days, the buttons and the switches, so nothing on the screen looked like
it could be clicked.

**Each new activity now starts on a color you are not using yet.** Every one used to start
on the same green, so two or three made without stopping at the colors all came out alike,
and their dots in the month could not be told apart. Colors brought in from a backup count
too, however they were written. You can still pick any color you like, including one
already taken.

**Counts of one now read as one.** The calendar said "1 active days" and "1/1 activities",
which is exactly what everybody saw on their first day, and restoring a backup asked whether
to replace "1 activities, 1 logs". They read "1 active day", "1/1 activity" and "1 activity,
1 log" now, in the year summary, on the Today bar, when restoring a backup and in what a
screen reader says for each day.

**On Android, the evening reminder now comes back by itself after the phone restarts or
Daylo updates.** Until now a restart took it away, and it stayed away until you opened
Daylo again: the switch still said on, but no reminder came. That missed exactly the
evenings when you had not opened the app, which are the ones the reminder is for. Open
Daylo once after installing this version, and from then on a restart or an update keeps
your reminder where you set it.

**An empty Daylo now offers to bring your backup back.** After reinstalling, moving to a new
phone, or getting Daylo from somewhere else, the app opened looking like the very first
day, and nothing said a backup could come back: Import was behind the gear, in Settings.
It was easy to start again by hand instead. Now the empty month says "Used Daylo before?
Import your backup." right under the calendar, and it goes away as soon as you have an
activity.

**When Daylo cannot save, it now tells you clearly, and the warning stays until you close it.** Before, if your device refused to save, for example because it was full, a short note appeared in Spanish and vanished after three seconds. Now it tells you to open Settings and export a backup, and it waits for you. It goes away by itself once saving works again, and if you close it while saving keeps failing, it tells you again the next time saving fails, once five minutes have passed.

**Opening Daylo again brings back the window that is already open.** Before, opening Daylo a second time on a computer opened a second window, and one window could save over what you marked in the other, so a day you ticked could quietly come back unticked. Now opening Daylo again brings back the window you already have, even if it was minimised. This doesn't apply yet to the Snap Store version. In a browser, keep Daylo open in a single tab.

## 1.5.2

**With the anonymous check-in off, Daylo now sends nothing at all until you answer its
question.** After a week of use it asks once how things are going, and that question used
to report its own arrival the moment it appeared, before anybody had touched it. It carried no
number and nothing about you, but it was still a connection to our server from a copy that
had been told it would make none. Your answers still travel if you give them: a star when
you press it, and what you write when you send it. Nothing else does.

**Send feedback now says what pressing a star actually does.** It said "Only what you type,
and only when you press Send", and in the app that was not true: the star is sent the
moment you press it, with no draft and no Send button of its own. On the website the same
row opens your email and Daylo sends nothing itself. Each one says its own thing now.

**If Daylo cannot open your data, it now says so and offers you a copy of it.** Until now
it showed the loading screen and stayed there, with no menu, so no way to export and no way
to know anything had happened, while everything you had tracked sat on the device
untouched. There is a screen now. It says your data is still there, and it hands you the
file exactly as it is, which is the thing to keep and the thing to send us.

**Restoring a backup brings your activities back exactly as you wrote them.** Daylo used to
rewrite them on the way in: a name like "Read <10 pages>" came back as "Read", "Peso <->
medidas" lost its middle, and "Gym <3" turned into something with an ampersand in it. It
only ever happened when restoring, which is the one moment you are counting on nothing
changing. And a long name used to stop the whole file loading, so a backup Daylo itself had
written could be refused. Names are capped where you type them now instead.

**On Android, deleting your last activity now takes the daily reminder down with it.** It
was meant to, and it never did: Daylo asked the phone what was scheduled before cancelling,
the phone answered with an empty list whatever was really set, and so nothing was
cancelled. The reminder went on arriving every night over an app with nothing left in it.

**Importing a backup can be done with the keyboard.** The place you drop a file could only
be reached by clicking it: with a keyboard, or with a screen reader, Import opened and
there was nothing to press but Cancel. It is an ordinary file control now, so Tab reaches
it and Enter opens the chooser.

## 1.5.1

**On Android, Daylo can now tell you when your reminder will not arrive at the time you
set it for, and take you to where that is changed.** Android decides when an app may wake
a sleeping phone, and unless it is allowed to, a reminder set for nine in the evening can
turn up an hour or more later. The reminder itself has not changed and is still set the
moment you turn it on. What is new is that the settings screen says so when it applies,
with one row that opens the phone's own "Alarms & reminders" screen, and the row goes away
once you have been there.

**On Android, a daily reminder now behaves the same on its tenth day as on its first.**
It was set once with permission to wake a sleeping phone, and every day after that it was
quietly put back without it, so the first reminder could arrive while the phone was idle
and the later ones waited until it was picked up. Nothing you set asked for that. Both are
now scheduled the same way.

**The number shown under "What gets sent" now says when it is only an example.** With the
daily check-in off there is no number, and Daylo filled that line with one that belongs to
nobody so you could see the shape of the message. It did not say so, which left the panel
telling you the one thing that is not true about it. It sends nothing while the check-in
is off, and the line now says the number is only an example.

## 1.5.0

**On Android, the check-in now says how your copy was installed.** The settings sheet shows
the word it sends, under What gets sent, so you can see which one yours is. It still says
nothing about you: everyone who installed the same way sends the same word.

**After you answer "How is it going?", Daylo now leaves you an address.** One line, under
the note about what gets sent: write to us if you want to tell us how you use it. It is
there whatever you pressed, because the people we hear from least are the ones who did not
love it. On a copy installed from the Microsoft Store there is also a line offering to rate
Daylo there, once, and it appears whatever you pressed too.

**The Android app downloaded from the site now tells you when a newer Daylo is out.** It
shows the same quiet card the desktop shows, in the same place, with one button that opens
the download. Nothing installs itself: Android asks you whether to update when you open the
file, and your activities stay where they are. Like on the desktop, the check can be turned
off in Settings, it asks GitHub and not us, and it carries nothing about you.

**The list of checksums published with each release is now correct for every file.** One
line, for the small file Daylo reads to find out a new version is out, described the
previous version, so checking every file at once reported one failure. The files you
download were always correct.

**If you press the wrong star, press another one: the last one you press is your answer.**
Daylo asks how it is going just after you close a day, and the stars come up over the
calendar, so a press meant for another day could answer a question you had not read, and
there was no way back from it. A second press now replaces the first. The stars also take
no press at all while the question is still appearing.

## 1.4.2

**The day sheet slides in and out again.** Tapping a day put the sheet on the screen
already arrived, and closing it took it away in the same instant: no movement either way,
on a screen where everything else moves. It comes up from under the bottom edge now and
goes back down the same way, and it keeps the day written on it until it has gone.

**Everything there is to decide is in one place, called Settings.** Your daily reminder on
Android, export and import, privacy, and who made Daylo. On a computer it opens as a panel
beside the calendar; on a phone it takes the screen. The menu of six entries is gone with it:
on a computer the corner of the header is a gear, and on Android it is a menu of two, Daily
reminder and Settings.

**Privacy is one place to decide and one place to read.** The anonymous check-in is a single line
with its switch, and what it is for, everything it sends and what turning it off costs are
together under What gets sent. Send feedback is a row you can press, and on
daylo.henfrydls.com it now opens your email, where before it did nothing. The privacy policy
sits at the foot with the website, the source and the license.

**The version lives under About.** Pressing the row asks whether there is a newer one.
Installing is the small word beside the number and nothing else, because a row is easy to
press by accident and installing closes Daylo and opens it again. The grey lines between rows
are gone; the space around each one does that work now.

**The daily reminder stays out of the way until you want it.** With it switched off you see
only the switch; the time, and a note that Android may deliver it a few minutes late, open
out when you turn it on. When Daylo offers a reminder after your first activity, it proposes
the next hour on the hour, so one agreed to at ten to nine arrives at nine. From ten at night
until six in the morning it offers eight in the evening instead. If you already picked a time
yourself, that is the one it offers.

**Touching anything in the activities sheet no longer makes the page behind it flicker.**
Every press, the edit pencil included, took the blur off the calendar underneath and put it
back when you let go. The sheet treated any touch as the beginning of a drag; it waits for
your finger to actually go down the screen now, and while you drag it the blur fades out
with the sheet rather than vanishing at the first touch.

**Export and Import come up and go down.** They used to be simply there, and then simply
gone, which reads as the screen flickering rather than as something opening and closing.
On a phone they come up from the bottom edge and go back down the same way, like the sheet
you get when you tap a day; on a wider screen they grow into the middle, where there is no
bottom edge to come from. Every other dialog moves the same way now: adding or editing an
activity, the one that asks how Daylo is going, and the ones that ask before doing
something.

**Saying no to deleting an activity no longer closes the panel you said it in.** Pressing
the bin asked whether you were sure, and whichever way you answered that question, the
activities panel went with it. Now it stays open, in the same place, with the activity
still in it. Escape does the same: it takes away whatever is in front of you and leaves
what is behind it alone.

## 1.4.1

**Daylo now says how it was installed when it checks in.** One word, such as store or
installer, so we can tell which door people come in by. It is still the same anonymous
message, it still says nothing about you or what you track, and it is still one switch
away in the menu. The whole message is written out in **What gets sent**, where it now has
five lines instead of four.

**On Android the back button now closes what is open, instead of closing Daylo.** A dialog,
a sheet or the day you tapped goes away with one press, the way the back button works
everywhere else on the phone, and the one underneath stays if there was one. On the main
screen it still closes Daylo, because that is what it is for.

**The year bar says what its second number means.** It read "20/277 days active", and the
277 looked like a mistake; it is how many days of the year have gone by. It now reads "20
of 277 days so far", and on a year that has ended it drops the "so far", because every day
of that one has gone by already. The counting has not changed.

**Sliding between Year and Month now follows your finger.** The two views sit side by side,
Year on the left and Month on the right, the way the toggle shows them, and dragging moves
them together instead of swapping one for the other when you let go. A drag that is short
and slow goes back where it was. Tapping the toggle or a month card travels the same way,
so the three ways between the views look like one thing.

Dragging right in Year used to go to Month as well, which left both directions meaning the
same. It is the end of the line now, and it gives a little to say so. If your phone is set
to reduce motion, nothing slides: the view changes at once, as before.

When you let go, the view carries on at the speed your hand had and is then put down
rather than snapped into place. Letting go of a slow drag and letting go mid-flick are
different things, and they now look it. The ends of the line give under your finger and
keep giving, less and less the further you push, which is how you can tell a wall from a
view that is not there.

**The day sheet no longer offers Done when there is nothing to do.** Opening a day before
you have created any activity showed two buttons, Create your first activity and Done, when
only the first one does anything. The cross in the corner still closes it, as it always did.

**On a phone the calendar now fills the screen.** A year with nothing in it used to end
halfway down, leaving grey below it where sliding between the views did nothing, and the
card jumped to a taller size the moment you started to drag. It reaches the bottom now, so
there is nowhere on it that does nothing and nothing moves that you did not move.

## 1.4.0

**The line about the check-in now says whether it is on or off.** When you updated from a
version that had no check-in, the line said "Anonymous check-in." and offered to turn it
on, which on a phone left the word "on" as the loudest thing on screen and read like the
opposite of the truth. It now says "Anonymous check-in is off.", and the check-in itself
has not changed: it stays off until you turn it on.

**Daylo asks how it is going after a week, not after two.** It used to need fourteen days
with something marked on eight of them, which almost nobody reaches. Now it is a week from
your first record, or from the first time you opened Daylo if that came earlier, and no
other count stands in the way. It still appears once, still waits until you have marked
something that day, and closing it still closes it for good.

**Daylo now asks how it is going with five stars instead of an email.** Tapping one is the
whole answer, and there is a box afterwards if you want to add a line. The email link had a
habit of doing nothing on Linux and Android while telling you it had worked, so an answer
you thought you had sent never arrived anywhere. What you tap arrives without your name, and
if you write something and it does not go through, the app now says so instead of thanking
you. In a browser the email link stays, because there it works.

**The browser version no longer invites you to write on its own.** A short note used to
appear there after a week asking how it was going; the app itself now asks with five stars
instead, and the note was only ever the browser's stand-in for that. You can still write
whenever you like: **Send feedback** is in the menu, as it always has been.

**Daylo now tells you when a new version is out.** A line appears under the header with the
new version in it and an Update button beside it, and the app downloads it, installs it and
opens itself again. The cross puts the line away and leaves a dot on the menu, so the offer
is still there when you want it.

Not every copy can be updated this way. On Windows, on Mac and on the Linux AppImage, Daylo
does the whole thing itself. The Debian and Ubuntu package needs your administrator password
to install, which Daylo does not ask anyone for, so it points you at the downloads page
instead. A copy from the Microsoft Store says nothing at all, because the Store is already
keeping it up to date.

**Check for new versions** is in the menu if you would rather look yourself, and it is also
where you can stop Daylo from looking on its own. Looking asks GitHub whether a newer version
exists and sends nothing about you, and nothing is installed unless it really came from us.

## 1.3.0

**Daylo can ask how it is going.** After about two weeks of use, with days marked on at least
eight of them, a short note appears once under the header: the person who made Daylo would
like to hear how those two weeks went. It opens an email to daylo@henfrydls.com with three
lines to fill in, or you close it with the cross and it does not come back. Nothing is counted
about whether you saw it or what you did with it. If you would rather write on your own time,
the menu now has Send feedback, which opens the same email whenever you want.

**An anonymous check-in, on for new installations and off if you are updating.** Once a
day at most, Daylo can send four things: a random number made on your device, the app
version, your system and the date. Nothing about what you track, ever. On a device that
installs Daylo for the first time it starts on, and the app says so on the first screen
you see, with a link to where you can look at it or turn it off. If you are updating from
an earlier version it stays off, because you installed Daylo when it said it sent nothing
anywhere; the same line offers to turn it on.

The switch is in the menu, under Anonymous check-in, and the sheet there shows exactly
what would leave, with the real values while it is on. Turning it off sends one last note
saying so, deletes the random number from your device, and then nothing at all.

The check-in is sent by the native part of the app, not by the part that draws the screen,
which still cannot reach any server. The code that sends it is one short file in the public
repository, with the address it sends to in plain view. The web demo and the self-hosted
Docker version do not have it. The privacy policy at daylo.henfrydls.com/privacy says what is
sent, where it goes and how long it is kept.

## 1.2.0

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

**Buttons at the bottom of a dialog are no longer pressed against the edge.** On a phone,
dialogs slide up from the bottom, and the button that finishes the job sat right on top of
the bar your phone draws down there, with nothing around it. It has room now, in Export,
Import, the activity form and the daily reminder.

**The mouse wheel scrolls the page again.** In the desktop app the wheel did nothing, and
the only way down was to drag the scrollbar. It had been that way for several versions;
the year view is simply the first screen with enough on it for anyone to notice.

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

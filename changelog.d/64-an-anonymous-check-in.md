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

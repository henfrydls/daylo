**An anonymous check-in, off until you turn it on.** Until now Daylo sent nothing anywhere,
and by default that is still true. On the second day you use it, the app asks once whether it
may send a daily check-in. If you say no, it never asks again on that device and nothing is
ever sent. If you say yes, once a day at most, and only on a day you open Daylo, it sends four
things: a random number made on your device, the app version, your operating system and the
date. Never your habits, never the days you marked, never your notes. It is how we find out
whether people keep using Daylo, which we had no way of knowing.

You can see the message before deciding: the question has a What gets sent section that shows
it whole, and the switch in the menu, under Anonymous check-in, shows the real values while it
is on. Turning it off sends one last message saying so, deletes the random number from your
device, and then nothing at all. The app tells you that before you turn it off.

The check-in is sent by the native part of the app, not by the part that draws the screen,
which still cannot reach any server. The code that sends it is one short file in the public
repository, with the address it sends to in plain view. The web demo and the self-hosted
Docker version do not have it. The privacy policy at daylo.henfrydls.com/privacy says what is
sent, where it goes and how long it is kept.

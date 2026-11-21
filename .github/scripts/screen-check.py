"""Did the app paint, and did its stylesheet reach the pixels?

Two different failures, two different answers.

A blank screen means the webview never loaded the frontend. That one a colour count
catches: a blank screen is one colour, two with a bar drawn across it.

A styled page and an unstyled one a colour count cannot tell apart at all, which was
measured rather than assumed: rendered at 1080x1770, Daylo has 2685 distinct colours with
its stylesheet and 2748 without it. The unstyled page has *more*, because the default
serif at default sizes antialiases into more shades than the app's own type does. Any
threshold that passes one passes the other.

What does tell them apart is colour that can only come from the stylesheet. Daylo's
greens are Tailwind's emerald scale, written as oklch. Unstyled none of them is on the
screen: buttons are grey system buttons and links are the browser's blue. Measured when
this check counted only emerald-500 (#00bc7d): 2275 pixels styled against 0 unstyled, and
0 again on the real unstyled screenshot an emulator produced.

Counting only emerald-500 stopped working with 1.6. On a fresh install nothing paints it:
today is a dashed outline until something is logged, and the green button is hidden while
there are no activities. The first-day screen is drawn correctly and scored 0 (issue 280).
So the check now counts four emerald tones, the ones the first day does draw as well as
the one a day with logs draws:

  emerald-50  #ecfdf5  the Today bar's fill
  emerald-200 #a4f4cf  the Today bar's border
  emerald-700 #007a55  today's dashed outline and the "Import your backup" link
  emerald-500 #00bc7d  the green button and logged days

Measured below the status bar, tolerance 8, on 1080x1920 emulator screenshots:

  first-day 1.6 smoke screenshot (run 44667454485)    153,139
  month view with logged days (run 43788419365)      175,347
  blank white page, the app had crashed                     0
  Android's home screen, Daylo's icon on it                 243

The home screen is there because it is the closest thing to a false pass: its wallpaper
and icons are full of greens. Counting any greenish pixel passes it with 10,911, and the
old rule passed it too, 379 against a threshold of 300. Four exact tones do not.

It also answers a question one step further in. A browser that knows @layer but not
oklch (Chromium 99 to 110) lays the page out correctly and drops every colour
declaration. That page looks nearly right and is not: none of the four tones is on it,
and this check fails it.
"""

import sys
from PIL import Image

# The status bar is Android's, not the app's, and it has content of its own.
STATUS_BAR = 150

# Emerald tones as this stylesheet renders them: the values that come out of oklch() in
# sRGB, read off a real screenshot, which is what ends up on the screen.
EMERALD = {
    "50": (0xEC, 0xFD, 0xF5),
    "200": (0xA4, 0xF4, 0xCF),
    "500": (0x00, 0xBC, 0x7D),
    "700": (0x00, 0x7A, 0x55),
}
# Wide enough for antialiasing and for a browser rounding the colour conversion a little
# differently. It cannot be much wider: emerald-50 is only 19 away from white in its red
# channel and 13 away from the page's grey background (#f9fafb), and at 16 it already
# takes in more than three times as many pixels as at 8.
TOLERANCE = 8
# The first day has about 153,000 of them, a day with logs more. The home screen with
# Daylo's icon on it has about 240, a blank page none, and an unstyled page has no
# emerald to count. Two thousand is far below the first and far above the second.
MIN_EMERALD_PIXELS = 2000
# One flat colour, or two with a bar across it. Twenty is far from both and far from any
# real page.
MIN_COLOURS = 20


def main(path: str, status_bar: int = STATUS_BAR) -> int:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if status_bar and height > status_bar:
        image = image.crop((0, status_bar, width, height))
    # getcolors rather than getdata: one pass, no list of two million tuples, and it is
    # not the call Pillow is in the middle of removing. The argument is a ceiling on how
    # many distinct colours it will tolerate before giving up and returning None; every
    # colour a 24-bit image can hold is under it, so it never does.
    histogram = image.getcolors(1 << 24)
    if histogram is None:
        print("::error::The screenshot has more colours than fit in 24 bits, which cannot happen.")
        return 1

    colours = len(histogram)
    # The tones are more than twice the tolerance apart, so no pixel is counted twice.
    per_tone = {
        name: sum(
            count
            for count, pixel in histogram
            if all(abs(pixel[i] - tone[i]) <= TOLERANCE for i in range(3))
        )
        for name, tone in EMERALD.items()
    }
    emerald = sum(per_tone.values())
    breakdown = ", ".join(f"{name}: {count}" for name, count in per_tone.items())
    print(f"below the status bar: {colours} distinct colours, {emerald} pixels of emerald ({breakdown})")

    if colours < MIN_COLOURS:
        print("::error::The app is running but the screen is blank. The webview did not paint.")
        return 1

    if emerald < MIN_EMERALD_PIXELS:
        print("::error::The app painted, but its own colours are not on the screen: only")
        print(f"::error::{emerald} pixels of its emerald greens where there should be thousands.")
        print("::error::The stylesheet did not apply. Look at the screenshot in the artifact.")
        return 1

    return 0


if __name__ == "__main__":
    # Second argument: how much to cut off the top. Only ever passed by hand, to score a
    # browser screenshot that has no Android status bar on it.
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else STATUS_BAR))

"""Did the app paint, and did its stylesheet reach the pixels?

Two different failures, two different answers.

A blank screen means the webview never loaded the frontend. That one a colour count
catches: a blank screen is one colour, two with a bar drawn across it.

A styled page and an unstyled one a colour count cannot tell apart at all, which was
measured rather than assumed: rendered at 1080x1770, Daylo has 2685 distinct colours with
its stylesheet and 2748 without it. The unstyled page has *more*, because the default
serif at default sizes antialiases into more shades than the app's own type does. Any
threshold that passes one passes the other.

What does tell them apart is a colour that can only come from the stylesheet. Daylo's
primary button is emerald, written as oklch and rendered #00bc7d. Styled, that tone
covers a couple of thousand pixels. Unstyled it is not on the screen at all: the button
is a grey system button. Measured on the same two renderings: 2275 pixels against 0, and
0 again on the real unstyled screenshot an emulator produced.

It also answers a question one step further in. A browser that knows @layer but not
oklch — Chromium 99 to 110 — lays the page out correctly and drops every colour
declaration. That page looks nearly right and is not: this check fails it.
"""

import sys
from PIL import Image

# The status bar is Android's, not the app's, and it has content of its own.
STATUS_BAR = 150

# emerald-500 as this stylesheet renders it. Not the hex from the palette: the value that
# comes out of oklch() in sRGB, which is what ends up on the screen.
BRAND = (0x00, 0xBC, 0x7D)
# Wide enough for antialiasing and for a browser rounding the colour conversion
# differently, narrow enough that nothing grey or blue can wander in. The unstyled
# renderings score zero at nearly twice this.
TOLERANCE = 24
# The reference has about 2,200 pixels of it. Anything above a few hundred means the
# button is there; zero means the stylesheet is not.
MIN_BRAND_PIXELS = 300
# One flat colour, or two with a bar across it. Twenty is far from both and far from any
# real page.
MIN_COLOURS = 20


def main(path: str, status_bar: int = STATUS_BAR) -> int:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if status_bar and height > status_bar:
        image = image.crop((0, status_bar, width, height))
    pixels = list(image.getdata())

    colours = len(set(pixels))
    brand = sum(
        1
        for pixel in pixels
        if all(abs(pixel[i] - BRAND[i]) <= TOLERANCE for i in range(3))
    )
    print(f"below the status bar: {colours} distinct colours, {brand} pixels of brand green")

    if colours < MIN_COLOURS:
        print("::error::The app is running but the screen is blank. The webview did not paint.")
        return 1

    if brand < MIN_BRAND_PIXELS:
        print("::error::The app painted, but its own colours are not on the screen: only")
        print(f"::error::{brand} pixels of #{BRAND[0]:02x}{BRAND[1]:02x}{BRAND[2]:02x} where there should be thousands.")
        print("::error::The stylesheet did not apply. Look at the screenshot in the artifact.")
        return 1

    return 0


if __name__ == "__main__":
    # Second argument: how much to cut off the top. Only ever passed by hand, to score a
    # browser screenshot that has no Android status bar on it.
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else STATUS_BAR))

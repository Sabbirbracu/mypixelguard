# Draws the logo artwork used by the Windows installers (NSIS header + sidebar, MSI banner + dialog) as 24-bit BMPs.
from PIL import Image, ImageDraw, ImageFont
import os
here = os.path.dirname(__file__)
root = os.path.join(here, "..", "..")
out = os.path.join(here, "..", "src-tauri", "installer")
fonts = os.path.join(root, "Sources/MetaDataRemover/Fonts")
mark = Image.open(os.path.join(root, "Resources/Brand/MyPixelGuard-Mark-Light.png")).convert("RGBA")
mark_dark = Image.open(os.path.join(root, "Resources/Brand/MyPixelGuard-Mark-Dark.png")).convert("RGBA")
bold = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Bold.ttf"), n)
reg = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Regular.ttf"), n)

def wordmark(d, x, y, size, dark_text):
    f = bold(size); a = "MyPixel"
    d.text((x, y), a, font=f, fill="#111827" if dark_text else "#FFFFFF")
    d.text((x + d.textlength(a, font=f), y), "Guard", font=f, fill="#FF7A00")

def gradient(w, h, top, bottom):
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        t = y / (h - 1); c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w): px[x, y] = c
    return im

def header(w, h, name):                      # light strip, logo + wordmark
    im = Image.new("RGB", (w, h), "#FFFFFF"); d = ImageDraw.Draw(im)
    m = h - (22 if w < 300 else 14); im.paste(mark.resize((m, m), Image.LANCZOS), (8, 7), mark.resize((m, m), Image.LANCZOS))
    wordmark(d, 8 + m + 6, (h - (12 if w < 300 else 20)) // 2 - 3, 12 if w < 300 else 20, True)
    im.save(os.path.join(out, name))

def side(w, h, name):                        # dark navy panel, big logo, tagline
    im = gradient(w, h, (13, 20, 33), (17, 24, 39)); d = ImageDraw.Draw(im)
    m = int(w * 0.62); mk = mark_dark.resize((m, m), Image.LANCZOS)
    im.paste(mk, ((w - m) // 2, int(h * 0.16)), mk)
    f = bold(max(13, w // 11)); a = "MyPixel"
    tw = d.textlength(a, font=f) + d.textlength("Guard", font=f); x = (w - tw) / 2; y = int(h * 0.16) + m + 10
    d.text((x, y), a, font=f, fill="#FFFFFF"); d.text((x + d.textlength(a, font=f), y), "Guard", font=f, fill="#FF7A00")
    t = ["Your Images.", "Your Privacy.", "Your Control."]; ft = reg(max(9, w // 16))
    for i, line in enumerate(t):
        d.text(((w - d.textlength(line, font=ft)) / 2, y + 36 + i * (ft.size + 6)), line, font=ft, fill="#9CA3AF")
    im.save(os.path.join(out, name))

header(150, 57, "nsis-header.bmp")
side(164, 314, "nsis-sidebar.bmp")
header(493, 58, "wix-banner.bmp")
side(164, 312, "_wix-side.bmp")                 # the MSI welcome dialog shows only the left strip of this image
dlg = Image.new("RGB", (493, 312), "#FFFFFF"); dlg.paste(Image.open(os.path.join(out, "_wix-side.bmp")), (0, 0))
dlg.save(os.path.join(out, "wix-dialog.bmp")); os.remove(os.path.join(out, "_wix-side.bmp"))

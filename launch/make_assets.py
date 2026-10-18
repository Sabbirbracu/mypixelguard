# Builds the images that launch sites ask for, from the real app screenshots (landing-react/src/assets/img) and the brand files.
#   python3 launch/make_assets.py      → launch/assets/
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import os
root = os.path.join(os.path.dirname(__file__), "..")
out = os.path.join(os.path.dirname(__file__), "assets")
fonts = os.path.join(root, "Sources/MetaDataRemover/Fonts")
bold = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Bold.ttf"), n)
semi = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-SemiBold.ttf"), n)
reg = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Regular.ttf"), n)
shots = os.path.join(root, "landing-react/src/assets/img")

def bg(w, h):
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        t = y / h
        for x in range(w): px[x, y] = (int(11 + 7 * t), int(17 + 9 * t), int(27 + 14 * t))
    glow = Image.new("L", (w, h), 0); ImageDraw.Draw(glow).ellipse((w * .15, -h * .6, w * .85, h * .35), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    return Image.composite(Image.new("RGB", (w, h), (255, 122, 0)), im, glow.point(lambda v: int(v * .32)))

def rounded(img, r):
    m = Image.new("L", img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *img.size), r, fill=255)
    img = img.convert("RGBA"); img.putalpha(m); return img

def gallery(name, headline, sub, shot, W=1270, H=760):
    im = bg(W, H); d = ImageDraw.Draw(im)
    f = bold(46); tw = d.textlength(headline, font=f)
    d.text(((W - tw) / 2, 44), headline, font=f, fill="#FFFFFF")
    f2 = reg(23); tw2 = d.textlength(sub, font=f2)
    d.text(((W - tw2) / 2, 108), sub, font=f2, fill=(255, 255, 255, 170))
    s = Image.open(os.path.join(shots, shot)).convert("RGB")
    w = 980; h = int(s.height * w / s.width)
    s = rounded(s.resize((w, h), Image.LANCZOS), 18)
    shadow = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0)); ImageDraw.Draw(shadow).rounded_rectangle((40, 50, w + 40, h + 50), 18, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    x = (W - w) // 2; y = 165
    im.paste(shadow, (x - 40, y - 40), shadow)
    im.paste(s, (x, y), s)
    im.convert("RGB").save(os.path.join(out, name), optimize=True)

gallery("gallery-1-inspect.png", "See what your photo is giving away", "Location, device, dates, author and AI labels — in plain language", "app-inspect.webp")
gallery("gallery-2-clean.png", "Remove it in one click", "EXIF, GPS, IPTC, XMP and Content Credentials. Originals are never touched.", "app-clean.webp")
gallery("gallery-3-redact.png", "Blur faces and private text", "Found on your own computer. Preview the exact result before you export.", "app-redact.webp")
gallery("gallery-4-background.png", "Remove backgrounds without losing quality", "Subject pixels stay exactly as they were. Nothing is uploaded.", "app-background.webp")
gallery("gallery-5-compress.png", "Resize, compress and convert", "Before/after preview, quality-versus-size chart, whole folders at once.", "app-compress.webp")

# 240x240 logo (Product Hunt thumbnail) and a 1200x630 social card
icon = Image.open(os.path.join(root, "Resources/Brand/MyPixelGuard-AppIcon.png")).convert("RGBA")
icon.resize((240, 240), Image.LANCZOS).save(os.path.join(out, "logo-240.png"))
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(out, "logo-512.png"))
W, H = 1200, 630
im = bg(W, H); d = ImageDraw.Draw(im)
ic = icon.resize((150, 150), Image.LANCZOS); im.paste(ic, (90, 90), ic)
d.text((90, 280), "MyPixelGuard", font=bold(72), fill="#FFFFFF")
d.text((90, 380), "Remove hidden photo data. Offline.", font=semi(36), fill="#FF9A33")
d.text((90, 450), "EXIF · GPS · AI labels · faces · backgrounds", font=reg(26), fill=(255, 255, 255, 190))
d.text((90, 540), "mypixelguard.agentiqbd.com", font=reg(24), fill=(255, 255, 255, 150))
im.convert("RGB").save(os.path.join(out, "social-card-1200x630.png"), optimize=True)
print(sorted(os.listdir(out)))

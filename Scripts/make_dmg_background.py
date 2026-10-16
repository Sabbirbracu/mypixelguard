# Draws the background of the Mac installer window (logo, wordmark, "drag to Applications" arrow).
# Output: Resources/dmg/background.png (660x400) and background@2x.png (1320x800).
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
root = os.path.join(os.path.dirname(__file__), "..")
W, H, S = 660, 400, 2
im = Image.new("RGB", (W * S, H * S), "#F8FAFC")
px = im.load()
for y in range(H * S):                                   # vertical navy gradient
    t = y / (H * S)
    c = (int(250 - 8 * t), int(250 - 6 * t), int(252 - 4 * t))
    for x in range(W * S): px[x, y] = c
glow = Image.new("RGB", im.size, (0, 0, 0))              # warm light from the top centre
g = ImageDraw.Draw(glow)
g.ellipse((W * S * 0.18, -H * S * 0.55, W * S * 0.82, H * S * 0.42), fill=(255, 122, 0))
glow = glow.filter(ImageFilter.GaussianBlur(70 * S / 2))
im = Image.blend(im, Image.eval(Image.composite(glow, im, Image.new("L", im.size, 255)), lambda v: v), 0.0)
from PIL import ImageChops
im = ImageChops.subtract(im, glow.point(lambda v: 0)); warm = Image.new("RGB", im.size, (255, 226, 190)); im = Image.composite(warm, im, glow.convert("L").point(lambda v: int(v * 0.55)))
d = ImageDraw.Draw(im)

fonts = os.path.join(root, "Sources/MetaDataRemover/Fonts")
sora_b = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Bold.ttf"), int(n * S))
sora_r = lambda n: ImageFont.truetype(os.path.join(fonts, "Sora-Regular.ttf"), int(n * S))

mark = Image.open(os.path.join(root, "Resources/Brand/MyPixelGuard-Mark-Light.png")).convert("RGBA")
m = int(58 * S); mark = mark.resize((m, m), Image.LANCZOS)
f = sora_b(25); a, b = "MyPixel", "Guard"
wa, wb = d.textlength(a, font=f), d.textlength(b, font=f)
total = m + 10 * S + wa + wb
x0 = (W * S - total) / 2
im.paste(mark, (int(x0), int(28 * S)), mark)
ty = 28 * S + (m - 25 * S) / 2 - 4 * S
d.text((x0 + m + 10 * S, ty), a, font=f, fill="#111827")
d.text((x0 + m + 10 * S + wa, ty), b, font=f, fill="#FF7A00")
t = "Drag MyPixelGuard into Applications to install"
ft = sora_r(13)
d.text(((W * S - d.textlength(t, font=ft)) / 2, 100 * S), t, font=ft, fill="#6B7280")

# arrow between the two icons (icons sit at x=170 and x=490, y=235)
y = 235 * S; x1, x2 = 250 * S, 410 * S
d.line((x1, y, x2 - 14 * S, y), fill="#FF7A00", width=4 * S)
d.polygon([(x2, y), (x2 - 20 * S, y - 12 * S), (x2 - 20 * S, y + 12 * S)], fill="#FF7A00")

os.makedirs(os.path.join(root, "Resources/dmg"), exist_ok=True)
im.save(os.path.join(root, "Resources/dmg/background@2x.png"))
im.resize((W, H), Image.LANCZOS).save(os.path.join(root, "Resources/dmg/background.png"))

# Official introduction video — "cinematic premium launch" cut (about 45–50 s), built from the real app screenshots and brand assets.
#   python3 launch/video/make_launch_video.py                       Mac "say" voice as a placeholder, no subtitles
#   python3 launch/video/make_launch_video.py --voice-dir DIR       your own recordings: hook, brand, features, workflow, privacy, end (.m4a/.wav/.mp3)
#   add  --captions   to burn in subtitles (for a muted social version)
#   add  --music FILE to mix a music track quietly under the voice (it ducks while you speak)
#   add  --preview [seconds…]  to write a few PNG frames to /tmp instead of rendering
# Output: launch/assets/mypixelguard-launch.mp4
import math, os, subprocess, sys, tempfile, wave
import numpy as np
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SHOTS = os.path.join(ROOT, "landing-react/src/assets/img"); FONTS = os.path.join(ROOT, "Sources/MetaDataRemover/Fonts")
CARD = os.path.join(ROOT, "landing/assets/img")
OUT = os.path.join(ROOT, "launch/assets/mypixelguard-launch.mp4"); ENCODER = os.environ.get("MPG_ENCODER", "/tmp/mpg-encode")
W, H, FPS = 1920, 1080, 30; ORANGE = (255, 122, 0); VOICE, RATE = "Samantha", 160
CAPTIONS = "--captions" in sys.argv

# say = what the Mac voice reads (spelled so the URL sounds right); text = what you read and what the captions show
SCENES = [
  dict(id="hook", min=4.6, text="Your images. Your privacy. Your control.", say="Your images. Your privacy. Your control."),
  dict(id="brand", min=6.0, text="Meet MyPixelGuard, your desktop toolkit for smarter, more private image processing.", say="Meet MyPixelGuard, your desktop toolkit for smarter, more private image processing.", cues=["desktop toolkit"]),
  dict(id="features", min=8.0, seg_min=3.5, seg_last=3.7, text="Remove image backgrounds, inspect and clean hidden metadata, and redact sensitive information, all in one place.",
       say="Remove image backgrounds, inspect and clean hidden metadata, and redact sensitive information, all in one place.", cues=["background", "metadata", "sensitive"]),
  dict(id="workflow", min=6.0, seg_min=2.3, seg_last=3.0, text="Resize, convert, compress, and process images in batches, without the usual complicated workflow.",
       say="Resize, convert, compress, and process images in batches, without the usual complicated workflow.", cues=["Resize", "convert", "compress", "batches"]),
  dict(id="privacy", min=7.0, text="Your images stay on your computer. No cloud upload is needed for local processing.", say="Your images stay on your computer. No cloud upload is needed for local processing.", cues=["No cloud"]),
  dict(id="end", min=10.0, tail=4.8, text="MyPixelGuard by Agentiq BD. Available for Windows and macOS. Take control of your images at mypixelguard.agentiqbd.com.",
       say="MyPixelGuard by Agentiq B D. Available for Windows and macOS. Take control of your images at mypixelguard dot agentiq B D dot com.", cues=["Available", "Take control"]),
]
LEAD, TAIL = 0.55, 1.1

def font(name, size): return ImageFont.truetype(os.path.join(FONTS, f"Sora-{name}.ttf"), size)
def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def lerp(a, b, t): return a + (b - a) * t

# ── audio ────────────────────────────────────────────────────────────────────
def read_wav(path):
    raw = open(path, "rb").read(); i = 12
    while i + 8 <= len(raw):
        name, size = raw[i:i + 4], int.from_bytes(raw[i + 4:i + 8], "little")
        if name == b"data": return np.frombuffer(raw[i + 8:i + 8 + size], dtype="<i2")
        i += 8 + size + (size & 1)
    raise SystemExit(f"could not read audio: {path}")

def to_pcm(path, tmp, trim=True):
    wav = os.path.join(tmp, os.path.basename(path) + ".wav")
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@44100", "-c", "1", path, wav], check=True, capture_output=True)
    pcm = read_wav(wav)
    if trim:
        loud = np.where(np.abs(pcm) > 600)[0]
        if len(loud) == 0: raise SystemExit(f"{path} looks silent")
        pcm = pcm[max(0, loud[0] - 2205):min(len(pcm), loud[-1] + 5292)]
    return pcm

def find(voice_dir, sid):
    for ext in ("wav", "m4a", "mp3", "aiff", "aif", "caf", "mp4", "aac", "flac"):
        p = os.path.join(voice_dir, f"{sid}.{ext}")
        if os.path.exists(p): return p
    raise SystemExit(f"missing recording '{sid}' in {voice_dir} (expected {sid}.m4a / .wav / .mp3 …)")

def build_audio(tmp, voice_dir, music):
    t = 0.0; tl = []; clips = []
    for sc in SCENES:
        if voice_dir: pcm = to_pcm(find(voice_dir, sc["id"]), tmp)
        else:
            p = os.path.join(tmp, sc["id"] + ".wav")
            subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "--data-format=LEI16@44100", "-o", p, sc["say"]], check=True); pcm = read_wav(p)
        dur = len(pcm) / 44100; tail = sc.get("tail", TAIL)
        length = max(sc["min"], LEAD + dur + tail)
        vs = t + LEAD
        cues = [vs + dur * (sc["text"].index(k) / len(sc["text"])) - 0.35 for k in sc.get("cues", [])]
        segs = []
        if "seg_min" in sc:                                   # each demonstration stays long enough to read, even if the voice names them quickly
            segs = [t]
            for k in cues[1:]: segs.append(max(k, segs[-1] + sc["seg_min"]))
            length = max(length, segs[-1] + sc["seg_last"] - t)
            length = max(length, LEAD + dur + tail) if sc["id"] != "features" and sc["id"] != "workflow" else max(segs[-1] + sc["seg_last"] - t, LEAD + dur + 0.4)
        tl.append(dict(start=t, end=t + length, vs=vs, ve=vs + dur, cues=cues, segs=segs)); clips.append((vs, pcm)); t += length
    total = t
    n = int(total * 44100) + 44100; voice = np.zeros(n, dtype=np.float32)
    for at, pcm in clips: i = int(at * 44100); voice[i:i + len(pcm)] += pcm.astype(np.float32) / 32768
    vpk = float(np.max(np.abs(voice))) or 1.0; voice *= 0.85 / vpk
    mix = voice.copy()
    if music:
        m = to_pcm(music, tmp, trim=False).astype(np.float32) / 32768
        m = np.resize(m, n) if len(m) < n else m[:n]
        env = np.abs(voice); k = 2205; env = np.convolve(env, np.ones(k) / k, mode="same")         # where the voice is speaking …
        duck = 1.0 - 0.55 * np.clip(env * 12, 0, 1)                                                    # … lower the music
        fade = np.ones(n, dtype=np.float32); f = int(1.5 * 44100); fade[:f] = np.linspace(0, 1, f); fade[int(total * 44100) - f:] = np.linspace(1, 0, f)[:max(0, n - (int(total * 44100) - f))]
        mix += m * 0.17 * duck * fade
    mix = np.clip(mix, -1, 1)
    path = os.path.join(tmp, "audio.wav")
    st = np.repeat((mix * 32767).astype(np.int16)[:, None], 2, axis=1)
    with wave.open(path, "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100); w.writeframes(st.tobytes())
    return path, tl, total

# ── drawing ──────────────────────────────────────────────────────────────────
_bg = None
def background(glow=1.0):
    global _bg
    if _bg is None:
        y = np.linspace(0, 1, H)[:, None]; b = np.zeros((H, W, 3), dtype=np.float32)
        b[..., 0] = 10 + 7 * y; b[..., 1] = 16 + 9 * y; b[..., 2] = 26 + 14 * y
        yy, xx = np.mgrid[0:H, 0:W]; g = np.exp(-(((xx - W * .5) / (W * .45)) ** 2 + ((yy + 160) / (H * .55)) ** 2)); b[..., 0] += g * 64; b[..., 1] += g * 26
        vig = 1 - 0.28 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 2; b *= vig[..., None]
        _bg = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8)).convert("RGBA")
    return _bg.copy()

_imgs = {}
def load(path):
    if path not in _imgs: _imgs[path] = Image.open(path).convert("RGB")
    return _imgs[path]
def shot(name): return load(os.path.join(SHOTS, name))

def rounded(img, r):
    m = Image.new("L", img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *img.size), r, fill=255)
    o = img.convert("RGBA"); o.putalpha(m); return o
def fade_img(img, a):
    if a >= 0.999: return img
    img = img.copy(); img.putalpha(img.getchannel("A").point(lambda v: int(v * a))); return img
def shadowed(img, blur=36, off=36, opacity=190):
    pad = blur * 2; sh = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + off, pad + img.width, pad + off + img.height), 24, fill=(0, 0, 0, opacity))
    sh = sh.filter(ImageFilter.GaussianBlur(blur)); sh.alpha_composite(img, (pad, pad)); return sh, pad

def text(c, xy, s, f, fill, anchor="la", alpha=1.0):
    if alpha <= 0: return
    layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); ImageDraw.Draw(layer).text(xy, s, font=f, fill=(*fill[:3], int(255 * alpha)), anchor=anchor); c.alpha_composite(layer)
def tlen(s, f): return ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(s, font=f)
def pill(c, cx, cy, s, f, fg=(255, 255, 255), bg=(18, 26, 40), alpha=1.0, pad=(34, 18), border=None, bga=225):
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1))); l, t, r, b = d0.textbbox((0, 0), s, font=f); w, h = r - l + pad[0] * 2, b - t + pad[1] * 2
    layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.rounded_rectangle((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), h / 2, fill=(*bg, int(bga * alpha)), outline=(*border, int(255 * alpha)) if border else None, width=2)
    d.text((cx, cy), s, font=f, fill=(*fg, int(255 * alpha)), anchor="mm"); c.alpha_composite(layer)
def icon(size): return Image.open(os.path.join(ROOT, "Resources/Brand/MyPixelGuard-AppIcon.png")).convert("RGBA").resize((size, size), Image.LANCZOS)
def wordmark(c, cx, cy, size, alpha=1.0):
    f = font("Bold", size); a, b = tlen("MyPixel", f), tlen("Guard", f); x0 = cx - (a + b) / 2
    text(c, (x0, cy), "MyPixel", f, (255, 255, 255), "lm", alpha); text(c, (x0 + a, cy), "Guard", f, ORANGE, "lm", alpha)

def headline(c, s, alpha, y=62):
    if not s or alpha <= 0: return
    f = font("Bold", 62); text(c, (118, y), s, f, (255, 255, 255), "lm", alpha)
    w = tlen(s, f); layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); ImageDraw.Draw(layer).rounded_rectangle((118, y + 52, 118 + 120 * ease(alpha), y + 58), 3, fill=(*ORANGE, int(255 * alpha))); c.alpha_composite(layer)

def crop_view(c, img, ra, rb, p, alpha, size=(1684, 842), pos=(118, 150), hl=None, hl_alpha=1.0, cursor=None):
    """A close-up of part of a screenshot. ra→rb is the slow push-in; hl are highlight boxes and cursor a (x, y, click) in screenshot pixels."""
    e = ease(p); r = [lerp(ra[i], rb[i], e) for i in range(4)]
    view = img.crop(tuple(int(round(v)) for v in r)).resize(size, Image.LANCZOS)
    card = rounded(view, 26); sh, pad = shadowed(card)
    rise = (1 - ease(min(1.0, p * 6))) * 26
    c.alpha_composite(fade_img(sh, alpha), (int(pos[0] - pad), int(pos[1] - pad + rise)))
    sx, sy = size[0] / (r[2] - r[0]), size[1] / (r[3] - r[1])
    mp = lambda x, y: (pos[0] + (x - r[0]) * sx, pos[1] + (y - r[1]) * sy + rise)
    layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for box, a in (hl or []):
        if a <= 0: continue
        x0, y0 = mp(box[0], box[1]); x1, y1 = mp(box[2], box[3]); aa = a * hl_alpha * alpha
        for g, ga in ((16, 36), (8, 70)): d.rounded_rectangle((x0 - g, y0 - g, x1 + g, y1 + g), 22 + g, outline=(*ORANGE, int(ga * aa)), width=6)
        d.rounded_rectangle((x0, y0, x1, y1), 20, outline=(*ORANGE, int(255 * aa)), width=5)
    c.alpha_composite(layer)
    if cursor: draw_cursor(c, mp(cursor[0], cursor[1]), cursor[2], alpha)

def draw_cursor(c, xy, click, alpha):
    x, y = xy; layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    if click > 0:                                            # click ripple
        r = 18 + 46 * click; d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, int(190 * (1 - click) * alpha)), width=4)
    pts = [(0, 0), (0, 38), (10, 29), (17, 45), (25, 41), (18, 26), (31, 26)]
    d.polygon([(x + a + 3, y + b + 4) for a, b in pts], fill=(0, 0, 0, int(90 * alpha)))
    d.polygon([(x + a, y + b) for a, b in pts], fill=(255, 255, 255, int(255 * alpha)), outline=(10, 14, 22, int(255 * alpha)))
    c.alpha_composite(layer)

def path_pos(p, pts):
    """Smooth position along a list of points for p in 0..1."""
    n = len(pts) - 1; s = min(max(p, 0), 0.9999) * n; i = int(s); f = ease(s - i)
    return (lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f))

def seg_progress(tl, t, k, n):
    """Which part (0..n-1) of a multi-part scene we are in, and progress inside it."""
    starts = [tl["start"]] + tl["cues"][1:n]
    ends = starts[1:] + [tl["end"]]
    idx = max(i for i, s in enumerate(starts) if t >= s) if t >= starts[0] else 0
    return idx, (t - starts[idx]) / max(1e-6, ends[idx] - starts[idx])

# ── scenes ───────────────────────────────────────────────────────────────────
def scene_hook(c, tl, t, dur):
    fade = min(ease(t / 0.7), ease((dur - t) / 0.35))
    before = load(os.path.join(CARD, "card-before.jpg")); after = load(os.path.join(CARD, "card-after.png")).resize(before.size)
    w_, h_ = 1260, 788; wipe = ease((t - 1.0) / 1.9)
    b = before.resize((w_, h_), Image.LANCZOS); a = after.resize((w_, h_), Image.LANCZOS)
    cut = int(w_ * wipe); mix = b.copy(); mix.paste(a.crop((0, 0, cut, h_)), (0, 0))
    card = rounded(mix, 28); sh, pad = shadowed(card, 40, 40, 200)
    sc = 0.94 + 0.06 * ease(t / 2.2); x0 = int((W - w_ * sc) / 2); y0 = int(56 + (1 - sc) * 100)
    if sc < 0.999: card = card.resize((int(w_ * sc), int(h_ * sc)), Image.LANCZOS); sh, pad = shadowed(card, 40, 40, 200)
    c.alpha_composite(fade_img(sh, fade), (x0 - pad, y0 - pad)); 
    lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    if 0.02 < wipe < 0.98:
        lx = x0 + int(w_ * sc * wipe); d.rectangle((lx - 3, y0, lx + 3, y0 + int(h_ * sc)), fill=(*ORANGE, int(255 * fade)))
        for g in (14, 28): d.rectangle((lx - g, y0, lx + g, y0 + int(h_ * sc)), fill=(*ORANGE, int(24 * fade)))
    c.alpha_composite(lay)
    pill(c, x0 + 110, y0 + 52, "AFTER" if wipe > 0.5 else "BEFORE", font("SemiBold", 26), fg=(255, 176, 102), bg=(36, 24, 10), border=ORANGE, alpha=fade * ease((t - 0.5) / 0.4), pad=(24, 10))
    text(c, (W / 2, 972), "YOUR IMAGES DESERVE BETTER TOOLS.", font("Bold", 52), (255, 255, 255), "mm", fade * ease((t - 0.7) / 0.7))

def scene_brand(c, tl, t, dur):
    fade = min(ease(t / 0.3), ease((dur - t) / 0.4))
    sweep = ease(t / 1.0)
    if 0 < sweep < 1:                                                         # orange light sweep
        lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); x = -300 + sweep * (W + 600)
        for g, a in ((260, 20), (150, 34), (60, 60)): d.polygon([(x - g, 0), (x + g, 0), (x + g - 260, H), (x - g - 260, H)], fill=(255, 122, 0, a))
        c.alpha_composite(lay.filter(ImageFilter.GaussianBlur(24)))
    cue = tl["cues"][0] - tl["start"] if tl["cues"] else 2.4
    to_app = ease((t - cue) / 0.9)                                           # logo moves up, app window comes in
    s = (0.82 + 0.18 * ease((t - 0.35) / 0.9)) * (1 - 0.55 * to_app)
    ic = icon(int(300 * s)); cy = lerp(430, 118, to_app)
    lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); lay.alpha_composite(ic, (int(W / 2 - ic.width / 2), int(cy - ic.height / 2)))
    c.alpha_composite(fade_img(lay, fade * ease((t - 0.35) / 0.6)))
    wordmark(c, W / 2, lerp(660, 262, to_app), int(lerp(104, 54, to_app)), fade * ease((t - 0.8) / 0.7))
    text(c, (W / 2, 770), "MEET MYPIXELGUARD", font("SemiBold", 40), (255, 176, 102), "mm", fade * ease((t - 1.1) / 0.7) * (1 - to_app))
    if to_app > 0:
        img = shot("app-inspect.webp"); w_ = 1060; h_ = int(1041 * w_ / 1600)
        win = rounded(img.resize((w_, h_), Image.LANCZOS), 24); sh, pad = shadowed(win)
        c.alpha_composite(fade_img(sh, fade * to_app), (int((W - w_) / 2 - pad), int(lerp(1150, 345, to_app) - pad)))

def scene_features(c, tl, t, dur):
    fade = min(ease(t / 0.4), ease((dur - t) / 0.4)); ab = tl["start"] + t
    idx, p = seg_progress(tl, ab, 0, 3)
    heads = ["Remove backgrounds", "Clean metadata", "Redact sensitive details"]
    # cross-fade between the three demonstrations
    for i in range(3):
        a = fade
        s0 = tl["start"] if i == 0 else tl["segs"][i]; s1 = tl["segs"][i + 1] if i < 2 else tl["end"]
        pi = (ab - s0) / max(1e-6, s1 - s0)
        if i > 0: a *= ease((ab - s0) / 0.35)
        if i < 2: a *= 1 - ease((ab - s1 + 0.0) / 0.35) if ab > s1 else 1
        if pi < 0 or a <= 0: continue
        if i == 0:
            hl = [((970, 327, 1534, 680), ease((pi - 0.35) / 0.2))]
            crop_view(c, shot("app-background.webp"), (358, 212, 1560, 813), (358, 262, 1560, 863), pi, a, hl=hl, cursor=(*path_pos(pi / 0.8, [(1380, 250), (1100, 520), (835, 794)]), max(0, min(1, (pi - 0.8) / 0.18))))
        elif i == 1:
            if pi < 0.58:
                q = pi / 0.58
                hl = [((382, 747, 757, 848), ease((q - 0.1) / 0.15) * (1 - ease((q - 0.38) / 0.1))), ((771, 723, 1147, 872), ease((q - 0.45) / 0.15) * (1 - ease((q - 0.7) / 0.1))), ((1160, 747, 1535, 848), ease((q - 0.72) / 0.15))]
                crop_view(c, shot("app-inspect.webp"), (358, 420, 1560, 1021), (358, 440, 1560, 1041), q, a, hl=hl)
            else:
                q = (pi - 0.58) / 0.42
                crop_view(c, shot("app-clean.webp"), (358, 430, 1560, 1031), (358, 440, 1560, 1041), q, a, hl=[((382, 658, 949, 775), ease((q - 0.1) / 0.2)), ((1205, 952, 1559, 1021), ease((q - 0.55) / 0.2))],
                          cursor=(*path_pos(q / 0.7, [(1100, 640), (1300, 900), (1382, 986)]), max(0, min(1, (q - 0.72) / 0.2))))
        else:
            hl = [((600, 485, 1020, 650), ease((pi - 0.25) / 0.2))]
            crop_view(c, shot("app-redact.webp"), (358, 222, 1560, 823), (358, 262, 1560, 863), pi, a, hl=hl, cursor=(*path_pos(pi / 0.7, [(1300, 340), (900, 480), (630, 520)]), max(0, min(1, (pi - 0.7) / 0.2))))
    h = max(i for i in range(3) if ab >= (tl["start"] if i == 0 else tl["segs"][i]))
    for i in range(3):
        s0 = tl["start"] if i == 0 else tl["segs"][i]; s1 = tl["segs"][i + 1] if i < 2 else tl["end"]
        a = fade * min(ease((ab - s0) / 0.35), ease((s1 - ab) / 0.3) if i < 2 else 1)
        headline(c, heads[i], a)

def scene_workflow(c, tl, t, dur):
    fade = min(ease(t / 0.4), ease((dur - t) / 0.4)); ab = tl["start"] + t
    items = [("Resize.", "app-resize.webp", (358, 420, 1560, 1021), (358, 430, 1560, 1031)), ("Convert.", "app-convert.webp", (358, 360, 1560, 961), (358, 380, 1560, 981)),
             ("Compress.", "app-compress.webp", (358, 330, 1560, 931), (358, 350, 1560, 951)), ("Process in batches.", "app-studio.webp", (358, 440, 1560, 1041), (358, 440, 1560, 1041))]
    starts = list(tl["segs"]); ends = starts[1:] + [tl["end"]]
    for i, (word, name, ra, rb) in enumerate(items):
        s0, s1 = starts[i], ends[i]; pi = (ab - s0) / max(1e-6, s1 - s0)
        a = fade * (ease((ab - s0) / 0.3) if i > 0 else 1) * (1 - ease((ab - s1) / 0.3) if ab > s1 and i < 3 else 1)
        if pi < 0 or a <= 0: continue
        ra = tuple(min(v, lim) for v, lim in zip(ra, (1600, 1041, 1600, 1041))); rb = tuple(min(v, lim) for v, lim in zip(rb, (1600, 1041, 1600, 1041)))
        crop_view(c, shot(name), ra, rb, pi, a)
        text(c, (118, 62), word, font("Bold", 62), (255, 255, 255), "lm", a * ease(pi * 8))
        lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); ImageDraw.Draw(lay).rounded_rectangle((118, 114, 118 + 120, 120), 3, fill=(*ORANGE, int(255 * a))); c.alpha_composite(lay)

def scene_privacy(c, tl, t, dur):
    fade = min(ease(t / 0.5), ease((dur - t) / 0.4)); pulse = 0.6 + 0.4 * math.sin(t * 2.4)
    img = shot("app-clean.webp"); w_ = 1040; h_ = int(1041 * w_ / 1600)
    win = rounded(img.resize((w_, h_), Image.LANCZOS), 24); x0 = (W - w_) // 2; y0 = 300 - int((1 - ease(t / 1.0)) * 30)
    lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for g, a in ((46, 22), (30, 36), (16, 60)): d.rounded_rectangle((x0 - g, y0 - g, x0 + w_ + g, y0 + h_ + g), 24 + g, outline=(*ORANGE, int(a * pulse * fade)), width=8)
    c.alpha_composite(lay)
    sh, pad = shadowed(win); c.alpha_composite(fade_img(sh, fade), (x0 - pad, y0 - pad))
    lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay); d.rounded_rectangle((x0, y0, x0 + w_, y0 + h_), 24, outline=(*ORANGE, int(255 * fade)), width=4); c.alpha_composite(lay)
    ic = icon(120); l2 = Image.new("RGBA", c.size, (0, 0, 0, 0)); l2.alpha_composite(ic, (W // 2 - 60, 90)); c.alpha_composite(fade_img(l2, fade * ease((t - 0.2) / 0.6)))
    text(c, (W / 2, 262), "Built for privacy. Designed for your desktop.", font("Bold", 52), (255, 255, 255), "mm", fade * ease((t - 0.4) / 0.7))
    if tl["cues"]:
        a = ease((tl["start"] + t - tl["cues"][0]) / 0.5) * fade
        pill(c, W / 2, 1000, "Local processing · nothing leaves your computer", font("SemiBold", 34), fg=(255, 214, 170), bg=(40, 26, 10), border=ORANGE, alpha=a, pad=(40, 16))

def scene_end(c, tl, t, dur):
    fade = ease(t / 0.6); ab = tl["start"] + t
    s = 0.9 + 0.1 * ease(t / 1.0); ic = icon(int(210 * s)); lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); lay.alpha_composite(ic, (W // 2 - ic.width // 2, 150))
    c.alpha_composite(fade_img(lay, fade))
    wordmark(c, W / 2, 440, 96, fade); text(c, (W / 2, 520), "by Agentiq BD", font("SemiBold", 36), (255, 176, 102), "mm", fade * ease((t - 0.4) / 0.6))
    a1 = ease((ab - tl["cues"][0]) / 0.5) if tl["cues"] else ease((t - 1.2) / 0.5)
    pill(c, W / 2 - 250, 640, "Windows", font("SemiBold", 40), alpha=a1, border=ORANGE, pad=(52, 20)); pill(c, W / 2 + 250, 640, "macOS", font("SemiBold", 40), alpha=a1, border=ORANGE, pad=(60, 20))
    a2 = ease((ab - tl["cues"][1]) / 0.55) if len(tl["cues"]) > 1 else ease((t - 3) / 0.55)
    text(c, (W / 2, 770), "Take control of your images.", font("Bold", 60), (255, 255, 255), "mm", a2)
    pill(c, W / 2, 890, "mypixelguard.agentiqbd.com", font("Bold", 56), fg=(17, 24, 39), bg=(255, 122, 0), alpha=a2, pad=(66, 28), bga=255)

KINDS = {"hook": scene_hook, "brand": scene_brand, "features": scene_features, "workflow": scene_workflow, "privacy": scene_privacy, "end": scene_end}

def caption(c, s, alpha):
    if alpha <= 0: return
    f = font("SemiBold", 38); words = s.split(); lines = []; cur = ""
    for w_ in words:
        t_ = (cur + " " + w_).strip()
        if tlen(t_, f) > 1500 and cur: lines.append(cur); cur = w_
        else: cur = t_
    lines.append(cur)
    for i, ln in enumerate(lines): pill(c, W / 2, 1028 - (len(lines) - 1 - i) * 60, ln, f, alpha=alpha, pad=(28, 12), bga=190)

def frame_at(args):
    n, tl = args; t = n / FPS
    for sc, s in zip(SCENES, tl):
        if s["start"] <= t < s["end"] or sc is SCENES[-1]:
            c = background(); KINDS[sc["id"]](c, s, t - s["start"], s["end"] - s["start"])
            if CAPTIONS and sc["id"] not in ("hook", "end") and s["vs"] - 0.1 <= t <= s["ve"] + 0.5:
                words = sc["text"]; frac = min(max((t - s["vs"]) / max(0.1, s["ve"] - s["vs"]), 0), 1)
                parts = [p.strip() for p in words.replace("? ", "?|").replace(". ", ".|").split("|")]; tot = sum(map(len, parts)); acc = 0
                for p in parts:
                    if frac * tot <= acc + len(p): caption(c, p, ease((t - s["vs"] + 0.1) / 0.2)); break
                    acc += len(p)
            if sc is SCENES[0] and t < 0.5:                      # open from black
                c.alpha_composite(Image.new("RGBA", c.size, (7, 10, 16, int(255 * (1 - ease(t / 0.5))))))
            return bgra(c)
    return bgra(background())

def bgra(img):
    a = np.asarray(img.convert("RGB"), dtype=np.uint8); out = np.empty((H, W, 4), dtype=np.uint8)
    out[..., 0] = a[..., 2]; out[..., 1] = a[..., 1]; out[..., 2] = a[..., 0]; out[..., 3] = 255; return out.tobytes()

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        audio, tl, total = build_audio(tmp, arg("--voice-dir"), arg("--music"))
        frames = int(math.ceil(total * FPS)); print(f"{len(SCENES)} scenes, {total:.1f}s, {frames} frames", flush=True)
        for sc, s in zip(SCENES, tl): print(f"  {sc['id']:<9} {s['start']:5.1f}–{s['end']:5.1f}s  voice {s['vs']:.1f}–{s['ve']:.1f}s  cues {[round(x - s['start'], 1) for x in s['cues']]}", flush=True)
        if "--preview" in sys.argv:
            pts = [float(x) for x in sys.argv[sys.argv.index("--preview") + 1:] if x.replace(".", "").isdigit()] or [s["start"] + 2.0 for s in tl]
            for i, tt in enumerate(pts):
                raw = frame_at((int(tt * FPS), tl)); Image.fromarray(np.frombuffer(raw, np.uint8).reshape(H, W, 4)[..., [2, 1, 0]]).save(f"/tmp/mpg-launch-{i}.png")
            print("previews: /tmp/mpg-launch-*.png"); sys.exit(0)
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        enc = subprocess.Popen([ENCODER, OUT, audio, str(W), str(H), str(FPS), str(frames)], stdin=subprocess.PIPE)
        with Pool(max(2, (os.cpu_count() or 4) - 1)) as pool:
            for i, raw in enumerate(pool.imap(frame_at, ((n, tl) for n in range(frames)), chunksize=4)):
                enc.stdin.write(raw)
                if i % 150 == 0: print(f"  frame {i}/{frames}", flush=True)
        enc.stdin.close(); enc.wait(); print("done", OUT)

# Product explainer video, built from the real app screenshots.
#   python3 launch/video/make_video.py            → launch/assets/mypixelguard-demo.mp4  (1920x1080, 30 fps, English voice + captions)
#   add --preview to render only a few frames as PNGs for checking the look.
#   --voice-dir DIR uses your own recordings (one file per scene: intro, problem, inspect, clean, redact, background, tools, offline, cta)
#   instead of the Mac voice; see launch/video/VOICEOVER_SCRIPT.md
# Voice: the Mac's built-in "say" voice. For a more human result, record your own voice over the same script (SCENES below).
import math, os, subprocess, sys, tempfile, wave
import numpy as np
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SHOTS = os.path.join(ROOT, "landing-react/src/assets/img")
FONTS = os.path.join(ROOT, "Sources/MetaDataRemover/Fonts")
OUT = os.path.join(ROOT, "launch/assets/mypixelguard-demo.mp4")
ENCODER = os.environ.get("MPG_ENCODER", "/tmp/mpg-encode")
W, H, FPS = 1920, 1080, 30
VOICE = "Samantha"; RATE = 168
ORANGE = (255, 122, 0)

def font(name, size): return ImageFont.truetype(os.path.join(FONTS, f"Sora-{name}.ttf"), size)

# Highlight boxes are in screenshot pixels (screenshots are 1600x1041).
SCENES = [
  dict(id="intro", kind="title", chip="", sentences=["MyPixelGuard. Your images. Your privacy. Your control."]),
  dict(id="problem", kind="shot", shot="app-inspect.webp", chip="The problem",
       sentences=["Every photo you share carries hidden data.", "The exact place it was taken.", "The phone that took it.", "The time.", "Even labels that say it was made by AI."],
       boxes=[None, (382,747,757,848), (771,723,1147,872), (1160,747,1535,848), (358,399,1559,540)], focus=(960,620)),
  dict(id="inspect", kind="shot", shot="app-inspect.webp", chip="1 · Inspect",
       sentences=["MyPixelGuard reads every layer of that data.", "And explains it in plain language, before you share anything."],
       boxes=[(358,399,1559,540), (382,747,1535,1010)], focus=(960,700)),
  dict(id="clean", kind="shot", shot="app-clean.webp", chip="2 · Clean",
       sentences=["Then remove only what you choose, or everything.", "Your original is never touched, and every cleaned copy is checked."],
       boxes=[(382,658,949,775), (1205,952,1559,1021)], focus=(960,780)),
  dict(id="redact", kind="shot", shot="app-redact.webp", chip="3 · Redact",
       sentences=["Blur faces, emails, phone numbers and more.", "Found on your own computer, with an exact preview before you export."],
       boxes=[(600,485,1020,650), (380,242,1440,840)], focus=(900,560)),
  dict(id="background", kind="shot", shot="app-background.webp", chip="4 · Remove background",
       sentences=["Remove a background without losing quality.", "Only a transparency layer is added."],
       boxes=[(970,327,1534,680), (382,327,1534,680)], focus=(1000,500)),
  dict(id="tools", kind="tools", chip="5 · And more",
       sentences=["Resize, compress, convert,", "and run whole folders at once."]),
  dict(id="offline", kind="offline", chip="Private by design",
       sentences=["And it all runs on your computer.", "No account.", "No upload.", "No network code.", "It even works offline."]),
  dict(id="cta", kind="cta", chip="",
       sentences=["MyPixelGuard. Free to download for Mac and Windows.", "Find it at mypixelguard dot agentiq B D dot com."],
       captions=["MyPixelGuard. Free to download for Mac and Windows.", "mypixelguard.agentiqbd.com"]),
]
LEAD, TAIL, GAP = 0.5, 0.9, 0.28   # seconds before the first word, after the last, between sentences

# ── voice ────────────────────────────────────────────────────────────────────
def say_clip(text, path):
    subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "--data-format=LEI16@44100", "-o", path, text], check=True)
    with wave.open(path) as w: return w.getnframes() / w.getframerate(), np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)

def load_recording(path, tmp):
    """Any audio file you recorded → 44.1 kHz mono int16, with silence trimmed from both ends."""
    wav = os.path.join(tmp, os.path.basename(path) + ".wav")
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@44100", "-c", "1", path, wav], check=True, capture_output=True)
    raw = open(wav, "rb").read(); i = 12; pcm = None            # afconvert writes an "extensible" WAV that Python's wave module rejects, so read the data chunk directly
    while i + 8 <= len(raw):
        name, size = raw[i:i + 4], int.from_bytes(raw[i + 4:i + 8], "little")
        if name == b"data": pcm = np.frombuffer(raw[i + 8:i + 8 + size], dtype="<i2"); break
        i += 8 + size + (size & 1)
    if pcm is None: raise SystemExit(f"could not read audio from {path}")
    loud = np.where(np.abs(pcm) > 600)[0]
    if len(loud) == 0: raise SystemExit(f"{path} looks silent")
    a = max(0, loud[0] - int(0.05 * 44100)); b = min(len(pcm), loud[-1] + int(0.12 * 44100))
    return pcm[a:b]

def find_recording(voice_dir, scene_id):
    for ext in ("wav", "m4a", "mp3", "aiff", "aif", "caf", "mp4", "aac", "ogg", "flac"):
        p = os.path.join(voice_dir, f"{scene_id}.{ext}")
        if os.path.exists(p): return p
    raise SystemExit(f"missing recording for scene '{scene_id}' in {voice_dir} (expected {scene_id}.m4a / .wav / .mp3 …)")

def build_audio_from_recordings(tmp, voice_dir):
    """One recording per scene. Captions are timed across the recording in proportion to sentence length."""
    t = 0.0; chunks = []; timeline = []
    for sc in SCENES:
        pcm = load_recording(find_recording(voice_dir, sc["id"]), tmp); dur = len(pcm) / 44100
        start = t; t += LEAD; lens = [len(x) for x in sc.get("captions", sc["sentences"])]; tot = sum(lens); sent = []; at = t
        for n in lens:
            d = dur * n / tot; sent.append((at, at + d)); at += d
        chunks.append((t, pcm)); t += dur + TAIL
        timeline.append(dict(start=start, end=t, sent=sent))
    total = t
    mix = np.zeros(int(total * 44100) + 44100, dtype=np.float32)
    for at, pcm in chunks:
        i = int(at * 44100); mix[i:i + len(pcm)] += pcm.astype(np.float32) / 32768
    peak = float(np.max(np.abs(mix))) or 1.0
    mix = mix * (0.9 / peak)                                  # level the whole track to about -1 dB
    stereo = np.repeat((mix * 32767).astype(np.int16)[:, None], 2, axis=1)
    path = os.path.join(tmp, "voice.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100); w.writeframes(stereo.tobytes())
    return path, timeline, total

def build_audio(tmp):
    t = 0.0; chunks = []; timeline = []
    for sc in SCENES:
        start = t; t += LEAD; sent = []
        for i, s in enumerate(sc["sentences"]):
            dur, pcm = say_clip(s, os.path.join(tmp, f"{sc['id']}-{i}.wav"))
            sent.append((t, t + dur)); chunks.append((t, pcm)); t += dur + GAP
        t = sent[-1][1] + TAIL
        timeline.append(dict(start=start, end=t, sent=sent))
    total = t
    mix = np.zeros(int(total * 44100) + 44100, dtype=np.float32)
    for at, pcm in chunks:
        i = int(at * 44100); mix[i:i + len(pcm)] += pcm.astype(np.float32) / 32768
    mix = np.clip(mix * 0.95, -1, 1)
    stereo = np.repeat((mix * 32767).astype(np.int16)[:, None], 2, axis=1)
    path = os.path.join(tmp, "voice.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100); w.writeframes(stereo.tobytes())
    return path, timeline, total

# ── drawing helpers ──────────────────────────────────────────────────────────
def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)

_bg = None
def background():
    global _bg
    if _bg is None:
        y = np.linspace(0, 1, H)[:, None]
        base = np.zeros((H, W, 3), dtype=np.float32)
        base[..., 0] = 11 + 7 * y; base[..., 1] = 17 + 9 * y; base[..., 2] = 27 + 14 * y
        yy, xx = np.mgrid[0:H, 0:W]
        g = np.exp(-(((xx - W * .5) / (W * .42)) ** 2 + ((yy + 120) / (H * .5)) ** 2))
        base[..., 0] += g * 70; base[..., 1] += g * 30
        _bg = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
    return _bg.copy()

_cache = {}
def load(name):
    if name not in _cache: _cache[name] = Image.open(os.path.join(SHOTS, name)).convert("RGB")
    return _cache[name]

def rounded(img, r):
    m = Image.new("L", img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *img.size), r, fill=255)
    out = img.convert("RGBA"); out.putalpha(m); return out

def with_alpha(img, a):
    img = img.copy(); al = img.getchannel("A").point(lambda v: int(v * a)); img.putalpha(al); return img

def shadowed(img, blur=34, off=40, opacity=170):
    pad = blur * 2
    sh = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + off, pad + img.width, pad + off + img.height), 22, fill=(0, 0, 0, opacity))
    sh = sh.filter(ImageFilter.GaussianBlur(blur)); sh.alpha_composite(img, (pad, pad)); return sh, pad

def text(canvas, xy, s, f, fill, anchor="la", alpha=1.0):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.text(xy, s, font=f, fill=(*fill[:3], int(255 * alpha)), anchor=anchor); canvas.alpha_composite(layer)

def pill(canvas, cx, cy, s, f, fg=(255, 255, 255), bg=(18, 26, 40), alpha=1.0, pad=(34, 18), border=None):
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1))); l, t, r, b = d0.textbbox((0, 0), s, font=f)
    w, h = r - l + pad[0] * 2, b - t + pad[1] * 2
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    d.rounded_rectangle(box, h / 2, fill=(*bg, int(225 * alpha)), outline=(*border, int(255 * alpha)) if border else None, width=2)
    d.text((cx, cy), s, font=f, fill=(*fg, int(255 * alpha)), anchor="mm"); canvas.alpha_composite(layer)

def caption(canvas, s, alpha):
    if alpha <= 0 or not s: return
    f = semi_cap
    words = s.split(); lines = []; cur = ""
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for w_ in words:
        t_ = (cur + " " + w_).strip()
        if d0.textlength(t_, font=f) > 1300 and cur: lines.append(cur); cur = w_
        else: cur = t_
    lines.append(cur)
    y = 985 - (len(lines) - 1) * 28
    for i, ln in enumerate(lines): pill(canvas, W / 2, y + i * 62, ln, f, alpha=alpha, pad=(30, 14))

semi_cap = None

def highlight(canvas, rect, alpha):
    if rect is None or alpha <= 0: return
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = rect
    for g, a in ((14, 40), (8, 70)):
        d.rounded_rectangle((x0 - g, y0 - g, x1 + g, y1 + g), 20 + g, outline=(*ORANGE, int(a * alpha)), width=6)
    d.rounded_rectangle(rect, 18, outline=(*ORANGE, int(255 * alpha)), width=5)
    canvas.alpha_composite(layer)

def chip(canvas, s, alpha):
    if not s: return
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1))); w = d0.textlength(s, font=chip_font) + 52
    pill(canvas, 60 + w / 2, 72, s, chip_font, fg=(255, 176, 102), bg=(36, 24, 10), border=ORANGE, alpha=alpha, pad=(26, 12))

chip_font = None

def icon(size):
    return Image.open(os.path.join(ROOT, "Resources/Brand/MyPixelGuard-AppIcon.png")).convert("RGBA").resize((size, size), Image.LANCZOS)

# ── scenes ───────────────────────────────────────────────────────────────────
def sentence_index(tl, t):
    idx = -1
    for i, (a, b) in enumerate(tl["sent"]):
        if t >= a: idx = i
    return idx

def render_scene(sc, tl, t):
    """t = seconds since scene start. Returns an RGBA canvas for the scene (without captions)."""
    dur = tl["end"] - tl["start"]
    c = background()
    fade = min(ease(t / 0.45), ease((dur - t) / 0.45))
    k = sc["kind"]
    if k == "title":
        sc_ = 0.86 + 0.14 * ease(t / 1.0)
        ic = icon(int(330 * sc_)); layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); layer.alpha_composite(ic, (W // 2 - ic.width // 2, 230))
        c.alpha_composite(with_alpha(layer, fade))
        f1 = font("Bold", 110); d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        wa = d0.textlength("MyPixel", font=f1); wb = d0.textlength("Guard", font=f1); x0 = W / 2 - (wa + wb) / 2
        text(c, (x0, 650), "MyPixel", f1, (255, 255, 255), "lm", fade); text(c, (x0 + wa, 650), "Guard", f1, ORANGE, "lm", fade)
        text(c, (W / 2, 770), "Your Images. Your Privacy. Your Control.", font("SemiBold", 44), (255, 176, 102), "mm", fade * ease((t - .5) / .8))
        return c
    if k == "shot":
        img = load(sc["shot"]); scale0 = 1240 / 1600
        z = 1.0 + 0.06 * ease(t / dur)
        sw = int(1600 * scale0 * z); sh_ = int(1041 * scale0 * z)
        win = rounded(img.resize((sw, sh_), Image.LANCZOS), 22)
        # keep the focus point where it was on screen while zooming
        fx, fy = sc["focus"]; base_x = (W - 1240) / 2; base_y = 118
        px = base_x + fx * scale0 - fx * scale0 * z; py = base_y + fy * scale0 - fy * scale0 * z
        sh, pad = shadowed(win)
        slide = (1 - ease(t / 0.6)) * 40
        c.alpha_composite(with_alpha(sh, fade), (int(px - pad), int(py - pad + slide)))
        # highlights: appear with their sentence
        idx = sentence_index(tl, tl["start"] + t)
        for i, box in enumerate(sc.get("boxes", [])):
            if box is None or i > idx: continue
            a0, _ = tl["sent"][i]; ap = ease((tl["start"] + t - a0) / 0.35)
            # earlier boxes stay faintly visible, the current one is bright
            ap *= 1.0 if i == idx else 0.55
            x0, y0, x1, y1 = box
            r = (px + x0 * scale0 * z, py + y0 * scale0 * z + slide, px + x1 * scale0 * z, py + y1 * scale0 * z + slide)
            highlight(c, r, ap * fade)
        chip(c, sc["chip"], fade)
        return c
    if k == "tools":
        names = [("app-resize.webp", "Resize"), ("app-compress.webp", "Compress"), ("app-convert.webp", "Convert")]
        cw = 560; gap = 50; x0 = (W - (cw * 3 + gap * 2)) / 2
        for i, (nm, lab) in enumerate(names):
            ap = ease((t - 0.3 - i * 0.35) / 0.6)
            ch = int(1041 * cw / 1600)
            card = rounded(load(nm).resize((cw, ch), Image.LANCZOS), 18)
            sh, pad = shadowed(card, blur=22, off=24, opacity=150)
            y = 300 + (1 - ap) * 50
            c.alpha_composite(with_alpha(sh, ap * fade), (int(x0 + i * (cw + gap) - pad), int(y - pad)))
            text(c, (x0 + i * (cw + gap) + cw / 2, y + ch + 44), lab, font("SemiBold", 36), (255, 255, 255), "mm", ap * fade)
        folder_a = ease((t - 2.0) / 0.6) * fade
        pill(c, W / 2, 840, "Batch · whole folders · reusable recipes", font("SemiBold", 34), fg=(255, 214, 170), bg=(40, 26, 10), border=ORANGE, alpha=folder_a, pad=(36, 16))
        chip(c, sc["chip"], fade); return c
    if k == "offline":
        items = [("No account", 1), ("No upload", 2), ("No network code", 3), ("Works offline", 4)]
        idx = sentence_index(tl, tl["start"] + t)
        ic = icon(220); lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); lay.alpha_composite(ic, (W // 2 - 110, 150)); c.alpha_composite(with_alpha(lay, fade))
        text(c, (W / 2, 450), "Everything happens on your computer", font("Bold", 64), (255, 255, 255), "mm", fade)
        for j, (lab, need) in enumerate(items):
            show = idx >= need
            ap = ease((tl["start"] + t - tl["sent"][need][0]) / 0.4) if show else 0
            cx = W / 2 + (j - 1.5) * 420; cy = 640 + (1 - ap) * 24
            layer = Image.new("RGBA", c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
            a = int(255 * ap * fade)
            d.rounded_rectangle((cx - 190, cy - 70, cx + 190, cy + 70), 30, fill=(20, 30, 46, int(235 * ap * fade)), outline=(255, 122, 0, a), width=3)
            d.ellipse((cx - 150, cy - 24, cx - 102, cy + 24), fill=(255, 122, 0, a))
            d.line([(cx - 138, cy), (cx - 129, cy + 10), (cx - 114, cy - 9)], fill=(17, 24, 39, a), width=6, joint="curve")
            d.text((cx + 20, cy), lab, font=font("SemiBold", 32), fill=(255, 255, 255, a), anchor="mm")
            c.alpha_composite(layer)
        chip(c, sc["chip"], fade); return c
    if k == "cta":
        s = 0.9 + 0.1 * ease(t / 0.9)
        ic = icon(int(220 * s)); lay = Image.new("RGBA", c.size, (0, 0, 0, 0)); lay.alpha_composite(ic, (W // 2 - ic.width // 2, 190)); c.alpha_composite(with_alpha(lay, fade))
        f1 = font("Bold", 88); d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        wa = d0.textlength("MyPixel", font=f1); wb = d0.textlength("Guard", font=f1); x0 = W / 2 - (wa + wb) / 2
        text(c, (x0, 520), "MyPixel", f1, (255, 255, 255), "lm", fade); text(c, (x0 + wa, 520), "Guard", f1, ORANGE, "lm", fade)
        text(c, (W / 2, 610), "Free to download", font("SemiBold", 48), (255, 176, 102), "mm", fade * ease((t - .4) / .6))
        pa = ease((t - 0.9) / 0.6) * fade
        pill(c, W / 2 - 230, 720, "macOS 13+", font("SemiBold", 34), alpha=pa, border=ORANGE, pad=(40, 18)); pill(c, W / 2 + 230, 720, "Windows 10 / 11", font("SemiBold", 34), alpha=pa, border=ORANGE, pad=(40, 18))
        ua = ease((t - 1.6) / 0.6) * fade
        pill(c, W / 2, 830, "mypixelguard.agentiqbd.com", font("Bold", 46), fg=(17, 24, 39), bg=(255, 122, 0), alpha=ua, pad=(56, 24))
        return c

def frame_at(args):
    n, timeline = args
    global semi_cap, chip_font
    if semi_cap is None: semi_cap = font("SemiBold", 40); chip_font = font("SemiBold", 28)
    t = n / FPS
    for sc, tl in zip(SCENES, timeline):
        if tl["start"] <= t < tl["end"] or sc is SCENES[-1]:
            local = t - tl["start"]; c = render_scene(sc, tl, local)
            idx = sentence_index(tl, t); caps = sc.get("captions", sc["sentences"])
            if idx >= 0:
                a, b = tl["sent"][idx]; al = ease((t - a) / 0.2) * (1 if t < b + 0.35 else ease((b + 0.7 - t) / 0.35))
                if sc["kind"] != "title": caption(c, caps[idx], al)
            return bgra(c)
    return bgra(Image.new("RGBA", (W, H)))

def bgra(img):
    a = np.asarray(img.convert("RGB"), dtype=np.uint8)
    out = np.empty((H, W, 4), dtype=np.uint8); out[..., 0] = a[..., 2]; out[..., 1] = a[..., 1]; out[..., 2] = a[..., 0]; out[..., 3] = 255
    return out.tobytes()

if __name__ == "__main__":
    preview = "--preview" in sys.argv
    with tempfile.TemporaryDirectory() as tmp:
        if "--voice-dir" in sys.argv:
            voice, timeline, total = build_audio_from_recordings(tmp, sys.argv[sys.argv.index("--voice-dir") + 1])
        else:
            voice, timeline, total = build_audio(tmp)
        frames = int(math.ceil(total * FPS))
        print(f"{len(SCENES)} scenes, {total:.1f}s, {frames} frames", flush=True)
        for sc, tl in zip(SCENES, timeline): print(f"  {sc['id']:<11} {tl['start']:5.1f}–{tl['end']:5.1f}s", flush=True)
        if preview:
            os.makedirs(os.path.join(tmp, "p"), exist_ok=True)
            pts = [float(x) for x in sys.argv[sys.argv.index("--preview") + 1:] if x.replace(".", "").isdigit()] or [tl["start"] + 2.2 for tl in timeline]
            for i, tt in enumerate(pts):
                raw = frame_at((int(tt * FPS), timeline)); a = np.frombuffer(raw, np.uint8).reshape(H, W, 4)[..., [2, 1, 0]]
                Image.fromarray(a).save(f"/tmp/mpg-preview-{i}.png")
            print("previews: /tmp/mpg-preview-*.png"); sys.exit(0)
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        enc = subprocess.Popen([ENCODER, OUT, voice, str(W), str(H), str(FPS), str(frames)], stdin=subprocess.PIPE)
        with Pool(max(2, (os.cpu_count() or 4) - 1)) as pool:
            for i, raw in enumerate(pool.imap(frame_at, ((n, timeline) for n in range(frames)), chunksize=4)):
                enc.stdin.write(raw)
                if i % 150 == 0: print(f"  frame {i}/{frames}", flush=True)
        enc.stdin.close(); enc.wait()
        print("done", OUT)

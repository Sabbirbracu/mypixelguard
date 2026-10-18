# MyPixelGuard — voiceover script (English)

Record **one file per scene** (9 files). Read the lines exactly as written — the on-screen captions use the same words.
If you want to change a word, tell Claude (or edit `SCENES` in `make_video.py`) so the captions match.

**Style:** calm, warm, clear — like explaining it to a friend. Smile a little. Not too fast: leave a short breath (about half a second) between sentences. Say the name as **"My-Pixel-Guard"**.
**Length of the finished video:** about 65–75 seconds.

---

### 1. `intro`  (about 4 s)
> MyPixelGuard. Your images. Your privacy. Your control.

### 2. `problem`  (about 9 s)  — the card for each line lights up on screen
> Every photo you share carries hidden data.
> The exact place it was taken.
> The phone that took it.
> The time.
> Even labels that say it was made by AI.

*(Pause slightly after each short line — the highlights follow your pauses.)*

### 3. `inspect`  (about 7 s)
> MyPixelGuard reads every layer of that data.
> And explains it in plain language, before you share anything.

### 4. `clean`  (about 7 s)
> Then remove only what you choose, or everything.
> Your original is never touched, and every cleaned copy is checked.

### 5. `redact`  (about 8 s)
> Blur faces, emails, phone numbers and more.
> Found on your own computer, with an exact preview before you export.

### 6. `background`  (about 5 s)
> Remove a background without losing quality.
> Only a transparency layer is added.

### 7. `tools`  (about 4 s)
> Resize, compress, convert,
> and run whole folders at once.

### 8. `offline`  (about 7 s)  — a badge appears on screen for each short line
> And it all runs on your computer.
> No account.
> No upload.
> No network code.
> It even works offline.

### 9. `cta`  (about 7 s)
> MyPixelGuard. Free to download for Mac and Windows.
> Find it at mypixelguard dot agentiqbd dot com.

---

## How to record
1. A quiet room, phone about a hand's width from your mouth. The **Voice Memos** app on an iPhone, or QuickTime → File → New Audio Recording on a Mac, is fine.
2. Record each scene as its own take. If you stumble, stop and start that scene again — don't fix it later.
3. Name the files exactly: `intro`, `problem`, `inspect`, `clean`, `redact`, `background`, `tools`, `offline`, `cta` (any of .m4a, .wav, .mp3 works).
4. Put them in one folder and tell Claude the folder path. The video is rebuilt with your voice in about 5 minutes:

```bash
python3 launch/video/make_video.py --voice-dir /path/to/your/recordings
```

Silence at the start and end of each file is trimmed automatically, and the volume is levelled.

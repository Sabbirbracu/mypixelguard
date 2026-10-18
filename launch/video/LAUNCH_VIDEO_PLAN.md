# MyPixelGuard — official introduction video (launch cut)

Direction: cinematic premium software launch · dark navy + restrained orange · real app interface as the hero · English voiceover recorded by you.
Target: ~50 s, 16:9, 1920×1080, 30 fps. Built by `make_launch_video.py` (`launch/assets/mypixelguard-launch.mp4`).

## Storyboard (what is on screen)

| # | Scene | ≈ time | Picture | On-screen copy | Voiceover file |
|---|---|---|---|---|---|
| 1 | Hook | 0–4.6 s | Opens from black on a real before/after: a sample membership card, its personal details blurred by the app (orange wipe) | YOUR IMAGES DESERVE BETTER TOOLS. | `hook` |
| 2 | Brand reveal | 4.6–11 s | Orange light sweep → logo → wordmark; the real app window rises into place | MEET MYPIXELGUARD | `brand` |
| 3 | Core capabilities | 11–22 s | Three close-ups of the real app (no sidebar, no empty space): background removal, metadata inspection + clean, redaction. Cursor, orange highlight, one headline each | Remove backgrounds · Clean metadata · Redact sensitive details | `features` |
| 4 | Workflow | 22–32 s | Quick close-ups: Resize → Convert → Compress (50 % smaller) → Batch studio | Resize. Convert. Compress. Process in batches. | `workflow` |
| 5 | Privacy | 32–39 s | App window with a soft orange outline on navy | Built for privacy. Designed for your desktop. | `privacy` |
| 6 | End card | 39–53 s | Logo, "by Agentiq BD", Windows + macOS, call to action, URL. Held ≥ 4.8 s after the last word | Take control of your images. · mypixelguard.agentiqbd.com | `end` |

Little text on screen on purpose: the voice explains, the screen proves. Subtitles are off by default; `--captions` burns them in for a muted social cut.

## Voiceover — read exactly this (one file per paragraph)

1. `hook` — Your images. Your privacy. Your control.
2. `brand` — Meet MyPixelGuard, your desktop toolkit for smarter, more private image processing.
3. `features` — Remove image backgrounds, inspect and clean hidden metadata, and redact sensitive information — all in one place.
4. `workflow` — Resize, convert, compress, and process images in batches, without the usual complicated workflow.
5. `privacy` — Your images stay on your computer. No cloud upload is needed for local processing.
6. `end` — MyPixelGuard by Agentiq BD. Available for Windows and macOS. Take control of your images at mypixelguard.agentiqbd.com.

Delivery: calm, assured, slightly cinematic — a premium technology brand, not an energetic ad. About 125–140 words a minute, short pauses between statements.
Recording: quiet, soft-furnished room; microphone 6–8 inches from your mouth, slightly off-axis; record 2–3 takes of each paragraph and keep the best. Name the files exactly as above (`hook.m4a`, `brand.wav` …) and put them in one folder.

Pacing is built around your voice: each demonstration switches when the matching word is spoken ("background", "metadata", "sensitive"; "Resize", "convert", "compress", "batches"), and the scene lengths follow your recording.

## Make the final video

```bash
python3 launch/video/make_launch_video.py --voice-dir /path/to/recordings
python3 launch/video/make_launch_video.py --voice-dir /path/to/recordings --music /path/to/track.mp3   # optional, ducks under your voice
python3 launch/video/make_launch_video.py --voice-dir /path/to/recordings --captions                   # muted-autoplay version
```

Music: use only a track you have a licence for (e.g. a royalty-free library). It is mixed low and lowers itself while you speak.

## Honest limits of the current cut
- It is built from the app's real screenshots with animated close-ups, cursor and highlights — not a live screen recording. If you want true footage later, record each feature in QuickTime and drop the clips into CapCut/DaVinci with the same storyboard.
- The hook uses the app's real redaction result (blurred card) because it is available at full resolution; the background-removal before/after is shown in scene 3 where the app shows both side by side.
- The privacy line "No cloud upload is needed for local processing" is true for every feature shown; the app has no network code.

## Next, from the same template
Short vertical (9:16) cuts per feature for Reels/Shorts, a 30 s version for LinkedIn, and a Bangla-narration version (needs Bangla captions rendered through Chrome).

# MyPixelGuard landing page

Plain HTML, CSS and JavaScript. There is no build step and no external requests (fonts are bundled).

## Preview
    cd landing && python3 -m http.server 8000      # then open http://localhost:8000

## Set the download buttons
Open `main.js` and edit the two URLs at the top:

    const DOWNLOADS = { mac: "…/MyPixelGuard.dmg", windows: "…/MyPixelGuard-Setup.exe" };

Every "Download for macOS / Windows" button on the page updates automatically.

Platforms that are not ready yet show a "Coming soon" badge and are not clickable. Windows is currently `"soon"`:
when its installer is hosted, set `DOWNLOADS.windows` and change `STATUS.windows` to `"ready"` in `main.js`.

## Languages
English is written in `index.html`. The Bangla text sits next to it in `data-bn="…"` attributes.
The EN / বাংলা switch in the header swaps them, and the choice is remembered.

## Assets
- `assets/brand/` — logo mark (SVG/PNG) and app icon, copied from `Resources/Brand`.
- `assets/fonts/` — Inter (page text), Noto Sans Bengali (বাংলা) and Sora (logo wordmark only). All SIL Open Font License; licences next to the files (`OFL*.txt`).
- `assets/img/` — screenshots captured from the real app using free Unsplash photos (credits in `assets/img/CREDITS.md`)
  with made-up metadata and data (Alex Morgan, example.com), plus the before/after redaction images.

## Language pop-up
Right after the page loads, a dialog asks the visitor to pick English or বাংলা. The choice is remembered, so it appears once.
To see it again, open the page with `?choose-language`. A link like `?lang=bn` sets the language directly and skips the question.

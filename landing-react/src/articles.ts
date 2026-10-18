// Guide pages that answer the questions people actually type into Google. English only (that is what they search in).
// Every statement about another product is something its own site or a reputable guide says; keep it that way when editing,
// and re-check the "Tools" facts every few months — products change.

export type Block =
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "code"; text: string }
  | { t: "tip"; text: string }
  | { t: "cards"; items: { name: string; meta: string; good: string; watch: string; self?: boolean }[] };

export interface Article {
  id: string;
  crumb?: string;          // breadcrumb label, "Guides" by default
  path: string;            // with leading and trailing slash
  title: string;           // <title> (without the site name)
  desc: string;            // meta description, about 150 characters
  h1: string;
  intro: string;
  updated: string;         // ISO date, shown on the page
  sections: { h2: string; blocks: Block[] }[];
  faq?: { q: string; a: string }[];
}

export const ARTICLES: Article[] = [
  {
    id: "remove-exif-data",
    path: "/remove-exif-data/",
    title: "How to Remove EXIF and GPS Data from Photos (Mac & Windows)",
    desc: "Step-by-step: remove EXIF, GPS location and other hidden metadata from photos on Windows and Mac — with built-in tools, ExifTool, or a free offline app.",
    h1: "How to remove EXIF and GPS data from photos",
    intro: "Every photo from a phone or camera carries hidden information: where it was taken, which device took it, and when. Before you post, sell or send a picture, it is worth removing it. Here are the ways that work on Windows and Mac, from the quickest to the most thorough.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "What is EXIF data, and why remove it?",
        blocks: [
          { t: "p", text: "EXIF is a block of text stored inside the image file. Depending on the device it can include the GPS coordinates where the photo was taken, the camera or phone model, the date and time, and the editing software used. Photos can also carry other labels (XMP, IPTC and, increasingly, C2PA “Content Credentials”)." },
          { t: "p", text: "Some websites strip this data when you upload, but many places do not — email, some messaging apps, forums, marketplaces and file sharing. Do not count on it. If a photo of your home, your child or your desk is going somewhere public, remove the location first." },
        ],
      },
      {
        h2: "Method 1 — Windows File Explorer (built in)",
        blocks: [
          { t: "ol", items: ["Right-click the photo and choose Properties.", "Open the Details tab.", "Click “Remove Properties and Personal Information”.", "Choose “Remove the following properties from this file”, tick what you want gone (or Select All) and click OK."] },
          { t: "tip", text: "Limits: it mainly works for JPEG files, may not cover PNG or HEIC, and it can leave some edit-history data behind. Work on a copy if the original matters." },
        ],
      },
      {
        h2: "Method 2 — Mac Preview (location only)",
        blocks: [
          { t: "ol", items: ["Open the photo in Preview.", "Press Cmd+I to open the Inspector and go to the GPS tab.", "Click “Remove Location Info”."] },
          { t: "tip", text: "Limits: this removes the location only. The camera model, date and other tags stay." },
        ],
      },
      {
        h2: "Method 3 — Stop recording the location in the first place",
        blocks: [
          { t: "ul", items: ["iPhone: Settings → Privacy & Security → Location Services → Camera → Never.", "Android: open the Camera app’s settings and switch off location tags (the wording varies by phone)."] },
          { t: "p", text: "This does not clean photos you already took, but it stops the problem from growing." },
        ],
      },
      {
        h2: "Method 4 — ExifTool (free, command line)",
        blocks: [
          { t: "p", text: "ExifTool is the most thorough free tool and runs on Windows, Mac and Linux. To remove everything from a photo:" },
          { t: "code", text: "exiftool -all= photo.jpg" },
          { t: "tip", text: "By default ExifTool keeps a backup named photo.jpg_original. If you add -overwrite_original it replaces your file — only do that on copies." },
        ],
      },
      {
        h2: "Method 5 — MyPixelGuard (offline, no command line)",
        blocks: [
          { t: "p", text: "MyPixelGuard is a desktop app for Mac and Windows that shows you what is hiding inside a photo before you remove it, then cleans it in one click. Everything happens on your own computer — nothing is uploaded and no internet is needed." },
          { t: "ol", items: ["Drop one photo or a whole folder into MyPixelGuard.", "Read what it found: GPS location, device, dates, AI labels and Content Credentials.", "Click Clean. The cleaned copies are saved in a folder you choose; your originals are never overwritten.", "MyPixelGuard re-opens each saved file to confirm the data is really gone."] },
          { t: "p", text: "The same app can also blur faces and text, remove backgrounds, and convert, resize and compress images." },
        ],
      },
      {
        h2: "How to check that it worked",
        blocks: [
          { t: "p", text: "Open the cleaned file’s properties (Windows: right-click → Properties → Details; Mac: Preview → Cmd+I) and confirm there is no GPS section and no camera model. Better still, use a tool that reads the file back for you, as MyPixelGuard does." },
        ],
      },
    ],
    faq: [
      { q: "Does removing EXIF data reduce image quality?", a: "No. EXIF is text stored beside the pixels. Removing it does not change how the picture looks, though a tool that also re-compresses the image can." },
      { q: "Do WhatsApp, Instagram or Facebook remove EXIF data?", a: "Many large platforms remove location data from the public copy, but this varies and can change. Do not rely on it for photos you send as files, by email, or to smaller sites." },
      { q: "Can I remove metadata from many photos at once?", a: "Yes. ExifTool, ExifCleaner and MyPixelGuard all handle whole folders." },
    ],
  },
  {
    id: "exif-remover-alternatives",
    path: "/exif-remover-alternatives/",
    title: "Best EXIF & Metadata Remover Tools Compared (Free & Offline)",
    desc: "A fair comparison of free EXIF and photo metadata removers for Windows and Mac: File Explorer, Preview, ImageOptim, ExifCleaner, ExifTool, online tools and MyPixelGuard.",
    h1: "Best EXIF and photo metadata remover tools, compared",
    intro: "There are many ways to strip metadata from photos. The right one depends on your system, how many photos you have, and whether they may leave your computer. This is an honest look at the main options — including their limits.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "The tools",
        blocks: [
          {
            t: "cards",
            items: [
              { name: "Windows File Explorer", meta: "Windows · built in · free", good: "Zero install. Right-click → Properties → Details → Remove Properties.", watch: "Mainly JPEG; may not handle PNG or HEIC and can leave some edit history behind." },
              { name: "macOS Preview", meta: "Mac · built in · free", good: "Quick way to remove the GPS location from one photo (Cmd+I → GPS tab).", watch: "Removes the location only. Other tags stay." },
              { name: "ImageOptim", meta: "Mac · free, open source", good: "Drag and drop. Can strip metadata and optimise file size together.", watch: "Overwrites the originals, so work on copies. Mac only." },
              { name: "ExifCleaner", meta: "Windows, Mac, Linux · free, open source (MIT)", good: "Simple drag-and-drop, batch processing, built on the ExifTool engine.", watch: "A cleaner only — it does not blur faces or hide text." },
              { name: "ExifTool", meta: "Windows, Mac, Linux · free", good: "The most thorough and flexible; scriptable for big libraries.", watch: "Command line. Easy to overwrite originals by mistake." },
              { name: "Online EXIF removers", meta: "Browser", good: "Nothing to install.", watch: "Some upload your photo to a server, some say they work inside your browser. Either way you must trust the website — and it is not fully offline." },
              { name: "MyPixelGuard", meta: "Mac and Windows · free to download · offline", good: "Shows what a photo is hiding first, then cleans folders in one click, verifies the result, and also blurs faces and text, removes backgrounds, converts, resizes and compresses.", watch: "A newer app from an independent publisher, so macOS and Windows show a first-run warning (we explain why on the download page).", self: true },
            ],
          },
        ],
      },
      {
        h2: "Which one should you pick?",
        blocks: [
          { t: "ul", items: [
            "One photo, right now, on Windows: File Explorer.",
            "One photo, location only, on Mac: Preview.",
            "Hundreds of photos and you like the command line: ExifTool.",
            "Folders of photos and you want a simple app: ExifCleaner or MyPixelGuard.",
            "You also need faces blurred, text hidden or the background removed: MyPixelGuard does it in the same app, offline.",
            "Anything private or sensitive: prefer a tool that works offline, so the photo never leaves your computer.",
          ] },
        ],
      },
      {
        h2: "A note on trust",
        blocks: [
          { t: "p", text: "Product names belong to their owners and MyPixelGuard is not affiliated with any tool listed here. Details change, so check each project’s own site before you rely on it. If you want to see how MyPixelGuard works before installing, read our guide on removing EXIF and GPS data from photos." },
        ],
      },
    ],
    faq: [
      { q: "Is there a free offline EXIF remover for Windows and Mac?", a: "Yes. ExifCleaner and ExifTool are free and cross-platform, and MyPixelGuard is a free-to-download offline app for both systems." },
      { q: "Which EXIF remover also blurs faces?", a: "Most metadata tools only remove metadata. MyPixelGuard includes a Redact tool that finds faces and text on your computer so you can blur them." },
    ],
  },
  {
    id: "remove-bg-alternative-offline",
    path: "/remove-bg-alternative-offline/",
    title: "Offline Background Remover: a Private remove.bg Alternative",
    desc: "Remove image backgrounds offline on Mac and Windows with no upload. A private alternative to online tools like remove.bg, at your photo’s full resolution.",
    h1: "An offline background remover — a private alternative to remove.bg",
    intro: "Online background removers are quick, but they work by sending your picture to someone else’s server. If the photo is a product shot you have not launched, an ID, or a picture of your family, that is a poor trade. Here is how to remove backgrounds without uploading anything.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "Why go offline?",
        blocks: [
          { t: "ul", items: ["Your photo never leaves your computer — no account, no upload, no copy left on a server.", "It works without internet, on a plane or on a slow connection.", "No per-image limits or credits, because nothing is sent to a service.", "The result keeps your original resolution, so it is ready to print or publish."] },
        ],
      },
      {
        h2: "How MyPixelGuard removes backgrounds on your computer",
        blocks: [
          { t: "p", text: "MyPixelGuard’s Remove Background tool runs an image-segmentation model on your own machine: Apple’s Vision on Mac, and a small neural network bundled with the Windows app. It cuts out the subject, keeps the subject’s original pixels exactly as they were, and saves a lossless PNG or TIFF." },
          { t: "ol", items: ["Open Remove Background and drop in a photo.", "Adjust the edge smoothing for a softer or sharper cut-out.", "Check the before/after preview on a checkerboard, then save a transparent PNG or TIFF — or put the subject on a solid colour.", "Process a whole folder at once; your originals are never touched."] },
        ],
      },
      {
        h2: "Other offline options",
        blocks: [
          { t: "p", text: "If you are comfortable with the command line, rembg is a well-known open-source background remover that runs locally. MyPixelGuard is for people who want the same privacy in a normal desktop app — and who also want to clean metadata, blur faces or compress the result in one place." },
          { t: "tip", text: "Online tools such as remove.bg process images on their servers. They are convenient and may be right for non-sensitive pictures; this guide is for the cases where a picture should stay on your computer. Product names belong to their owners and MyPixelGuard is not affiliated with them." },
        ],
      },
    ],
    faq: [
      { q: "Is there a remove.bg alternative that works offline?", a: "Yes. MyPixelGuard removes backgrounds entirely on your Mac or Windows PC, with no upload and no internet needed. rembg is another local option for people who use the command line." },
      { q: "Does offline background removal lower quality?", a: "MyPixelGuard keeps your original resolution and the subject’s own pixels; only the edge is refined." },
    ],
  },
];

export const MORE: Article[] = [
  {
    id: "metadata-remover-tool",
    path: "/metadata-remover-tool/",
    crumb: "Tools",
    title: "Metadata Remover Tool for Photos — Free, Offline, Mac & Windows",
    desc: "A metadata remover tool for photos: see what is hidden in an image, then remove EXIF, GPS, camera, author and AI metadata — offline on Mac and Windows.",
    h1: "A metadata remover tool for photos — see it, then remove it",
    intro: "MyPixelGuard is a metadata remover for Mac and Windows that first shows you everything a photo is giving away, in plain language, and then removes exactly what you choose. It runs on your computer: no upload, no account, no internet.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "What a metadata removal tool should do",
        blocks: [
          { t: "ul", items: ["Show what is inside before you remove anything, so you can decide.", "Remove every common kind of metadata: EXIF, IPTC, XMP, GPS and C2PA Content Credentials.", "Let you remove just some of it (for example only the location) or all of it.", "Never touch your original file, and check that the result is really clean.", "Handle many photos at once, and work without sending them anywhere."] },
          { t: "p", text: "That is the checklist MyPixelGuard is built around." },
        ],
      },
      {
        h2: "See what your photo is hiding",
        blocks: [
          { t: "p", text: "Open any image and MyPixelGuard reads every layer of hidden data and explains it in plain language. A “Safe to share?” report shows location, device, capture time, author and software at a glance. You can search the data, copy values, or save it all as text." },
          { t: "p", text: "It also shows signs of AI provenance — with honest caveats. What you see is evidence, not a verdict: finding no metadata does not prove a person made the image." },
        ],
      },
      {
        h2: "Remove only what you choose",
        blocks: [
          { t: "ul", items: ["Click words like “location” or “identity” to see every entry behind them, and remove it right there.", "Use a clear table of EXIF, XMP, IPTC, C2PA and more, each with its size and a simple switch.", "Drop only the location, camera, dates, author or software with selective cleaning.", "See a “will be removed / will be kept” summary before you save."] },
          { t: "tip", text: "Content Credentials (C2PA) are only removed after you confirm. Every cleaned file is re-scanned to confirm the data is really gone." },
        ],
      },
      {
        h2: "Clean one photo or a whole folder",
        blocks: [
          { t: "ol", items: ["Drag in photos or a folder.", "Review what MyPixelGuard found.", "Click Clean and choose where to save.", "Your cleaned copies are saved in that folder; originals are never overwritten."] },
          { t: "p", text: "Supported formats: JPEG, PNG and TIFF everywhere. On Mac you can also read and write HEIC, and WebP where supported; on Windows HEIC can be read when Windows has the codec." },
        ],
      },
      {
        h2: "Why offline matters for a metadata remover",
        blocks: [
          { t: "p", text: "The photos you most need to clean are the ones you least want to upload. An online metadata remover asks you to trust a website with them. MyPixelGuard has no network code at all, so your pictures never leave your computer." },
          { t: "p", text: "New to this? Start with our guide on how to remove EXIF and GPS data from photos, or see how it compares with other EXIF remover tools." },
        ],
      },
    ],
    faq: [
      { q: "What metadata does MyPixelGuard remove?", a: "EXIF, IPTC, XMP, GPS location and C2PA Content Credentials — all of it, or only the parts you pick." },
      { q: "Does it change my original photo?", a: "Never. Cleaned images are saved as new copies in a folder you choose, and existing files are never overwritten." },
      { q: "Can it remove metadata from many photos at once?", a: "Yes. Drop in a folder, or build a reusable recipe and run it on a whole batch." },
    ],
  },
  {
    id: "remove-ai-watermark-metadata",
    path: "/remove-ai-watermark-metadata/",
    title: "Remove AI Watermark Data from Photos: What You Can and Can’t Remove",
    desc: "“AI watermark” means three different things. Learn which you can remove (C2PA Content Credentials, AI metadata tags) and which you can’t (invisible watermarks like SynthID).",
    h1: "Remove AI watermark data from photos: what you can and can’t remove",
    intro: "People searching for an AI watermark remover usually mean one of three different things, and only one of them can be removed by a metadata tool. Here is the honest answer for each — so you don’t waste time on a tool that can’t do what it claims.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "1. AI labels stored in the file’s metadata — can be removed",
        blocks: [
          { t: "p", text: "Many AI tools and editors write a label into the image file. The best-known is C2PA Content Credentials: a signed record that describes how an image was made or edited. Platforms such as Facebook and Instagram can read it and add a label. Other AI tags live in the XMP and IPTC metadata, for example fields that describe the digital source of the image." },
          { t: "p", text: "This is metadata, so a metadata remover can take it out. MyPixelGuard shows these labels and, after you confirm, removes them and re-scans the saved file." },
        ],
      },
      {
        h2: "2. Invisible watermarks inside the pixels — cannot be removed this way",
        blocks: [
          { t: "p", text: "Some systems, such as Google’s SynthID, hide a signal in the pixels themselves. It is not in the metadata, so cleaning metadata does not touch it — and MyPixelGuard does not try to remove it." },
          { t: "tip", text: "Be careful with any tool that promises to remove invisible AI watermarks for certain. That claim is hard to verify, and re-processing an image can degrade it." },
        ],
      },
      {
        h2: "3. Visible watermarks and logos — a different job, and a legal one",
        blocks: [
          { t: "p", text: "A visible mark, such as a stock-photo overlay or a logo in the corner, is part of the picture. Removing it is image editing, not metadata cleaning, and MyPixelGuard does not offer it." },
          { t: "p", text: "Removing someone else’s watermark can also break copyright and licence terms. Only remove a visible watermark from images you own or have the right to change, and check the terms of the tool that generated it." },
        ],
      },
      {
        h2: "Removing AI metadata does not change what the image is",
        blocks: [
          { t: "p", text: "Taking out an AI label does not make an AI-generated image any less AI-generated, and some platforms and clients require you to disclose AI-made content whatever the metadata says. Good reasons to clean metadata include privacy (not revealing your tools, files or workflow) and keeping files tidy." },
        ],
      },
      {
        h2: "How to remove AI metadata and Content Credentials with MyPixelGuard",
        blocks: [
          { t: "ol", items: ["Open the image in MyPixelGuard. The Inspect view lists C2PA Content Credentials and AI tags, with honest caveats.", "Choose Clean. Pick everything, or only the AI-related entries.", "Confirm the removal of Content Credentials when asked.", "Save. MyPixelGuard writes a new copy and re-scans it to check the labels are gone."] },
          { t: "p", text: "It runs entirely on your own computer, with no upload." },
        ],
      },
    ],
    faq: [
      { q: "Can MyPixelGuard remove SynthID?", a: "No. SynthID is an invisible signal in the pixels. MyPixelGuard removes metadata labels such as C2PA Content Credentials and AI tags in XMP and IPTC, not watermarks woven into the image." },
      { q: "Can it remove a visible watermark from a photo?", a: "No. Removing a visible logo or overlay is image editing, which MyPixelGuard does not do." },
      { q: "What is C2PA?", a: "A signed record embedded in an image that says how it was made or edited. Platforms can read it to show labels." },
    ],
  },
  {
    id: "image-resizer",
    path: "/image-resizer/",
    crumb: "Tools",
    title: "Image Resizer for Mac & Windows — Resize Photos Offline, in Bulk",
    desc: "Resize images to exact pixels or a percentage, with Instagram, Facebook and YouTube presets. An offline image resizer for Mac and Windows that never uploads your photos.",
    h1: "An offline image resizer for Mac and Windows",
    intro: "Resize one photo or a whole folder to the exact size you need — in pixels or a percentage — without uploading anything. MyPixelGuard keeps the aspect ratio locked, warns you before an upscale softens the image, and never overwrites your originals.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "Exact sizes, in seconds",
        blocks: [
          { t: "ul", items: ["Type exact pixels or a percentage, with the aspect ratio locked.", "Choose how the image should fit: Fit, Fill (crop) or Stretch.", "Use presets for Instagram, Facebook and YouTube, or save your own.", "Turn on “never enlarge” so small images are not stretched.", "Get an upscale warning, so quality is never a surprise."] },
        ],
      },
      {
        h2: "How to resize images",
        blocks: [
          { t: "ol", items: ["Open the Resize tool and drag in your photos or a folder.", "Pick a size, percentage or preset, and how the image should fit.", "Check the preview, choose a folder, and save.", "Your resized copies appear in that folder; originals stay exactly as they were."] },
          { t: "tip", text: "Resizing many photos the same way every week? Save the steps as a recipe — such as Website Optimized or Social Media — and run it on any batch." },
        ],
      },
      {
        h2: "Resize without giving your photos away",
        blocks: [
          { t: "p", text: "Online image resizers need you to upload your pictures first. MyPixelGuard does the work on your own computer, offline. You can also strip location and camera data from the resized copies in the same run, which is useful before you post photos online." },
          { t: "p", text: "Need smaller files as well as smaller dimensions? See the image compressor." },
        ],
      },
    ],
    faq: [
      { q: "Can I resize many images at once?", a: "Yes. Add a folder, or run a saved recipe on a whole batch, with progress and a list of any failed files." },
      { q: "Will resizing overwrite my originals?", a: "No. Resized images are saved as new files in a folder you choose, and existing files are never overwritten." },
      { q: "Which formats can I resize?", a: "JPEG, PNG and TIFF everywhere. On Mac HEIC too, and WebP where supported." },
    ],
  },
  {
    id: "image-compressor",
    path: "/image-compressor/",
    crumb: "Tools",
    title: "Image Compressor for Mac & Windows — Shrink Photos Offline",
    desc: "Compress JPEG and other images with a before/after preview and a quality-vs-size chart. An offline image compressor for Mac and Windows — nothing is uploaded.",
    h1: "An offline image compressor with a before/after preview",
    intro: "Make photos smaller for email, websites and uploads — and see exactly what you are trading. MyPixelGuard shows a before/after preview, a quality-versus-size chart and the savings for every image, all on your own computer.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "See the trade-off before you save",
        blocks: [
          { t: "ul", items: ["Slide the quality and watch the file size change as you go.", "Compare before and after side by side.", "Read a quality-versus-size chart to find the sweet spot.", "Aim for a target size, such as 200 KB (best effort).", "See the savings per image and in total."] },
        ],
      },
      {
        h2: "How to compress images",
        blocks: [
          { t: "ol", items: ["Open the Compress tool and add your images or a folder.", "Set the quality, or a target size, and check the preview.", "Choose where to save and start. A progress bar shows each file.", "Compressed copies are saved to your folder; your originals are not changed."] },
          { t: "tip", text: "PNG is a lossless format, so quality cannot be reduced the same way as in JPEG. MyPixelGuard tells you clearly when that is the case instead of promising savings it cannot deliver." },
        ],
      },
      {
        h2: "Compress privately",
        blocks: [
          { t: "p", text: "Online image compressors receive a copy of every file you upload. MyPixelGuard works offline, so personal photos and unpublished work stay on your computer. Smaller files also tend to carry less hidden data once you clean the metadata — you can do both in one recipe." },
          { t: "p", text: "You may also want to resize images to the exact dimensions you need." },
        ],
      },
    ],
    faq: [
      { q: "Does compressing reduce image quality?", a: "For lossy formats such as JPEG, lower quality means smaller files. MyPixelGuard shows a before/after preview and the size change so you choose the balance." },
      { q: "Can I compress a whole folder?", a: "Yes. Batch compress shows progress and the total savings, and never overwrites existing files." },
      { q: "Is anything uploaded?", a: "No. Everything runs on your own computer and works offline." },
    ],
  },
  {
    id: "background-remover",
    path: "/background-remover/",
    crumb: "Tools",
    title: "Background Remover for Mac & Windows — Offline, Full Quality",
    desc: "Remove image backgrounds offline on Mac and Windows. Subject pixels stay exactly as they were, saved losslessly as PNG or TIFF. No upload, no account.",
    h1: "A background remover that keeps your quality — and your privacy",
    intro: "Cut out the subject of a photo without uploading it anywhere. MyPixelGuard adds only a transparency layer: the subject’s colours and resolution are never changed, and the result is saved without compression loss.",
    updated: "2026-10-18",
    sections: [
      {
        h2: "Remove the background, not the quality",
        blocks: [
          { t: "ul", items: ["Subject pixels stay exactly as they were.", "Saved losslessly as PNG or TIFF.", "Transparent background, or a solid colour of your choice.", "Edge smoothing you can tune with a slider.", "Before/after preview on a checkerboard.", "Whole folders at once, with originals untouched."] },
        ],
      },
      {
        h2: "How to remove a background",
        blocks: [
          { t: "ol", items: ["Open Remove Background and drop in a photo or a folder.", "Check the preview on the checkerboard and adjust the edge smoothing.", "Choose a transparent or solid-colour background and where to save.", "Save. Your original is not changed."] },
          { t: "tip", text: "How well the subject is detected depends on the photo, so always check the preview before you save. On a Mac, Remove Background needs macOS 14." },
        ],
      },
      {
        h2: "Why choose an offline background remover?",
        blocks: [
          { t: "p", text: "Online background removers work by sending your picture to a server. That is fine for a casual snapshot, but not for unreleased products, ID photos or pictures of people. MyPixelGuard runs on your Mac or Windows PC, so the picture never leaves it, and it works without internet." },
          { t: "p", text: "Compare it with online services in our guide to an offline remove.bg alternative." },
        ],
      },
    ],
    faq: [
      { q: "Is there a background remover that works offline?", a: "Yes. MyPixelGuard removes backgrounds entirely on your own computer, with no upload and no internet." },
      { q: "Does removing the background reduce quality?", a: "No. Only a transparency layer is added; the subject’s pixel colours and resolution are never changed." },
      { q: "Can I remove backgrounds from many photos at once?", a: "Yes. Process a whole folder in one go; originals stay untouched." },
    ],
  },
];
ARTICLES.push(...MORE);

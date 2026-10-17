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
          { t: "p", text: "MyPixelGuard’s Remove Background tool runs an image-segmentation model on your own machine: Apple’s Vision on Mac, and a small neural network bundled with the Windows app. It cuts out the subject, keeps the subject’s original pixels, and saves a transparent PNG or WebP." },
          { t: "ol", items: ["Open Remove Background and drop in a photo.", "Adjust the edge smoothing for a softer or sharper cut-out.", "Save a transparent PNG or WebP, or put the subject on a solid colour."] },
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

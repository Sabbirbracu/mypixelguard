// One page per platform: a short countdown that starts the download by itself, a checksum to verify it, and a step-by-step install guide.
import { useEffect, useState, type ReactNode } from "react";
import { DOWNLOADS, DOWNLOAD_DELAY, INSTALL_VIDEO, STATUS, SUPPORT_EMAIL, VIRUSTOTAL } from "./config";
import { LangSwitch, useLang } from "./ui";
import { useReveal } from "./hooks";
import { HeroBackdrop } from "./HeroBackdrop";
import { SPRITE } from "./sprite";
import appIcon from "./assets/brand/app-icon.webp";
import mark from "./assets/brand/MyPixelGuard-Mark-Dark.svg";
import { MacDownloaded, MacDrag, MacNotOpened, MacRunning, MacSettings, WinDownloaded, WinSmartScreen, WinStart, WinWizard } from "./Mocks";

type Platform = "mac" | "windows";
type T = (en: string, bn: string) => string;
type Avail = "checking" | "ok" | "missing";

const FACTS: Record<Platform, { name: string; file: string; req: [string, string] }> = {
  mac: { name: "macOS", file: "MyPixelGuard-mac.dmg", req: ["macOS 13 Ventura or later · Apple Silicon and Intel", "macOS 13 Ventura বা তার পরের ভার্সন · Apple Silicon ও Intel"] },
  windows: { name: "Windows", file: "MyPixelGuard-windows-setup.exe", req: ["Windows 10 or 11 (64-bit)", "Windows 10 বা 11 (64-bit)"] },
};

const sameOriginPath = (url: string) => { try { const u = new URL(url); return u.origin === location.origin ? u.pathname : null; } catch { return null; } };
const formatSize = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1e5) / 10)} MB`;

function Step({ n, title, children, art, tip, shot }: { n: number; title: string; children: ReactNode; art: ReactNode; tip?: string; shot?: boolean }) {
  const { lang } = useLang();
  return (
    <li className="dl-step rv">
      <div className="dl-step-copy">
        <span className="dl-n">{n}</span>
        <h3>{title}</h3>
        <p>{children}</p>
        {tip && <p className="dl-tip"><svg aria-hidden="true"><use href="#i-info" /></svg><span>{tip}</span></p>}
      </div>
      <figure className="dl-art">{art}<figcaption>{shot ? (lang === "bn" ? "আসল স্ক্রিনশট" : "Real screenshot") : (lang === "bn" ? "চিত্র (নমুনা)" : "Illustration")}</figcaption></figure>
    </li>
  );
}

export default function DownloadPage({ platform }: { platform: Platform }) {
  useReveal();
  const { lang } = useLang();
  const t: T = (en, bn) => (lang === "bn" ? bn : en);
  const url = DOWNLOADS[platform];
  const soon = STATUS[platform] === "soon";
  const facts = FACTS[platform];

  const [avail, setAvail] = useState<Avail>("checking");
  const [size, setSize] = useState<string | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [left, setLeft] = useState(DOWNLOAD_DELAY);
  const [phase, setPhase] = useState<"counting" | "paused" | "started">("counting");
  const [copied, setCopied] = useState(false);
  const [hold, setHold] = useState(false);

  // Is the file really there? (Only checkable on the live site; elsewhere we simply assume it is.)
  useEffect(() => {
    setHold(new URLSearchParams(location.search).has("hold"));
    const path = sameOriginPath(url);
    if (!path) { setAvail("ok"); return; }
    fetch(path, { method: "HEAD" }).then((r) => {
      if (!r.ok) { setAvail("missing"); return; }
      const len = Number(r.headers.get("content-length"));
      if (len > 0) setSize(formatSize(len));
      setAvail("ok");
    }).catch(() => setAvail("ok"));
    fetch(path + ".sha256").then((r) => (r.ok ? r.text() : "")).then((txt) => {
      const m = /^[a-f0-9]{64}/i.exec(txt.trim());
      if (m) setSha(m[0].toLowerCase());
    }).catch(() => {});
  }, [url]);

  const start = () => { setPhase("started"); window.location.href = url; };

  useEffect(() => {
    if (phase !== "counting" || avail !== "ok" || soon || hold) return;
    if (left <= 0) { start(); return; }
    const id = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, avail, left, soon, hold]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (text: string) => { try { navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }); } catch { /* clipboard unavailable */ } };

  const R = 46, C = 2 * Math.PI * R;
  const progress = phase === "started" ? 1 : (DOWNLOAD_DELAY - left) / DOWNLOAD_DELAY;
  const video = INSTALL_VIDEO[platform];
  const vt = VIRUSTOTAL[platform];
  const vtClean = vt !== null && vt.flagged === 0;
  const hashCmd = platform === "mac" ? `shasum -a 256 ~/Downloads/${facts.file}` : `certutil -hashfile "%USERPROFILE%\\Downloads\\${facts.file}" SHA256`;

  return (
    <>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE }} />
      <header className="site-header">
        <div className="container">
          <a className="brand" href="/" aria-label="MyPixelGuard home">
            <img src={mark} alt="" width={34} height={34} />
            <span>MyPixel<span className="guard">Guard</span></span>
          </a>
          <div className="header-actions">
            <a className="dl-back" href="/">← {t("Back to home", "হোমে ফিরুন")}</a>
            <LangSwitch />
          </div>
        </div>
      </header>

      <main>
        <section className="hero dl-hero">
          <HeroBackdrop />
          <div className="container dl-hero-in">
            <img className="dl-icon" src={appIcon} alt="" width={84} height={84} />
            <span className="eyebrow">{t(`For ${facts.name}`, `${facts.name}-এর জন্য`)}</span>
            <h1>{t("Your download is almost ready", "আপনার ডাউনলোড প্রায় তৈরি")}</h1>
            <p className="lead">{t(`MyPixelGuard for ${facts.name} · ${facts.req[0]}`, `${facts.name}-এর জন্য MyPixelGuard · ${facts.req[1]}`)}</p>

            <div className="dl-card" aria-live="polite">
              {avail === "missing" || soon ? (
                <div className="dl-missing">
                  <svg aria-hidden="true"><use href="#i-info" /></svg>
                  <div>
                    <b>{t("This installer is being prepared", "এই ইনস্টলারটি তৈরি হচ্ছে")}</b>
                    <p>{t("It isn’t online yet. Please check back soon.", "এখনো অনলাইনে আসেনি। একটু পরে আবার দেখুন।")}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="dl-ring" role="img" aria-label={phase === "started" ? t("Download started", "ডাউনলোড শুরু হয়েছে") : t(`${left} seconds left`, `আর ${left} সেকেন্ড`)}>
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <circle cx="50" cy="50" r={R} className="dl-ring-bg" />
                      <circle cx="50" cy="50" r={R} className="dl-ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
                    </svg>
                    <span>{phase === "started" ? "✓" : phase === "paused" ? "II" : left}</span>
                  </div>
                  <div className="dl-card-copy">
                    <b>
                      {phase === "started" ? t("Your download has started", "আপনার ডাউনলোড শুরু হয়েছে")
                        : phase === "paused" ? t("Automatic download stopped", "অটো ডাউনলোড থামানো হয়েছে")
                        : t(`Download starts in ${left}…`, `${left} সেকেন্ডের মধ্যে ডাউনলোড শুরু হবে…`)}
                    </b>
                    <small>
                      {facts.file}{size ? ` · ${size}` : ""}
                    </small>
                    <div className="dl-actions">
                      <button type="button" className="btn btn-primary" onClick={start}>
                        <svg aria-hidden="true"><use href={platform === "mac" ? "#i-laptop" : "#i-windows"} /></svg>
                        {phase === "started" ? t("Download again", "আবার ডাউনলোড করুন") : t("Download now", "এখনই ডাউনলোড করুন")}
                      </button>
                      {phase === "counting" && <button type="button" className="btn btn-ghost" onClick={() => setPhase("paused")}>{t("Stop countdown", "কাউন্টডাউন থামান")}</button>}
                    </div>
                  </div>
                </>
              )}
            </div>
            {phase === "started" && <p className="dl-after">{t("Download didn’t start? Click “Download again”. Then follow the steps below — it takes about a minute.", "ডাউনলোড শুরু না হলে “আবার ডাউনলোড করুন” চাপুন। তারপর নিচের ধাপগুলো অনুসরণ করুন — এক মিনিটের মতো লাগে।")}</p>}

            <ul className="dl-chips">
              {[["i-lock", "Free · no account", "ফ্রি · অ্যাকাউন্ট নেই"], ["i-wifi-off", "Works offline", "ইন্টারনেট ছাড়াই চলে"], ["i-shield", "Nothing is uploaded", "কিছুই আপলোড হয় না"], ["i-verify", "Checksum to verify", "যাচাইয়ের চেকসাম"]].map(([ic, en, bn]) => (
                <li key={en}><svg aria-hidden="true"><use href={`#${ic}`} /></svg>{t(en, bn)}</li>
              ))}
              {vtClean && vt && (
                <li className="dl-chip-ok"><svg aria-hidden="true"><use href="#i-verify" /></svg>{t(`VirusTotal: ${vt.flagged} / ${vt.vendors} flagged`, `VirusTotal: ${vt.vendors}টার মধ্যে ${vt.flagged}টা সন্দেহ করেছে`)}</li>
              )}
            </ul>
          </div>
        </section>

        {video && (
          <section className="dl-section dl-video">
            <div className="container">
              <h2>{t("Watch: install in one minute", "দেখুন: এক মিনিটে ইনস্টল")}</h2>
              <div className="dl-video-box">
                {/\.(mp4|webm)(\?|$)/i.test(video)
                  ? <video src={video} controls preload="metadata" playsInline />
                  : <iframe src={video} title={t("Installation video", "ইনস্টলেশন ভিডিও")} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen />}
              </div>
            </div>
          </section>
        )}

        <section className="dl-section dl-steps" id="steps">
          <div className="container">
            <div className="section-head rv">
              <span className="kicker">{t("Step by step", "ধাপে ধাপে")}</span>
              <h2>{platform === "mac" ? t("Install on your Mac", "আপনার Mac-এ ইনস্টল করুন") : t("Install on your Windows PC", "আপনার Windows PC-তে ইনস্টল করুন")}</h2>
              <p>{t("Follow these steps once. Pictures marked as illustrations show what you will see.", "ধাপগুলো একবারই অনুসরণ করতে হবে। “illustration” লেখা ছবিগুলো দেখায় আপনি কী দেখতে পাবেন।")}</p>
            </div>
            {platform === "mac" ? (
              <ol className="dl-list">
                <Step n={1} title={t("Open the downloaded file", "ডাউনলোড হওয়া ফাইলটি খুলুন")} art={<MacDownloaded t={t} />}>
                  {t("Open your Downloads folder and double-click MyPixelGuard-mac.dmg.", "Downloads ফোল্ডার খুলে MyPixelGuard-mac.dmg ফাইলে ডাবল-ক্লিক করুন।")}
                </Step>
                <Step n={2} title={t("Drag it into Applications", "Applications-এ টেনে আনুন")} art={<MacDrag t={t} />}>
                  {t("In the window that opens, drag the MyPixelGuard icon onto the Applications folder. Then close the window.", "যে উইন্ডো খুলবে, সেখানে MyPixelGuard আইকনটা Applications ফোল্ডারের ওপর টেনে ছেড়ে দিন। তারপর উইন্ডোটা বন্ধ করুন।")}
                </Step>
                <Step n={3} title={t("Open it — and expect one warning", "অ্যাপটা খুলুন — একটা ওয়ার্নিং আসবে")} art={<MacNotOpened t={t} />} shot
                  tip={t("This is normal for a new publisher; it does not mean the app is unsafe. Click “Done” — not “Move to Trash”.", "নতুন প্রকাশকের অ্যাপে এটা স্বাভাবিক; এর মানে এই না যে অ্যাপটা নিরাপদ না। “Done” চাপুন — “Move to Trash” না।")}>
                  {t("Open MyPixelGuard from Applications (or Launchpad). macOS shows the message on the right the first time.", "Applications (বা Launchpad) থেকে MyPixelGuard খুলুন। প্রথমবার ডানের মতো একটা বার্তা দেখাবে।")}
                </Step>
                <Step n={4} title={t("Allow it in System Settings", "System Settings-এ অনুমতি দিন")} art={<MacSettings t={t} />}>
                  {t("Open System Settings → Privacy & Security, scroll down to the Security section and click Open Anyway next to “MyPixelGuard”. Enter your Mac password or use Touch ID.", "System Settings → Privacy & Security খুলে নিচে Security অংশে যান, “MyPixelGuard”-এর পাশের Open Anyway চাপুন। তারপর Mac-এর পাসওয়ার্ড বা Touch ID দিন।")}
                </Step>
                <Step n={5} title={t("You’re ready", "আপনি তৈরি")} art={<MacRunning t={t} />} shot
                  tip={t("You only do steps 3–4 once. From now on it opens like any other app.", "৩ আর ৪ নম্বর ধাপ একবারই করতে হয়। এরপর থেকে অন্য যেকোনো অ্যাপের মতোই খুলবে।")}>
                  {t("MyPixelGuard opens. Drop in a photo and see what it was hiding.", "MyPixelGuard খুলবে। একটা ছবি দিন, আর দেখুন সেটা কী কী লুকিয়ে রেখেছিল।")}
                </Step>
              </ol>
            ) : (
              <ol className="dl-list">
                <Step n={1} title={t("Run the installer", "ইনস্টলার চালান")} art={<WinDownloaded t={t} />}
                  tip={t("If your browser says the file “isn’t commonly downloaded”, choose Keep (in Edge: “…” → Keep → Show more → Keep anyway).", "ব্রাউজার যদি বলে ফাইলটা “isn’t commonly downloaded”, তাহলে Keep বেছে নিন (Edge-এ: “…” → Keep → Show more → Keep anyway)।")}>
                  {t("Open your Downloads folder and double-click MyPixelGuard-windows-setup.exe.", "Downloads ফোল্ডার খুলে MyPixelGuard-windows-setup.exe ফাইলে ডাবল-ক্লিক করুন।")}
                </Step>
                <Step n={2} title={t("Click “More info”", "“More info” চাপুন")} art={<WinSmartScreen t={t} step={1} />}
                  tip={t("Windows shows this for any app from a new publisher. It is not a virus warning.", "নতুন প্রকাশকের যেকোনো অ্যাপে Windows এটা দেখায়। এটা ভাইরাস ওয়ার্নিং না।")}>
                  {t("If a blue “Windows protected your PC” window appears, click More info.", "নীল রঙের “Windows protected your PC” উইন্ডো এলে More info চাপুন।")}
                </Step>
                <Step n={3} title={t("Click “Run anyway”", "“Run anyway” চাপুন")} art={<WinSmartScreen t={t} step={2} />}>
                  {t("A Run anyway button now appears. Click it to start the installer.", "এবার Run anyway বাটন আসবে। সেটা চেপে ইনস্টলার শুরু করুন।")}
                </Step>
                <Step n={4} title={t("Follow the installer", "ইনস্টলারের ধাপগুলো অনুসরণ করুন")} art={<WinWizard t={t} />}
                  tip={t("On an older Windows 10 without Microsoft’s WebView2 component, setup may download it once. After that the app works offline.", "পুরনো Windows 10-এ যদি Microsoft-এর WebView2 কম্পোনেন্ট না থাকে, সেটআপ একবার সেটা নামাতে পারে। এরপর অ্যাপ অফলাইনেই চলে।")}>
                  {t("Click Next and then Install. It takes less than a minute.", "Next আর তারপর Install চাপুন। এক মিনিটেরও কম সময় লাগে।")}
                </Step>
                <Step n={5} title={t("Open MyPixelGuard", "MyPixelGuard খুলুন")} art={<WinStart t={t} />}>
                  {t("Press the Windows key, type MyPixelGuard and press Enter. Drop in a photo and see what it was hiding.", "Windows কী চেপে MyPixelGuard লিখে Enter চাপুন। একটা ছবি দিন, আর দেখুন সেটা কী কী লুকিয়ে রেখেছিল।")}
                </Step>
              </ol>
            )}
            {platform === "mac" && (
              <details className="dl-alt rv">
                <summary>{t("Prefer Terminal? One command instead of steps 3–4", "Terminal পছন্দ করেন? ৩-৪ নম্বর ধাপের বদলে একটা কমান্ড")}</summary>
                <p>{t("After dragging the app into Applications, run this once, then open the app normally:", "অ্যাপটা Applications-এ টেনে আনার পর এটা একবার চালান, তারপর সাধারণভাবে খুলুন:")}</p>
                <div className="dl-code"><code>xattr -dr com.apple.quarantine /Applications/MyPixelGuard.app</code><button type="button" onClick={() => copy("xattr -dr com.apple.quarantine /Applications/MyPixelGuard.app")}>{copied ? t("Copied", "কপি হয়েছে") : t("Copy", "কপি")}</button></div>
              </details>
            )}
          </div>
        </section>

        <section className="dl-section dl-trust">
          <div className="container dl-trust-grid">
            <div className="dl-panel rv">
              <div className="dl-panel-h"><svg aria-hidden="true"><use href="#i-info" /></svg><h3>{t("Why do I see a warning?", "ওয়ার্নিং কেন দেখাচ্ছে?")}</h3></div>
              <p>{platform === "mac"
                ? t("Apple shows this for every app from a publisher it hasn’t seen before, until the publisher joins its paid developer programme. MyPixelGuard is from Agentiq BD, an independent publisher. The message means “new”, not “dangerous”.", "যে প্রকাশকের অ্যাপ Apple আগে দেখেনি, সেই প্রতিটা অ্যাপের জন্যই Apple এটা দেখায়, যতক্ষণ না প্রকাশক তাদের পেইড ডেভেলপার প্রোগ্রামে যোগ দেয়। MyPixelGuard এসেছে স্বাধীন প্রকাশক Agentiq BD থেকে। বার্তাটার মানে “নতুন”, “বিপজ্জনক” না।")
                : t("Windows shows this for every app from a publisher it hasn’t seen much before, until the app has been downloaded by enough people or carries a paid certificate. MyPixelGuard is from Agentiq BD, an independent publisher. The message means “new”, not “dangerous”.", "যে প্রকাশকের অ্যাপ Windows বেশি দেখেনি, সেই প্রতিটা অ্যাপে এটা দেখায়, যতক্ষণ না অ্যাপটা যথেষ্ট মানুষ নামায় বা পেইড সার্টিফিকেট পায়। MyPixelGuard এসেছে স্বাধীন প্রকাশক Agentiq BD থেকে। বার্তাটার মানে “নতুন”, “বিপজ্জনক” না।")}</p>
            </div>
            <div className="dl-panel rv">
              <div className="dl-panel-h"><svg aria-hidden="true"><use href="#i-verify" /></svg><h3>{t("Check it yourself", "নিজেই যাচাই করুন")}</h3></div>
              <p>{t("This is the file’s SHA-256 fingerprint. After downloading, run the command below; if the result is identical, the file is exactly what we published.", "এটা ফাইলের SHA-256 ফিঙ্গারপ্রিন্ট। ডাউনলোডের পর নিচের কমান্ডটা চালান; ফলাফল হুবহু মিললে ফাইলটা আমাদের প্রকাশ করা ফাইলই।")}</p>
              <div className="dl-code dl-sha"><code>{sha ?? t("Available once the file is published", "ফাইল প্রকাশিত হলে এখানে দেখা যাবে")}</code>{sha && <button type="button" onClick={() => copy(sha)}>{copied ? t("Copied", "কপি হয়েছে") : t("Copy", "কপি")}</button>}</div>
              <div className="dl-code"><code>{hashCmd}</code><button type="button" onClick={() => copy(hashCmd)}>{t("Copy", "কপি")}</button></div>
              {vt && (
                <div className={`dl-vt${vtClean ? " is-clean" : ""}`}>
                  <svg aria-hidden="true"><use href="#i-shield" /></svg>
                  <div>
                    <b>{vtClean
                      ? t(`VirusTotal: ${vt.flagged} of ${vt.vendors} security vendors flagged this file`, `VirusTotal: ${vt.vendors}টা সিকিউরিটি ভেন্ডরের মধ্যে ${vt.flagged}টাও এই ফাইলকে সন্দেহ করেনি`)
                      : t(`VirusTotal: ${vt.flagged} of ${vt.vendors} security vendors flagged this file`, `VirusTotal: ${vt.vendors}টা ভেন্ডরের মধ্যে ${vt.flagged}টা ফাইলটাকে সন্দেহ করেছে`)}</b>
                    <a href={vt.url} target="_blank" rel="noopener noreferrer">{t("Open the public scan report ↗", "পাবলিক স্ক্যান রিপোর্ট দেখুন ↗")}</a>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="container">
            <ul className="dl-faq rv">
              <li><b>{t("Does it need the internet?", "ইন্টারনেট লাগে?")}</b><span>{t("No. The app has no network code and works offline. Your photos never leave your computer.", "না। অ্যাপে নেটওয়ার্কের কোনো কোড নেই, অফলাইনেই চলে। আপনার ছবি কখনো কম্পিউটারের বাইরে যায় না।")}</span></li>
              <li><b>{t("Is it free?", "এটা কি ফ্রি?")}</b><span>{t("Yes. No account and no sign-up.", "হ্যাঁ। অ্যাকাউন্ট বা সাইন-আপ লাগে না।")}</span></li>
              <li><b>{t("Can I remove it later?", "পরে কি মুছে ফেলা যায়?")}</b><span>{platform === "mac" ? t("Yes — drag MyPixelGuard from Applications to the Trash.", "হ্যাঁ — Applications থেকে MyPixelGuard টেনে Trash-এ ফেলুন।") : t("Yes — Settings → Apps → MyPixelGuard → Uninstall.", "হ্যাঁ — Settings → Apps → MyPixelGuard → Uninstall।")}</span></li>
            </ul>
            {SUPPORT_EMAIL && <p className="dl-help">{t("Stuck? Write to", "আটকে গেছেন? লিখুন")} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>}
            <p className="dl-other">{platform === "mac" ? <a href="/download/windows/">{t("Looking for Windows? →", "Windows-এর জন্য খুঁজছেন? →")}</a> : <a href="/download/mac/">{t("Looking for Mac? →", "Mac-এর জন্য খুঁজছেন? →")}</a>}</p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <a className="brand" href="/"><img src={mark} alt="" width={28} height={28} /><span>MyPixel<span className="guard">Guard</span></span></a>
          <p>{t("A product of", "প্রকাশক:")} <a className="brand-link" href="https://agentiqbd.com" target="_blank" rel="noopener">Agentiq BD</a> · © 2026</p>
        </div>
      </footer>
    </>
  );
}

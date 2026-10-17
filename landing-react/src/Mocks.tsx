// Small, faithful drawings of the things people will see while installing, used on the download pages.
// They are illustrations (labelled as such), except the Mac "Not Opened" picture, which is a real screenshot.
import type { ReactNode } from "react";
import appIcon from "./assets/brand/app-icon.webp";
import dmgBg from "./assets/guide/dmg-bg.webp";
import notOpened from "./assets/guide/mac-not-opened.webp";
import installerSide from "./assets/guide/installer-side.webp";
import appShot from "./assets/img/app-clean.webp";

type T = (en: string, bn: string) => string;

function MacFrame({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`mk mk-mac ${className}`}>
      <div className="mk-bar"><i style={{ background: "#FF5F57" }} /><i style={{ background: "#FEBC2E" }} /><i style={{ background: "#28C840" }} /><b>{title}</b></div>
      {children}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 96 80" className="mk-folder" aria-hidden="true">
      <path d="M6 14a8 8 0 0 1 8-8h22l8 9h38a8 8 0 0 1 8 8v47a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill="#5BB8F5" />
      <path d="M6 28a8 8 0 0 1 8-8h68a8 8 0 0 1 8 8v39a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill="#8BD0FA" />
      <path d="M48 36l-9 17h6l-3 6h14l-3-6h6z" fill="#fff" opacity=".9" />
    </svg>
  );
}

/* ── macOS ─────────────────────────────────────────────────────────────── */

export function MacDownloaded({ t }: { t: T }) {
  return (
    <MacFrame title={t("Downloads", "Downloads")}>
      <div className="mk-body mk-files">
        <div className="mk-file mk-focus">
          <svg viewBox="0 0 64 72" aria-hidden="true"><path d="M8 4h32l16 16v44a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="#E7EAF0" /><path d="M40 4l16 16H44a4 4 0 0 1-4-4z" fill="#C6CCD8" /><circle cx="30" cy="46" r="14" fill="#FF7A00" /><path d="M30 38v16M22 46h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
          <b>MyPixelGuard-mac.dmg</b>
          <small>{t("Double-click to open", "ডাবল-ক্লিক করে খুলুন")}</small>
        </div>
      </div>
    </MacFrame>
  );
}

export function MacDrag({ t }: { t: T }) {
  return (
    <MacFrame title="MyPixelGuard 1.0" className="mk-dmg">
      <div className="mk-dmgbody" style={{ backgroundImage: `url(${dmgBg})` }}>
        <div className="mk-dmg-app"><img src={appIcon} alt="" width={96} height={96} /><span>MyPixelGuard</span></div>
        <div className="mk-dmg-apps"><FolderIcon /><span>Applications</span></div>
      </div>
      <span className="mk-sr">{t("Drag the MyPixelGuard icon onto the Applications folder", "MyPixelGuard আইকনটা Applications ফোল্ডারের ওপর টেনে আনুন")}</span>
    </MacFrame>
  );
}

export function MacNotOpened({ t }: { t: T }) {
  return (
    <div className="mk-shot">
      <img src={notOpened} alt={t("The macOS message “MyPixelGuard Not Opened — Apple could not verify…”", "macOS-এর বার্তা “MyPixelGuard Not Opened — Apple could not verify…”")} width={298} height={362} loading="lazy" />
      <span className="mk-pointer" style={{ left: "50%", top: "100%" }}>{t("▲ Click “Done”", "▲ “Done” চাপুন")}</span>
    </div>
  );
}

export function MacSettings({ t }: { t: T }) {
  return (
    <MacFrame title={t("Privacy & Security", "Privacy & Security")}>
      <div className="mk-body mk-settings">
        <div className="mk-set-h">{t("Security", "Security")}</div>
        <div className="mk-set-row">
          <span>{t("Allow applications from", "Allow applications from")}</span>
          <em>App Store &amp; Known Developers</em>
        </div>
        <div className="mk-set-alert mk-focus">
          <p>“MyPixelGuard” {t("was blocked to protect your Mac.", "was blocked to protect your Mac.")}</p>
          <span className="mk-btn mk-btn-blue">Open Anyway</span>
        </div>
      </div>
    </MacFrame>
  );
}

export function MacRunning({ t }: { t: T }) {
  return (
    <MacFrame title="MyPixelGuard" className="mk-run">
      <img src={appShot} alt={t("MyPixelGuard open and ready to use", "MyPixelGuard খোলা, ব্যবহারের জন্য তৈরি")} loading="lazy" />
    </MacFrame>
  );
}

/* ── Windows ───────────────────────────────────────────────────────────── */

export function WinDownloaded({ t }: { t: T }) {
  return (
    <div className="mk mk-win">
      <div className="mk-wbar"><b>{t("Downloads", "Downloads")}</b></div>
      <div className="mk-body mk-files">
        <div className="mk-file mk-focus">
          <svg viewBox="0 0 64 72" aria-hidden="true"><rect x="6" y="6" width="52" height="60" rx="5" fill="#E7EAF0" /><rect x="6" y="6" width="52" height="14" rx="5" fill="#0F6CBD" /><circle cx="32" cy="44" r="13" fill="#FF7A00" /><path d="M32 36v16M24 44h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
          <b>MyPixelGuard-windows-setup.exe</b>
          <small>{t("Double-click to run", "ডাবল-ক্লিক করে চালান")}</small>
        </div>
      </div>
    </div>
  );
}

export function WinSmartScreen({ t, step }: { t: T; step: 1 | 2 }) {
  return (
    <div className="mk mk-ss">
      <div className="mk-ss-body">
        <h4>Windows protected your PC</h4>
        <p>Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.</p>
        {step === 1 ? (
          <span className="mk-link mk-focus">More info</span>
        ) : (
          <dl><dt>App:</dt><dd>MyPixelGuard-windows-setup.exe</dd><dt>Publisher:</dt><dd>Unknown publisher</dd></dl>
        )}
      </div>
      <div className="mk-ss-foot">
        {step === 2 && <span className="mk-btn mk-btn-light mk-focus">Run anyway</span>}
        <span className="mk-btn mk-btn-ghost">Don’t run</span>
      </div>
      <span className="mk-sr">{step === 1 ? t("Click More info", "More info চাপুন") : t("Click Run anyway", "Run anyway চাপুন")}</span>
    </div>
  );
}

export function WinWizard({ t }: { t: T }) {
  return (
    <div className="mk mk-win mk-wiz">
      <div className="mk-wbar"><b>MyPixelGuard Setup</b></div>
      <div className="mk-wiz-body">
        <img src={installerSide} alt="" width={82} height={157} />
        <div>
          <h4>{t("Welcome to MyPixelGuard Setup", "MyPixelGuard সেটআপে স্বাগতম")}</h4>
          <p>{t("This wizard installs MyPixelGuard on your computer. Click Next to continue.", "এই উইজার্ড আপনার কম্পিউটারে MyPixelGuard ইনস্টল করবে। এগোতে Next চাপুন।")}</p>
        </div>
      </div>
      <div className="mk-wiz-foot"><span className="mk-btn mk-btn-win mk-focus">{t("Next", "Next")} &gt;</span><span className="mk-btn mk-btn-win">{t("Cancel", "Cancel")}</span></div>
    </div>
  );
}

export function WinStart({ t }: { t: T }) {
  return (
    <div className="mk mk-win mk-start">
      <div className="mk-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M13 13l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>MyPixelGuard</div>
      <div className="mk-hit mk-focus"><img src={appIcon} alt="" width={40} height={40} /><div><b>MyPixelGuard</b><small>{t("App", "অ্যাপ")}</small></div></div>
    </div>
  );
}

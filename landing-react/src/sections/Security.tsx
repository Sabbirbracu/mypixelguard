// "Safe to install" — only claims things that are true and checkable. The virus-scan line appears once a VirusTotal link is set in config.ts.
import { L, useLang } from "../ui";
import { DOWNLOAD_PAGES, VIRUSTOTAL } from "../config";

export default function Security() {
  const { lang } = useLang();
  const t = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const reports = [VIRUSTOTAL.mac, VIRUSTOTAL.windows].filter((r) => r !== null);
  const scanned = reports.length > 0;
  const both = reports.length === 2;
  const items: { icon: string; en: string; bn: string; den: string; dbn: string }[] = [
    { icon: "i-wifi-off", en: "No network code at all", bn: "নেটওয়ার্কের কোনো কোডই নেই",
      den: "The app cannot send anything anywhere. Turn off your Wi-Fi and it works exactly the same.", dbn: "অ্যাপটা কোথাও কিছু পাঠাতেই পারে না। Wi-Fi বন্ধ করে দিলেও ঠিক একইভাবে চলে।" },
    { icon: "i-user", en: "Tested by a person, every release", bn: "প্রতিটা ভার্সন মানুষ নিজে পরীক্ষা করে",
      den: "Before a version goes online, our team opens it and tries every tool by hand. Nothing is published untested.", dbn: "কোনো ভার্সন অনলাইনে দেওয়ার আগে আমাদের টিম নিজে খুলে প্রতিটা টুল হাতে চালিয়ে দেখে। পরীক্ষা ছাড়া কিছু প্রকাশ হয় না।" },
    { icon: "i-verify", en: "Check your download yourself", bn: "ডাউনলোড নিজেই যাচাই করুন",
      den: "Every download page shows the file's SHA-256 fingerprint. If yours matches, the file is exactly what we published.", dbn: "প্রতিটা ডাউনলোড পেজে ফাইলের SHA-256 ফিঙ্গারপ্রিন্ট দেওয়া থাকে। আপনারটা মিললে বুঝবেন ফাইলটা হুবহু আমাদের প্রকাশ করা ফাইল।" },
    { icon: "i-lock", en: "Your photos stay on your computer", bn: "আপনার ছবি থাকে আপনার কম্পিউটারেই",
      den: "No account, no cloud, no upload. Originals are never changed — results go to a folder you choose.", dbn: "অ্যাকাউন্ট নেই, ক্লাউড নেই, আপলোড নেই। আসল ছবি কখনো বদলায় না — ফলাফল যায় আপনার বেছে নেওয়া ফোল্ডারে।" },
    { icon: "i-info", en: "Honest about the first-run warning", bn: "প্রথমবারের ওয়ার্নিং নিয়ে খোলামেলা কথা",
      den: "macOS and Windows warn about any app from a new publisher. We explain why, and exactly how to continue, on the download page.", dbn: "নতুন প্রকাশকের যেকোনো অ্যাপ নিয়ে macOS আর Windows ওয়ার্নিং দেয়। কেন দেয় আর কীভাবে এগোবেন, ডাউনলোড পেজে পরিষ্কার লেখা আছে।" },
  ];
  if (scanned) items.splice(3, 0, { icon: "i-shield", en: "Scanned with VirusTotal", bn: "VirusTotal দিয়ে ভাইরাস স্ক্যান করা",
    den: both ? "Both installers were scanned by dozens of antivirus engines. The public reports are linked on each download page."
      : "The Mac installer was scanned by dozens of antivirus engines and none flagged it. The public report is linked on its download page.",
    dbn: both ? "দুটো ইনস্টলারই কয়েক ডজন অ্যান্টিভাইরাস ইঞ্জিন দিয়ে স্ক্যান করা। পাবলিক রিপোর্টের লিংক প্রতিটা ডাউনলোড পেজে আছে।"
      : "Mac ইনস্টলারটা কয়েক ডজন অ্যান্টিভাইরাস ইঞ্জিন দিয়ে স্ক্যান করা, কোনোটাই সন্দেহ করেনি। পাবলিক রিপোর্টের লিংক ডাউনলোড পেজে আছে।" });
  return (
    <section className="security" id="security">
      <div className="container">
        <div className="section-head rv">
          <L as="span" className="kicker" en="Safe to install" bn="নিশ্চিন্তে ইনস্টল করুন" />
          <L as="h2" en="Checked by people. Safe by design." bn="মানুষের পরীক্ষা করা। নিরাপদ হিসেবেই বানানো।" />
          <L as="p" en="We know installing software from a new name takes trust. So we made everything easy to check — you don't have to just take our word for it." bn="নতুন কোনো নামের সফটওয়্যার ইনস্টল করতে ভরসা লাগে, সেটা আমরা জানি। তাই সবকিছু এমনভাবে রেখেছি যাতে আপনি নিজেই যাচাই করতে পারেন — শুধু আমাদের কথার ওপর নির্ভর করতে হবে না।" />
        </div>
        <div className="sec-grid">
          {items.map((it) => (
            <article className="sec-card rv" key={it.en}>
              <div className="ic"><svg aria-hidden="true"><use href={`#${it.icon}`} /></svg></div>
              <h3>{t(it.en, it.bn)}</h3>
              <p>{t(it.den, it.dbn)}</p>
            </article>
          ))}
        </div>
        <div className="sec-cta rv">
          <span>{t("See exactly how to verify and install:", "কীভাবে যাচাই আর ইনস্টল করবেন, ধাপে ধাপে দেখুন:")}</span>
          <a className="btn btn-outline btn-sm" href={DOWNLOAD_PAGES.mac}>{t("macOS guide", "macOS গাইড")}</a>
          <a className="btn btn-outline btn-sm" href={DOWNLOAD_PAGES.windows}>{t("Windows guide", "Windows গাইড")}</a>
        </div>
      </div>
    </section>
  );
}

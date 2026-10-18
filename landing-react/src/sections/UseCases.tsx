// What people actually do with the app, in the words they search with. Natural sentences — no keyword lists.
import { L, useLang } from "../ui";

const ITEMS: { icon: string; en: string; bn: string; den: string; dbn: string; href?: string }[] = [
  { icon: "i-pin", en: "Remove location from photos", bn: "ছবি থেকে লোকেশন মুছুন", href: "/remove-exif-data/",
    den: "Strip the GPS coordinates from a picture before you post it, sell something or send it to someone you don’t know.", dbn: "ছবি পোস্ট করা, কিছু বিক্রি করা বা অচেনা কাউকে পাঠানোর আগে GPS লোকেশন মুছে ফেলুন।" },
  { icon: "i-eraser", en: "Metadata remover tool, in bulk", bn: "মেটাডেটা রিমুভার, একসাথে অনেক ছবিতে", href: "/metadata-remover-tool/",
    den: "See what a photo is hiding, then remove EXIF and other metadata from a whole folder at once — every saved file is checked.", dbn: "ছবি কী লুকিয়ে রেখেছে দেখুন, তারপর পুরো ফোল্ডারের EXIF আর অন্য মেটাডেটা একসাথে মুছুন — সেভ হওয়া প্রতিটা ফাইল যাচাই হয়।" },
  { icon: "i-shield", en: "Remove AI metadata and Content Credentials", bn: "AI মেটাডেটা আর Content Credentials মুছুন", href: "/remove-ai-watermark-metadata/",
    den: "See C2PA Content Credentials and AI tags stored in a photo, and remove them when you choose. (Invisible watermarks like SynthID can’t be removed.)", dbn: "ছবিতে থাকা C2PA Content Credentials আর AI ট্যাগ দেখুন, চাইলে মুছুন। (SynthID-এর মতো অদৃশ্য ওয়াটারমার্ক মোছা যায় না।)" },
  { icon: "i-wand", en: "Background remover, offline", bn: "অফলাইন ব্যাকগ্রাউন্ড রিমুভার", href: "/background-remover/",
    den: "Cut out the subject on your own computer, at full quality, with no upload — a private alternative to online background removers.", dbn: "নিজের কম্পিউটারেই, পুরো কোয়ালিটিতে, আপলোড ছাড়া ছবির মূল বিষয়টা আলাদা করুন — অনলাইন টুলের একটা প্রাইভেট বিকল্প।" },
  { icon: "i-crop", en: "Image resize", bn: "ইমেজ রিসাইজ", href: "/image-resizer/",
    den: "Resize to exact pixels or a percentage, with Instagram, Facebook and YouTube presets — for one photo or a whole folder.", dbn: "সঠিক পিক্সেল বা শতাংশে রিসাইজ করুন, Instagram, Facebook আর YouTube-এর প্রিসেট সহ — একটা ছবি বা পুরো ফোল্ডার।" },
  { icon: "i-compress", en: "Image compressor", bn: "ইমেজ কমপ্রেসর", href: "/image-compressor/",
    den: "Shrink photos for email and websites with a before/after preview and a quality-versus-size chart.", dbn: "ইমেইল আর ওয়েবসাইটের জন্য ছবি ছোট করুন, আগে-পরের প্রিভিউ আর কোয়ালিটি-বনাম-সাইজ চার্ট সহ।" },
  { icon: "i-eyeoff", en: "Blur faces and hide private text", bn: "মুখ ব্লার করুন, ব্যক্তিগত লেখা লুকান",
    den: "Find faces, emails, phone numbers and number plates in a photo and blur, pixelate or cover them.", dbn: "ছবির ভেতরের মুখ, ইমেইল, ফোন নম্বর আর গাড়ির নম্বর প্লেট খুঁজে ব্লার, পিক্সেলেট বা ঢেকে দিন।" },
];

export default function UseCases() {
  const { lang } = useLang();
  const t = (en: string, bn: string) => (lang === "bn" ? bn : en);
  return (
    <section className="usecases" id="uses">
      <div className="container">
        <div className="section-head rv">
          <L as="span" className="kicker" en="What you can do" bn="যা যা করতে পারবেন" />
          <L as="h2" en="One app for everything your photos give away" bn="আপনার ছবি যা যা ফাঁস করে দেয়, তার সবকিছুর জন্য একটাই অ্যাপ" />
        </div>
        <div className="sec-grid">
          {ITEMS.map((it) => (
            <article className="sec-card rv" key={it.en}>
              <div className="ic"><svg aria-hidden="true"><use href={`#${it.icon}`} /></svg></div>
              <h3>{t(it.en, it.bn)}</h3>
              <p>{t(it.den, it.dbn)}</p>
              {it.href && <a className="sec-more" href={it.href}>{t("Learn more →", "আরও জানুন →")}</a>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

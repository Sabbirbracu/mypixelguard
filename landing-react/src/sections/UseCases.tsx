// What people actually do with the app, in the words they search with. Natural sentences — no keyword lists.
import { L, useLang } from "../ui";

const ITEMS: { icon: string; en: string; bn: string; den: string; dbn: string }[] = [
  { icon: "i-pin", en: "Remove location from photos", bn: "ছবি থেকে লোকেশন মুছুন",
    den: "Strip the GPS coordinates from a picture before you post it, sell something or send it to someone you don’t know.", dbn: "ছবি পোস্ট করা, কিছু বিক্রি করা বা অচেনা কাউকে পাঠানোর আগে GPS লোকেশন মুছে ফেলুন।" },
  { icon: "i-eraser", en: "Remove EXIF and metadata in bulk", bn: "একসাথে অনেক ছবির EXIF ও মেটাডেটা মুছুন",
    den: "Clean a whole folder of photos at once and have every saved file checked to confirm the data is gone.", dbn: "পুরো একটা ফোল্ডারের ছবি একসাথে পরিষ্কার করুন, আর সেভ হওয়া প্রতিটা ফাইল যাচাই হয়ে যাবে।" },
  { icon: "i-eyeoff", en: "Blur faces and hide private text", bn: "মুখ ব্লার করুন, ব্যক্তিগত লেখা লুকান",
    den: "Find faces, emails, phone numbers and number plates in a photo and blur, pixelate or cover them.", dbn: "ছবির ভেতরের মুখ, ইমেইল, ফোন নম্বর আর গাড়ির নম্বর প্লেট খুঁজে ব্লার, পিক্সেলেট বা ঢেকে দিন।" },
  { icon: "i-wand", en: "Remove a background offline", bn: "অফলাইনে ব্যাকগ্রাউন্ড মুছুন",
    den: "Cut out the subject on your own computer, at full resolution, with no upload — a private alternative to online background removers.", dbn: "নিজের কম্পিউটারেই, পুরো রেজোলিউশনে, আপলোড ছাড়া ছবির মূল বিষয়টা আলাদা করুন — অনলাইন টুলের একটা প্রাইভেট বিকল্প।" },
  { icon: "i-compress", en: "Compress, resize and convert", bn: "Compress, Resize আর Convert",
    den: "Shrink photos for email and websites, resize them for social media, and convert between JPG, PNG, WebP and TIFF.", dbn: "ইমেইল আর ওয়েবসাইটের জন্য ছবি ছোট করুন, সোশ্যাল মিডিয়ার মাপে বদলান, আর JPG, PNG, WebP, TIFF-এ কনভার্ট করুন।" },
  { icon: "i-shield", en: "Check for hidden AI labels", bn: "লুকানো AI লেবেল দেখুন",
    den: "See C2PA Content Credentials and AI tags stored in a photo’s metadata, and remove them when you choose to.", dbn: "ছবির মেটাডেটায় থাকা C2PA Content Credentials আর AI ট্যাগ দেখুন, চাইলে মুছে ফেলুন।" },
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
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

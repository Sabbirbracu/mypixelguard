#!/usr/bin/env python3
"""Builds the Windows UI's translation files from the macOS app's Swift string tables.

The Mac tables stay the single source of truth for shared wording, so English and Bangla match across
platforms. Mac-only phrases ("this Mac", Finder, macOS 14 …) are replaced by the overrides below, and
Windows-only strings are added in EXTRA_*.

    python3 scripts/gen_i18n.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SWIFT = ROOT / "Sources" / "MetaDataRemover"
OUT = ROOT / "windows" / "src" / "i18n"

LINE = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')


def unescape(s: str) -> str:
    s = re.sub(r"\\u\{([0-9a-fA-F]+)\}", lambda m: chr(int(m.group(1), 16)), s)
    return s.replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\")


def load(name: str) -> dict:
    table = {}
    for line in (SWIFT / name).read_text(encoding="utf-8").splitlines():
        m = LINE.match(line)
        if m:
            table[unescape(m.group(1))] = unescape(m.group(2))
    return table


# Mac wording -> Windows wording.
OVERRIDES_EN = {
    "privacy.badge": "Everything happens on your PC. Nothing is uploaded.",
    "action.showInFinder": "Show in File Explorer",
    "help.addImages": "Add images (Ctrl+O)",
    "empty.subtitle": "Inspect, clean, redact, convert, optimize and enhance images on your PC — nothing leaves your device.",
    "empty.browse": "or browse files on your PC",
    "step.add.text": "Drag them in or choose them from your PC. Folders work too.",
    "visual.scan.run": "Scan on this PC",
    "visual.scan.local": "Runs locally with Windows text recognition and an on-device face model. Image pixels and recognized text never leave this PC.",
    "bg.unavailable": "Background removal needs its AI model file (isnet-general-use.onnx), which was not found next to the app. Reinstall MyPixelGuard to restore it.",
    "bg.err.unsupported": "Background removal needs its AI model file (isnet-general-use.onnx), which was not found next to the app.",
    "ai.subtitle": "Enhance, upscale, crop around the subject, or remove the background locally on your PC.",
    "ai.enhance.hint": "Adjust color, contrast and exposure automatically.",
    "ai.background.hint": "Create a transparent foreground with the on-device AI model.",
    "ai.background.unavailable": "Background removal needs its AI model file, which was not found. Other selected steps will still run.",
    "ai.local": "These tools run on this PC. Images are not uploaded.",
    "ai.note.backgroundUnavailable": "Background removal was skipped because its model file was not found.",
    "format.unavailable": "Not available on this PC: %@.",
    "err.formatUnavailable": "This PC can’t write %@ files.",
    "settings.privacy.body": "Images are opened, changed and saved on this PC only. The app doesn’t upload images or metadata and doesn’t need an internet connection.",
    "bg.lossy.hint": "Lossless formats keep full quality. Lossy ones trade some for size.",
    "ai.background": "Remove background",
    "inspect.scan.local": "Runs locally on this PC.",
    "redact.detection.scanning": "Scanning on this PC…",
    "consent.yes": "Sent: app version, Windows version, language, how often the app was opened and which tools saved images.",
    "feedback.note": "Sent with only the app version, Windows version and language — no photos and no personal details.",
    "settings.usage.note": "App version, Windows version, language, how often the app was opened and which tools saved images. Never photos, file names or metadata. Turning this off deletes what was collected.",
}
OVERRIDES_BN = {
    "privacy.badge": "সবকিছু আপনার PC-তেই হয়। কিছুই আপলোড হয় না।",
    "action.showInFinder": "File Explorer-এ দেখান",
    "help.addImages": "ছবি যোগ করুন (Ctrl+O)",
    "empty.subtitle": "আপনার PC-তেই ছবির Metadata দেখুন, মুছুন, কিছু অংশ লুকান, Convert বা Compress করুন — কিছুই ডিভাইসের বাইরে যায় না।",
    "empty.browse": "অথবা PC থেকে ফাইল বেছে নিন",
    "step.add.text": "টেনে এনে ছেড়ে দিন, নয়তো PC থেকে বেছে নিন। পুরো Folder-ও দিতে পারেন।",
    "visual.scan.run": "এই PC-তে Scan করুন",
    "visual.scan.local": "Windows-এর লেখা চেনার সুবিধা আর ডিভাইসের ভেতরের face model দিয়ে আপনার PC-তেই চলে। ছবি আর চেনা লেখা কখনো PC-র বাইরে যায় না।",
    "bg.unavailable": "Background সরাতে AI model ফাইলটা (isnet-general-use.onnx) লাগে, কিন্তু অ্যাপের পাশে পাওয়া যায়নি। ফিরিয়ে আনতে MyPixelGuard আবার install করুন।",
    "bg.err.unsupported": "Background সরাতে AI model ফাইলটা (isnet-general-use.onnx) লাগে, কিন্তু অ্যাপের পাশে পাওয়া যায়নি।",
    "ai.subtitle": "ছবি better করুন, বড় করুন, মূল বিষয় ধরে crop করুন, বা background সরান — সবই আপনার PC-তে।",
    "ai.enhance.hint": "নিজে নিজেই রং, contrast আর exposure ঠিক করে দেয়।",
    "ai.background.hint": "ডিভাইসের ভেতরের AI model দিয়ে foreground আলাদা করে background transparent বানায়।",
    "ai.background.unavailable": "Background সরাতে AI model ফাইল লাগে, কিন্তু পাওয়া যায়নি। বাকি ধাপগুলো ঠিকই চলবে।",
    "ai.local": "এই টুলগুলো আপনার PC-তেই চলে। ছবি কোথাও আপলোড হয় না।",
    "ai.note.backgroundUnavailable": "Model ফাইল না পাওয়ায় background সরানো যায়নি।",
    "format.unavailable": "এই PC-তে চলে না: %@।",
    "err.formatUnavailable": "এই PC %@ ফাইল লিখতে পারে না।",
    "settings.privacy.body": "ছবি শুধু এই PC-তেই খোলা, বদলানো আর Save করা হয়। অ্যাপ কোনো ছবি বা Metadata আপলোড করে না, এমনকি ইন্টারনেটও লাগে না।",
    "inspect.scan.local": "আপনার PC-তেই চলে।",
    "redact.detection.scanning": "আপনার PC-তে খোঁজা হচ্ছে…",
    "consent.yes": "যা যায়: App-এর Version, Windows Version, ভাষা, App কতবার খোলা হয়েছে আর কোন Tool দিয়ে ছবি Save হয়েছে।",
    "feedback.note": "সাথে যায় শুধু App Version, Windows Version আর ভাষা — কোনো ছবি বা ব্যক্তিগত তথ্য না।",
    "settings.usage.note": "App Version, Windows Version, ভাষা, App কতবার খোলা হয়েছে আর কোন Tool দিয়ে ছবি Save হয়েছে। কখনো ছবি, ফাইলের নাম বা Metadata না। Off করলে জমা হওয়া তথ্য মুছে যায়।",
}

# Strings that only exist on Windows (the Swift app hard-codes some of these in English).
EXTRA_EN = {
    "err.corrupt": "The image file looks damaged (%@).",
    "err.gifUnsupported": "GIF files aren’t supported. Convert the image to PNG or JPEG first.",
    "err.selectiveUnsupported": "Removing individual fields isn’t supported for this file type. Use Clean to remove all metadata.",
    "bg.err.model": "The background-removal model could not be loaded: %@",
    "bg.err.runtime": "The AI runtime reported a problem: %@",
    "visual.noOCR": "Text recognition isn’t available on this PC, so only faces were checked.",
    "visual.noFaces": "The face-detection model wasn’t found, so only text was checked.",
    "update.none": "You’re up to date.",
    "settings.os": "Windows",
    "window.title": "MyPixelGuard",
    "selective.note.reencoded": "Saved again without metadata.",
    "action.addFolder": "Add Folder…",
    "err.settings": "These settings couldn’t be read: %@",
    "err.unknownTool": "Unknown tool: %@",
    "err.ocr": "Text recognition failed: %@",
    "bg.model.missing": "AI model file missing",
}
EXTRA_BN = {
    "err.corrupt": "ছবির ফাইলটা নষ্ট মনে হচ্ছে (%@)।",
    "err.gifUnsupported": "GIF ফাইল সাপোর্ট করে না। আগে ছবিটা PNG বা JPEG-তে Convert করুন।",
    "err.selectiveUnsupported": "এই ধরনের ফাইলে আলাদা আলাদা তথ্য মোছা যায় না। সব Metadata মুছতে Clean ব্যবহার করুন।",
    "bg.err.model": "Background সরানোর model লোড করা যায়নি: %@",
    "bg.err.runtime": "AI runtime-এ সমস্যা হয়েছে: %@",
    "visual.noOCR": "এই PC-তে লেখা চেনার সুবিধা নেই, তাই শুধু মুখ খোঁজা হয়েছে।",
    "visual.noFaces": "মুখ চেনার model পাওয়া যায়নি, তাই শুধু লেখা খোঁজা হয়েছে।",
    "update.none": "আপনি সর্বশেষ version-এই আছেন।",
    "settings.os": "Windows",
    "window.title": "MyPixelGuard",
    "selective.note.reencoded": "Metadata ছাড়া আবার Save করা হয়েছে।",
    "action.addFolder": "Folder যোগ করুন…",
    "err.settings": "এই Settings পড়া যায়নি: %@",
    "err.unknownTool": "অজানা টুল: %@",
    "err.ocr": "লেখা চেনা যায়নি: %@",
    "bg.model.missing": "AI model ফাইল পাওয়া যায়নি",
}


def build(name: str, overrides: dict, extra: dict) -> dict:
    table = load(name)
    table.update(overrides)
    table.update(extra)
    return table


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    en = build("Strings_en.swift", OVERRIDES_EN, EXTRA_EN)
    bn = build("Strings_bn.swift", OVERRIDES_BN, EXTRA_BN)
    missing = sorted(set(en) - set(bn))
    extra = sorted(set(bn) - set(en))
    assert not missing and not extra, (missing, extra)
    for code, table in (("en", en), ("bn", bn)):
        (OUT / f"{code}.json").write_text(json.dumps(dict(sorted(table.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(en)} strings x 2 languages to {OUT}")


if __name__ == "__main__":
    main()

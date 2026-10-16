# Publishing to the Mac App Store

## What is already done in this project
- App Sandbox enabled (`Resources/AppStore.entitlements`). The app only touches files you pick or drop, and tested working in the sandbox.
- Privacy manifest (`Resources/PrivacyInfo.xcprivacy`): no tracking, no data collected.
- Export-compliance flag set (`ITSAppUsesNonExemptEncryption = false`), category = Photography.
- App icon (1024 px icns), Info.plist, copyright line.
- `package_appstore.sh` builds, signs and packages the `.pkg` for upload.
- Robustness: parsers fuzz-tested with 60,000 corrupted/truncated files, with no crashes.

## What only you can do (needs your Apple account)
1. **Join the Apple Developer Program**: https://developer.apple.com/programs/ (USD 99 / year).
2. **Verify the MyPixelGuard name is available** in App Store Connect before submitting. The name must be unique on the Mac App Store.
3. **Choose your own Bundle ID**, e.g. `com.yourname.photoscrub` (replace `com.local.metadataremover`).
4. **developer.apple.com → Certificates, IDs & Profiles**
   - Identifiers → register the Bundle ID (platform macOS).
   - Certificates → create **Apple Distribution** and **Mac Installer Distribution** (download and double-click to install in Keychain).
   - Profiles → create a **Mac App Store** provisioning profile for your Bundle ID and download it.
5. **App Store Connect (https://appstoreconnect.apple.com) → My Apps → +  New App**: macOS, your name, the Bundle ID, SKU (any text).
6. **Build the package:**
   ```bash
   cd "/Users/sabbirahmad/Projects/metaData Remover"
   TEAM_ID=ABCDE12345 \
   BUNDLE_ID=com.yourname.photoscrub \
   APP_SIGN_ID="Apple Distribution: Your Name (ABCDE12345)" \
   INSTALLER_SIGN_ID="3rd Party Mac Developer Installer: Your Name (ABCDE12345)" \
   PROFILE=~/Downloads/YourProfile.provisionprofile \
   ./package_appstore.sh
   ```
   (Use `security find-identity -v` to see the exact certificate names.) This creates `build/MyPixelGuard.pkg`.
7. **Upload** the `.pkg` with the free **Transporter** app (Mac App Store), then in App Store Connect pick that build, fill in the listing, and **Submit for Review**.

## Listing text (copy/paste, edit as you like)
**Subtitle:** See and remove hidden photo metadata

**Description:**
Every photo carries hidden data: camera model, date, GPS location, editing software, and, for AI and edited images, Content Credentials (C2PA) and AI-source tags.

MyPixelGuard shows you everything inside a photo, and lets you strip it out in one click.

• See all metadata: EXIF, GPS, IPTC, XMP, C2PA Content Credentials
• Spots AI and provenance tags that social platforms read
• Remove only what you want: C2PA, XMP, IPTC, EXIF, comments
• Lossless for JPEG, PNG and WebP: pixels are never re-compressed
• You choose where each cleaned copy is saved
• Your original is never changed
• 100% offline. Photos never leave your Mac

**Keywords:** metadata,exif,remove,gps,privacy,photo,c2pa,xmp,iptc,cleaner,strip

**Privacy ("App Privacy" questionnaire):** Data Not Collected.
**Privacy Policy URL (required):** host a one-page policy anywhere (GitHub Pages, Notion public page). Suggested text:
> This app works entirely on your Mac. It does not collect, store, transmit or share any personal data or photos. It has no accounts, analytics, advertising or network access.

**Support URL (required):** any page or email contact page you control.
**Age rating:** 4+. **Price:** your choice.

## Screenshots
Mac App Store accepts 1280×800, 1440×900, 2560×1600 or 2880×1800. Use real photos (not the test files), show: the drop screen, a photo with the warning banner, the "Cleaned and saved" result, and the Save dialog. Use `⇧⌘4` then `Space` to capture just the window.

## Review notes to be aware of
- **Describe it as a privacy / metadata tool.** Avoid wording like "bypass", "evade" or "hide AI from Facebook" in the listing. App Review can reject apps that appear to help deceive other platforms, and similar metadata cleaners are already on the store described as privacy tools.
- In the "Notes for the reviewer" box write: *"Drag any JPEG/PNG photo into the window, click Clean & Save, and choose a folder. The app reads/removes embedded metadata locally. No network use."*
- The app's built-in footnote already states it can't remove invisible pixel watermarks, and that platforms may ask for AI disclosure. Keep it.

## Not required but nice
- `UNIVERSAL=1` (needs full Xcode installed) to include Intel Macs. Apple-silicon-only is accepted too.
- Add a "Help" link and a version-history note in the listing.

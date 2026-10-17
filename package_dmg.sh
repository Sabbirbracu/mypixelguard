#!/bin/bash
# Builds the downloadable Mac installer:  releases/MyPixelGuard-mac.dmg
# Universal (Apple Silicon + Intel), ad-hoc signed (no Apple Developer ID), bundle id com.agentiqbd.mypixelguard.
# Works with just the Command Line Tools — no full Xcode needed.
#
# Without an Apple Developer account the app is ad-hoc signed and macOS shows "Apple could not verify…" on first launch.
# With one, it is signed with your Developer ID and notarized by Apple, and that warning disappears:
#   SIGN_ID="Developer ID Application: Your Name (TEAMID)" NOTARY_PROFILE=mypixelguard ./package_dmg.sh
# Set NOTARY_PROFILE up once with:
#   xcrun notarytool store-credentials mypixelguard --apple-id YOU@example.com --team-id TEAMID --password <app-specific-password>
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' Resources/Info.plist)"
APP="build/MyPixelGuard.app"
OUT="releases/MyPixelGuard-mac.dmg"

BUNDLE_ID=com.agentiqbd.mypixelguard ./build_app.sh                       # this Mac's architecture
swift build -c release --triple x86_64-apple-macosx13.0 --build-path .build-x86   # Intel slice
X86="$(swift build -c release --triple x86_64-apple-macosx13.0 --build-path .build-x86 --show-bin-path)/MetaDataRemover"

BIN="$APP/Contents/MacOS/MetaDataRemover"
if [ "$(uname -m)" = "arm64" ]; then lipo -create "$BIN" "$X86" -output "$BIN.universal"
else lipo -create "$X86" "$BIN" -output "$BIN.universal"; fi
mv "$BIN.universal" "$BIN"
if [ -n "${SIGN_ID:-}" ]; then
  # hardened runtime + secure timestamp are what Apple's notarization requires
  codesign --force --deep --options runtime --timestamp --sign "$SIGN_ID" "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"
else
  codesign --force --deep --sign - "$APP"
fi
lipo -archs "$BIN"

# --- disk image with the logo background, volume icon and a drag-to-Applications layout ---
VOL="MyPixelGuard $VERSION"
python3 Scripts/make_dmg_background.py
STAGE="$(mktemp -d)"; RW="$STAGE/rw.dmg"
hdiutil detach "/Volumes/$VOL" >/dev/null 2>&1 || true
hdiutil create -size 60m -fs HFS+ -volname "$VOL" -ov "$RW" >/dev/null
hdiutil attach "$RW" -noverify -noautoopen -nobrowse >/dev/null
MP="/Volumes/$VOL"
cp -R "$APP" "$MP/"
ln -s /Applications "$MP/Applications"
mkdir "$MP/.background"
tiffutil -cathidpicheck Resources/dmg/background.png Resources/dmg/background@2x.png -out "$MP/.background/background.tiff" >/dev/null
osascript <<OSA
tell application "Finder"
  tell disk "$VOL"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {200, 120, 860, 520}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 112
    set text size of opts to 13
    set background picture of opts to file ".background:background.tiff"
    set position of item "MyPixelGuard.app" of container window to {170, 235}
    set position of item "Applications" of container window to {490, 235}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
OSA
# the volume icon goes in last: Finder drops it while it rewrites the window settings
cp "$APP/Contents/Resources/AppIcon.icns" "$MP/.VolumeIcon.icns"
SetFile -a C "$MP"
sync; sleep 2
ls -la "$MP" | grep -i volumeicon || echo "NO VOLUME ICON before detach"; GetFileInfo "$MP" | grep attributes; hdiutil detach "$MP" >/dev/null
mkdir -p releases && rm -f "$OUT"
hdiutil convert "$RW" -format UDZO -imagekey zlib-level=9 -o "$OUT" >/dev/null
rm -rf "$STAGE"
if [ -n "${SIGN_ID:-}" ]; then
  codesign --force --timestamp --sign "$SIGN_ID" "$OUT"
  if [ -n "${NOTARY_PROFILE:-}" ]; then
    echo "Sending to Apple for notarization (usually a few minutes)…"
    xcrun notarytool submit "$OUT" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$OUT"      # attaches Apple's approval so it also works offline
    spctl --assess --type open --context context:primary-signature -v "$OUT" || true
  fi
fi
# the download page shows this fingerprint so people can verify their copy; upload it next to the .dmg
shasum -a 256 "$OUT" | cut -d' ' -f1 > "$OUT.sha256"
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
shasum -a 256 "$OUT"

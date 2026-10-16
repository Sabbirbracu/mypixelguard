#!/bin/bash
# Builds the downloadable Mac installer:  releases/MyPixelGuard-mac.dmg
# Universal (Apple Silicon + Intel), ad-hoc signed (no Apple Developer ID), bundle id com.agentiqbd.mypixelguard.
# Works with just the Command Line Tools — no full Xcode needed.
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
codesign --force --deep --sign - "$APP"
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
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
shasum -a 256 "$OUT"

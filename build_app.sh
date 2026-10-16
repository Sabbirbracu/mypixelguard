#!/bin/bash
# Builds "MyPixelGuard.app" into ./build
#   ./build_app.sh                  normal build for this Mac (ad-hoc signed)
#   SANDBOX=1 ./build_app.sh        same, but signed with the App Sandbox (what the App Store requires)
#   UNIVERSAL=1 ./build_app.sh      Apple Silicon + Intel (needs full Xcode)
#   BUNDLE_ID=com.yourname.app ./build_app.sh   use your own bundle identifier
set -euo pipefail
cd "$(dirname "$0")"

APP="build/MyPixelGuard.app"
BUNDLE_ID="${BUNDLE_ID:-com.local.metadataremover}"
FLAGS=(-c release)
[ "${UNIVERSAL:-0}" = "1" ] && FLAGS+=(--arch arm64 --arch x86_64)

swift build "${FLAGS[@]}"
BIN="$(swift build "${FLAGS[@]}" --show-bin-path)/MetaDataRemover"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/MetaDataRemover"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/PrivacyInfo.xcprivacy "$APP/Contents/Resources/PrivacyInfo.xcprivacy"
# SwiftPM resource bundle (Sora fonts + license).
RESOURCE_BUNDLE="$(dirname "$BIN")/MetaDataRemover_MetaDataRemover.bundle"
cp -R "$RESOURCE_BUNDLE" "$APP/Contents/Resources/"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$APP/Contents/Info.plist"

ICONSET="build/AppIcon.iconset"
swiftc -parse-as-library Sources/MetaDataRemover/BrandArtwork.swift Scripts/make_icon.swift -o build/make-brand-assets
build/make-brand-assets "$ICONSET" Resources/Brand
cp Resources/Brand/MyPixelGuard-* "$APP/Contents/Resources/"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

if [ "${SANDBOX:-0}" = "1" ]; then
    codesign --force --deep --sign - --entitlements Resources/AppStore.entitlements "$APP"
    echo "Built (sandboxed, ad-hoc signed): $APP"
else
    codesign --force --deep --sign - "$APP"
    echo "Built: $APP"
fi

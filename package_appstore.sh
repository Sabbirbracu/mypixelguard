#!/bin/bash
# Creates the signed .pkg you upload to App Store Connect (with the Transporter app).
#
# One-time setup (see APP_STORE_GUIDE.md):
#   1. Apple Developer Program membership
#   2. In developer.apple.com: register your Bundle ID, create a Mac App Store provisioning profile for it
#   3. Install the certificates "Apple Distribution" and "Mac Installer Distribution" in Keychain
#
# Usage:
#   TEAM_ID=ABCDE12345 \
#   BUNDLE_ID=com.yourname.metadataremover \
#   APP_SIGN_ID="Apple Distribution: Your Name (ABCDE12345)" \
#   INSTALLER_SIGN_ID="3rd Party Mac Developer Installer: Your Name (ABCDE12345)" \
#   PROFILE=~/Downloads/MetadataRemover_AppStore.provisionprofile \
#   ./package_appstore.sh
set -euo pipefail
cd "$(dirname "$0")"

: "${TEAM_ID:?Set TEAM_ID}" "${BUNDLE_ID:?Set BUNDLE_ID}" "${APP_SIGN_ID:?Set APP_SIGN_ID}"
: "${INSTALLER_SIGN_ID:?Set INSTALLER_SIGN_ID}" "${PROFILE:?Set PROFILE}"
[ -f "$PROFILE" ] || { echo "Provisioning profile not found: $PROFILE"; exit 1; }

# Universal build when full Xcode is available, otherwise native.
if xcodebuild -version >/dev/null 2>&1; then export UNIVERSAL=1; fi
BUNDLE_ID="$BUNDLE_ID" ./build_app.sh

APP="build/MyPixelGuard.app"
cp "$PROFILE" "$APP/Contents/embedded.provisionprofile"

ENT="build/AppStore.signing.entitlements"
cp Resources/AppStore.entitlements "$ENT"
/usr/libexec/PlistBuddy -c "Add :com.apple.application-identifier string $TEAM_ID.$BUNDLE_ID" "$ENT"
/usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string $TEAM_ID" "$ENT"

codesign --force --deep --options runtime --timestamp --sign "$APP_SIGN_ID" --entitlements "$ENT" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

productbuild --component "$APP" /Applications --sign "$INSTALLER_SIGN_ID" "build/MyPixelGuard.pkg"
echo
echo "Done: build/MyPixelGuard.pkg  → open the Transporter app and upload it."

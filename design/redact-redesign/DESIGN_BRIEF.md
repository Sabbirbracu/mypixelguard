# Redact workspace redesign — v1

Generated using built-in Imagegen. Visual concept only; no application code was changed.

Output: `redact-workspace-v1.png`.

## Inputs inspected

- Approved `design/inspect-redesign/inspect-overview-v2.png` shell and branding.
- User Desktop screenshots at 5.06.55 PM and 5.07.02 PM showing the current Redact layout.
- `Sources/MetaDataRemover/RedactView.swift` and Redact strings: on-device scanning, manual rectangles, included/skipped regions, Blur/Pixelate/Solid, conditional strength slider, metadata cleaning, advanced export settings and export-copy action.
- Existing `landing-react/src/assets/img/card-before.webp` fictional sample document.

## Structure

A persistent large editing canvas sits beside one compact settings inspector. No large page heading/subtitle, tutorial cards or page-length layout. File navigation and footer match the approved Inspect redesign. Region IDs correspond to image overlays; inclusion checkboxes are separate from the focused-region highlight. Export remains visible while the preview and settings are adjusted.

The screenshot shows four included sample regions and Solid style. The uncovered sample name is intentionally retained: masking selected fields must not imply that every identifying detail has been removed.

## Interaction specification / implementation work still required

- Selecting a region row should focus/locate its matching overlay; toggling its checkbox controls inclusion. Focus is not an inclusion toggle.
- Zoom, fit, explicit draw mode, overlay visibility and focus synchronization are proposed interaction improvements, not claims of existing functionality.
- The generated concept displays delete icons on all regions. Current implementation only deletes manual regions individually. Either deliberately add detected-region deletion with recovery or restrict delete to manual regions; never silently alter this behavior.
- Solid hides the strength slider. Blur/Pixelate reveal it in the same rail with a text-sensitive review note. This screenshot does not show those alternate states.
- Region list scrolls internally when long. Keep style and export actions visible; compact windows / large accessibility text may need a collapsible inspector or independent inspector scrolling.
- Original / redacted preview switching must not change region inclusion. Disable export for zero included regions or an unfinished render.
- More export options opens format, quality and filename suffix without covering the canvas. Current app offers these options.
- Scanning may miss regions; expose scan progress, errors and no-results states. Rescanning should preserve or confirm replacement of manual edits.
- Fit and numeric zoom should be mutually consistent, calculated from actual image pixels. The sample composition and zoom value in this generated image are illustrative, not implementation geometry.
- Export a new copy, preserve originals and announce destination/result. Do not claim the document is safe merely because selected regions are covered.

## Final Imagegen prompt

Use case: ui-mockup.
Produce ONE polished high-fidelity production-ready desktop UI redesign image of the MyPixelGuard REDACT tool. Full straight-on app screenshot, landscape 16:10, crisp readable typography, no device frame or mockup scene.
INPUT ROLES: Image 1 is the APPROVED DESIGN SYSTEM reference (Inspect v2): match its navy/orange colors, grouped sidebar, compact file toolbar, fonts, spacing, borders and persistent bottom footer. Image 2 is the EXISTING REDACT FEATURES reference only, not its vertically scrolling layout. Image 3 is the sample document to show in the editing canvas. Use this fictional membership card instead of the marketing image. Do not recreate the existing tall title and step cards.
PRIMARY UX: Canvas-first professional image editor. The preview and ALL essential editing controls must remain visible together. No whole-page scrolling. No large 'Redact' heading, no subtitle, no hero, no numbered tutorial sections. Redact is identified by the selected sidebar item. Purposeful compact toolbar immediately beneath the file toolbar.
VISUALS: Deep navy #0B111B canvas, #111A28 panels, #283446 hairline separators, #FF8500 restrained accent, white text and readable cool gray secondary text. SF Pro/Inter, 8px rhythm, slim consistent outline icons, 8–12px radii. Calm mature enterprise desktop tool, not flashy art. No gradients, glass, decorative glows, charts, invented risk score or statistics.
SHELL: retain Image 1's 230–260px left sidebar proportional to a roughly 1600px wide app. MyPixelGuard shield and wordmark top. PRIVACY group Inspect, Clean, REDACT selected with orange left indicator and subtle brown highlight; IMAGE TOOLS Convert, Resize, Compress, Remove Background; WORKSPACE Batch Studio, AI Tools. Bottom green shield 'Processed locally', Settings.
GLOBAL TOP FILE BAR: thumbnail and 'membership-card.png' once, tiny '1 of 1', previous/next arrows, '+ Add images', overflow. Do not duplicate file summary.
MAIN AREA is wide canvas + right settings inspector, roughly 72% / 28% of available workspace width, separated by a straight thin vertical divider. The RIGHT INSPECTOR is approximately 340px wide at 1600px canvas width, full height until pinned footer. Do not distribute editing controls below the image.

CANVAS TOOLBAR: a compact 52–56px row. Left grouped buttons 'Original' and 'Redacted preview', with Redacted preview selected. Right outlined 'Draw area' with dashed rectangle icon, then small overlays icon. No undo/history features invented. A subtle small green dot with 'Preview up to date' may sit at far right inside canvas bottom status.
LARGE CENTRAL CANVAS: use the sample membership card from Image 3 with appropriate generous dark margins. Preserve its whole image aspect ratio and entire card. The white card on pale blue background has navy 'SAMPLE MEMBERSHIP CARD' header, 'Alex Morgan' name. This is REDACTED preview with FOUR completely opaque dark rectangular covers over the four complete email, phone, address and Member ID lines respectively. Do not leave any characters visible underneath or around the four covers. The name stays visible intentionally. Cover lengths match original field lengths. Each mask has one small numbered badge 1,2,3,4 at its upper-left. The email mask #1 is focused: show a thin orange outline around it. Other masks are dark opaque with understated outlines, not busy neon rectangles. No blurred text when Solid is selected. A small discreet 'SAMPLE' badge near the preview identifies demonstration content. Canvas must feel large enough to work precisely, not a tiny card inside nested boxes.
CANVAS BOTTOM TOOL STRIP: small instruction 'Draw to add an area. Select a region to review it.' Left; right compact 'Fit' dropdown and zoom minus / '75%' / plus. No big note card.

RIGHT INSPECTOR, clean flat sections with separators, very little nested-card chrome:
TOP section at same vertical level as canvas toolbar: small title 'Detection'; secondary outlined 'Rescan' with viewfinder icon. Below tiny 'Faces & sensitive text · On-device'. These are compact, not another large scan banner.
REGIONS section: heading 'Marked regions' and subtle '4', small '4 of 4 included'. Small text actions 'Select all' and 'Skip all' with overflow menu for clear. Four compact 52–58px rows, checked checkboxes at left:
'1  Email' secondary 'Detected'
'2  Phone number' secondary 'Detected'
'3  Address' secondary 'Detected'
'4  Member ID' secondary 'Drawn manually' and small trash icon.
No raw personal information repeated in region list. Row 1 is focused with a subtle orange-tinted background, matches canvas mask #1. Distinguish focus highlight from the checked included state. Every row remains checked.
STYLE section: small heading 'Redaction style'; compact three-segment control 'Blur' | 'Pixelate' | 'Solid', Solid selected with subtle orange treatment. Below concise note 'Opaque cover for sensitive text.' NO strength slider for Solid, because that would be misleading. Strength control belongs to Blur/Pixelate states and is not visible in this screenshot. One very small caption 'Applies to all included regions.'
EXPORT SETTINGS section: 'Remove metadata' with orange ON toggle. Secondary caption 'Clean hidden data from the exported copy.' Below collapsed chevron 'More export options'. Do not repeat export primary action here.
At base of settings rail, small low-emphasis caution 'Detection may miss information. Review the full image.' Do not claim 'Safe' or 'Fully protected'. All right-rail content fits within viewport.

PINNED FOOTER across whole main workspace (not sidebar): left lock icon 'Original stays untouched'; near middle '4 regions · Solid cover'; right one solid-orange primary button 'Export Redacted Copy…' with export icon. Destination chooser is implied by ellipsis. Footer always visible, no overlapping canvas. The only large solid orange control should be export. Use compact UI not giant buttons.
Everything neatly aligned and legible. Keep the approved brand, nav names and overall shell. This is a real workflow mockup demonstrating review and manual redaction, not a slideshow dashboard. Render only the finished full desktop app design image.


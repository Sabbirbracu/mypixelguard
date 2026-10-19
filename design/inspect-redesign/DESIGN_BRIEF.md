# Inspect tab — redesign concept v1

Mode: built-in Imagegen, using the two supplied screenshots as content and brand references. No app code changed.

Image: `inspect-overview-v1.png`

## Design decisions

- One viewport overview: image and technical properties on the left; privacy findings and scan states on the right.
- Author and editing-software identifiers are review items, not proof of danger. Long raw strings are behind row details / All metadata.
- Persistent Review in Clean action opens cleaning choices rather than immediately deleting metadata.
- Scan not run is explicitly different from no provenance markers found. Neither guarantees safe sharing.
- Grouped navigation and a compact local-processing indicator reduce sidebar noise.

## Implementation considerations

This is a visual concept, not an implemented screen. Validate real data states and keyboard/VoiceOver behavior before shipping. A smaller window should collapse the preview or move technical properties into a drawer; large-text modes may require internal scrolling. Fit should be an alternative to numeric zoom, not show an assumed actual 100% scale. Preserve the actual source image when implementing rather than the generated banner approximation. Provenance status should use a neutral icon/treatment in production to avoid implying a safety verdict. Link colors should use the existing accessible brand token consistently.

## Final generation prompt

Use case: ui-mockup.
Create ONE extremely polished, production-realistic high-fidelity redesign screenshot of the MyPixelGuard desktop application's INSPECT tab. This is a serious usable desktop interface, NOT marketing artwork or a dashboard poster. Flat straight-on full application window, landscape 16:10, ideally 2880x1800, razor-sharp legible typography. No device frame, no perspective, no external annotations.
Input images 1 and 2 are CONTENT AND BRAND REFERENCES of the same current application at different scroll positions. Redesign the information architecture radically while retaining the navy/orange brand, existing tool names and the current file's actual content. Do NOT copy the oversized vertically stacked cards or current layout. Everything important must fit within ONE desktop viewport; no full-page vertical scrollbar.

VISUAL SYSTEM:
Dark neutral navy workspace #0B111B, slightly lighter sidebar and panels #111A28, subtly elevated surface #162131, hairline separators #283446. Restrained brand orange #FF8500 for selected nav and one primary action; white headings and cool gray secondary text. Accessible contrast. Precise consistent thin outline icons, compact 10-12 px corners, no glows, no gradients, no giant rounded empty cards. SF Pro / Inter typography, beautifully aligned 8 px spacing system. Hierarchy and calm density comparable to a mature professional macOS creative tool. The screenshot should feel implementable today, not fanciful.

LAYOUT (coordinates conceptual based on a 1600x1000 window):
1. LEFT SIDEBAR ~210 px wide, full height. Top original orange shield mark and MyPixelGuard wordmark. Three small quiet navigation headings: PRIVACY with Inspect (selected subtle orange background and thin orange left indicator), Clean, Redact; IMAGE TOOLS with Convert, Resize, Compress, Remove Background; WORKSPACE with Batch Studio, AI Tools. Consistent compact nav rows, icons not in large circles. Bottom Settings and a simple small green shield 'Processed locally' status, NOT a large explanatory card.
2. GLOBAL TOOLBAR ~64 px high to right of sidebar. Small thumbnail then '1.png' filename, subtle '1 of 1', previous/next icon buttons. Far right secondary '+ Add images', overflow menu. Filename appears here only, do not duplicate huge file summary blocks.
3. CONTENT HEADER at x242,y96: large 'Inspect', concise gray 'Understand what your image reveals.' Right modest amber status pill '2 items to review'. Below, left-aligned tabs 'Overview' (selected with orange underline), 'All metadata' (inactive). No giant warning banner.
4. MAIN WORKSPACE below tabs, two balanced columns with 24 px gutter. Left ~460 px wide, right ~820 px wide. Fixed, aligned panel edges.
LEFT COLUMN: 'Image preview' with a small expand icon. A comfortable dark preview canvas displays the current ultra-wide green/white SaaS banner from the reference image, centered, its original 4950:1238 aspect preserved, never stretched into a portrait image. You can simplify the tiny banner artwork but keep it visibly matching the provided thumbnail, not replace it with a mountain photo. Canvas footer has 'Fit' and minus/100%/plus zoom controls. Below the preview, clean borderless 2-column technical details: 'Format' 'PNG'; 'Dimensions' '4950 × 1238 px'; 'File size' '1.1 MB'; 'Orientation' '1'. Small text link 'Show in Finder ↗'. A compact single-line strip 'Embedded metadata' then 'XMP  2 KB' and 'EXIF  192 bytes'. Technical facts belong here, not among privacy warnings.
RIGHT COLUMN: Primary panel 'Privacy findings' with a small count '2'. Supporting single line 'Identifying information found in this file.' Two compact, evenly sized horizontal rows, NOT multiple oversized nested tiles:
row 1 small orange user icon, label 'Author / owner', prominent value 'Sabbir', quiet 'EXIF · IPTC · XMP', right chevron for details.
row 2 small orange app icon, label 'Editing software', prominent value 'Canva', quiet 'Document and template identifiers', right chevron. Long raw Canva strings are NOT exposed in overview, they belong behind the chevron.
Below rows a very subtle small note 'Review these details before sharing.' This is not a dangerous red alert.
Below this panel, TWO equally sized compact side-by-side modules:
A: 'Visible privacy scan', neutral badge 'Not scanned', one sentence 'Check for faces and sensitive text.', secondary outlined 'Scan on this Mac' button, small local-processing icon.
B: 'AI & provenance', neutral check indicator 'No markers found', small sentence 'Metadata evidence, not an AI verdict.', subtle link 'View details →'. Do not use a green 'Safe' claim, do not claim the image is human-made.
Place a subtle info line below these modules: 'Inspection can reduce privacy risk; it cannot guarantee safe sharing.' Keep this tertiary, not a paragraph wall.
5. A slim persistent ACTION FOOTER across main workspace near bottom: left small lock icon and 'Original file stays untouched'. Right text 'Next: choose what to remove' and single solid orange primary button 'Review in Clean →'. This navigates to cleaning options, no immediate deletion, no fake automatic cleaning or numeric safety score.
Be generous with breathing room but not wasteful. All footer and module content fully inside the visible viewport. No oversized hero heading, no repeated warnings, no redundant file cards, no random statistics/charts, no fake percentage scores, no long prose, no decorative background. Preserve spelling of MyPixelGuard. The result must clearly solve scanning and hierarchy, with preview on left, actionable privacy findings on right, technical information separate and raw detail progressively disclosed. Render one complete desktop UI image only.


# Play Store assets

| File | Size | Notes |
| --- | --- | --- |
| icon-512.png | 512x512, 32-bit RGBA, ~200 KB | Resized from apps/mobile/src/assets/images/icon.png (square, no baked corners) |
| feature-graphic.png | 1024x500, 24-bit RGB, no alpha | Real Clovie art plus "Your business, managed by Clovie." on a pale blue gradient; content inside central 924x400 |

Sources and render helper are in `src/` (feature.html, icon.html, finish.js).
| screenshot-1..4.png | 1080x1920, 24-bit RGB, no alpha, ~0.7 MB each | Real captures in a Pixel-style frame on a pale blue gradient, blue caption. 1 home, 2 calendar week, 3 booking detail, 4 client profile |

Render: src/shot.html?i=RAW_FILE&t=CAPTION via headless Chrome, then node src/finish.js IN OUT flat.
Captures were edited for privacy and US audience (src/patch.js): names, phone, amounts replaced with fake US data (Colin, Jake Miller, +1 555 010 0142, dollars) in Roboto; the bottom 70px (system home indicator) is cropped out.

## Skipped
- Settings, New booking, voice overlay, approval card screenshots (no usable captures yet).
- promo-video.mp4 (no screen recording).

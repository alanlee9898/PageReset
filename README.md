# PageReset

**Make any webpage usable again.**

PageReset is a Safari Web Extension for macOS that restores text selection, removes distracting overlays, and copies cleanly (plain text, Markdown, CSV tables, links). One-time purchase. No account. All processing local.

## Requirements

- macOS 13+
- Safari 15.4+
- Xcode 15+ (to build)

## Project layout

```
PageReset/
  PageReset.xcodeproj          # Open this in Xcode
  PageReset/                   # Host app (onboarding)
  PageReset Extension/         # Safari Web Extension resources
AppStore/                      # Listing + ship checklist
docs/                          # Privacy policy + test page
```

## Build & run

1. Open `PageReset/PageReset.xcodeproj` in Xcode.
2. Select the **PageReset** scheme → My Mac.
3. Set your Development Team under Signing & Capabilities for both targets.
4. Run (⌘R).
5. In the app, open Safari Settings and **enable the PageReset extension**.
6. Grant website access, then try `docs/test-hostile-page.html` via a local server or file URL (Safari may restrict `file://` — prefer a local HTTP server).

```bash
cd docs && python3 -m http.server 8765
# Open http://127.0.0.1:8765/test-hostile-page.html in Safari
```

## Features

| Feature | Notes |
| --- | --- |
| Restore selection | CSS + event unblock |
| Restore right-click | Context menu restore |
| Remove overlays | Heuristic + zap mode |
| Copy plain / Markdown / CSV / links | Toolbar, context menu, shortcuts |
| Per-site rules | Stored in `browser.storage.local` |

**Not included:** paywall/DRM bypass, ad-blocking suite, accounts, network sync.

## Bundle IDs

- App: `com.alanlee.pagereset`
- Extension: `com.alanlee.pagereset.Extension`

## Privacy

See [docs/privacy.html](docs/privacy.html). PageReset does not collect personal data.

## License

Copyright © 2026 Alan Lee. All rights reserved.

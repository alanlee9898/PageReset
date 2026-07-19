# PageReset Ship Checklist

## Pre-submit
- [ ] Apple Developer Program membership active ($99/yr)
- [ ] Bundle ID `com.alanlee.pagereset` registered
- [x] Privacy policy published (GitHub Pages → `docs/privacy.html`)
- [x] Support page published (GitHub Pages → `docs/support.html`)
- [x] Development Team set (`52DU553ND4`)
- [x] Release archive created locally (`build/PageReset.xcarchive`)
- [ ] Support email monitored (`pagereset@alanlee.dev` or update listing)
- [ ] App icons verified at all sizes
- [ ] Extension enables in Safari Settings on a clean Mac user account
- [ ] Manual test matrix completed (see below)

## Test matrix
| Site type | Checks |
| --- | --- |
| News / blog with copy-blocking JS | Selection + right-click restore |
| Cookie / newsletter overlay sites | Remove overlays; scroll unlock |
| Docs / MDN-style pages | Markdown copy quality |
| Pages with HTML tables | CSV extract |
| Link-heavy directory page | Copy all links |
| Site with paywall / login gate | Confirm we do **not** unlock paid content |

## Build & archive
```bash
cd PageReset
xcodebuild -scheme PageReset -configuration Release \
  -destination 'platform=macOS' \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  build
```
Then in Xcode: Product → Archive → Distribute App → App Store Connect.

## TestFlight
1. Upload build via Organizer  
2. Internal testers first (enable extension steps in notes)  
3. Soft-validate in r/macapps / Mac Power Users before public release  

## Pricing
- Launch: **$4.99** one-time  
- Raise to **$7.99** after initial reviews  

## Post-launch
- [ ] Monitor crash reports  
- [ ] Collect site-specific overlay false positives  
- [ ] Consider iOS/iPadOS Safari extension share later  

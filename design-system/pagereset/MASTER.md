# PageReset Design System

Native macOS Safari utility — not a marketing site, not “AI product” chrome.

## Product
Safari Web Extension + minimal host app. One-time purchase, local-only.

## Visual direction
- **Look like Settings / Safari popover**, not a landing page
- Flat surfaces, hairline separators, SF system type
- One restrained accent used sparingly (hostname, switches, one primary action)
- No glassmorphism, glow blobs, radial washes, uppercase trust strips, emoji, or dual neon CTAs

## Color tokens
| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#F2F2F7` (system grouped) | `#1C1C1E` |
| `--surface` | `#FFFFFF` | `#2C2C2E` |
| `--fg` | `#1C1C1E` | `#F5F5F7` |
| `--muted` | `#6C6C70` | `#98989D` |
| `--border` | `rgba(60,60,67,0.12)` | `rgba(84,84,88,0.48)` |
| `--accent` | `#007AFF` (system blue) | `#0A84FF` |
| `--accent-fg` | `#FFFFFF` | `#FFFFFF` |
| `--danger` | `#FF3B30` | `#FF453A` |

## Typography
- System only: `-apple-system, BlinkMacSystemFont, "SF Pro Text"`
- Host title: 22–24px semibold, tight tracking
- Popup body: 13px; captions 11px; section labels 11px medium (not all-caps)

## Components
- **Host:** icon → name → one line → status → one CTA → quiet footer
- **Popup actions:** list rows (menu style), not a marketing button grid; one filled accent for primary
- **Toggles:** native checkbox accent; 44px row height
- **Scope:** segmented control
- **Motion:** 120–180ms opacity/scale; honor `prefers-reduced-motion`

## Anti-patterns (reject)
Inter/Roboto, purple gradients, cream+terracotta, glow, frosted glass headers, pill clusters, checkmark feature lists, uppercase micro-labels with wide tracking

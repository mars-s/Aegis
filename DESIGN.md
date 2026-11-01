---
name: Aegis
description: A calm canvas, with the precision of an instrument and the restraint of Apple.
colors:
  primary: "#1c64f2"
  primary-dark: "#6c9bff"
  canvas: "#f7f7f7"
  canvas-dark: "#141414"
  surface: "#ffffff"
  surface-dark: "#1c1c1c"
  ink: "#0f0f0f"
  ink-dark: "#f2f2f2"
rounded:
  sm: "4px"
  md: "8px"
  node: "10px"
  lg: "12px"
  xl: "16px"
  full: "999px"
spacing:
  unit: "4px"
  compact: "8px"
  block: "16px"
  panel: "24px"
  section: "32px"
typography:
  caption:
    fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  reading:
    fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "24px"
  subtitle:
    fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  headline:
    fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif'
    fontSize: "26px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.02em"
  overview-figure:
    fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif'
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  title:
    fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif'
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.02em"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "36px"
---

# Design System: Aegis

## Overview

**Creative North Star: Jarvis's table, built by Apple.**

Avi's direction, confirmed 1 November 2026: Bauhaus geometry and alignment, Apple's quiet chrome, and an intelligent HUD presence. The canvas gives the work room. Typography, spacing and a few precise marks establish hierarchy. Controls have familiar behaviour, clear labels and visible keyboard focus.

Light is the base design. Follow `prefers-color-scheme` with Settings > General > Theme as an explicit override. Both themes ship across the canvas, cards, editors, dialogs, charts and sandboxed HTML. Saved appearance colours and authored board backgrounds remain supported. Earlier Zen dark comps are historical references, not the sole product appearance.

The normative source is [app/src/styles/tokens.css](app/src/styles/tokens.css). Change that file first and update the table and canonical block below in the same change. Compatibility aliases serve existing components; new UI uses the semantic names. The YAML is a portable light-theme preview, not a second theme implementation.

References, credited by name and supplied source:

- **Avi's Page design system**, derived from Grok Bot Pages, supplied by Avi: [avi-reference.md](../aegis-design-refs/avi-reference.md). Primary source for colour roles, type, spacing, radii, hairlines and motion. App reading and chrome sizes adapt its report scale; faint text is strengthened for AA contrast.
- **Cursor design analysis**: [VoltAgent Cursor DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/cursor/DESIGN.md). Borrow generous space, hairlines and restrained chrome.
- **xAI design analysis**: [VoltAgent xAI DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/x.ai/DESIGN.md), also [getdesign.md](https://getdesign.md/x.ai/design-md). Borrow monochrome discipline and quiet instrument labels.
- **Grok product tokens**, public preview: [designmd.co](https://www.designmd.co/d/grok-com). Borrow system type and monochrome hierarchy.
- **Apple design analysis**: [VoltAgent Apple DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/apple/DESIGN.md). Borrow system type, one action blue and chrome that recedes.

Third-party references are independent analyses, not official brand systems. Do not copy brand palettes or licensed fonts. The installed Taste skills and Impeccable inform precision and review; this owner's brief overrides their conflicting stock presets.

## Colors

Greyscale ink at four strengths, one blue for focus, selection and primary action. Green, amber and red only communicate status, with a word every time. Provider identity stays neutral. Use `--success-deep`, `--warning-deep` and `--danger-deep` for status text on the matching soft fill.

`--bg` is the canvas; `--surface` is a card or editor; `--surface-overlay` is a menu or dialog. `--ink` is full ink; `--text-1` is primary copy, `--text-2` secondary copy, `--text-3` tertiary labels. These stronger adaptations of Page's translucent text keep small text readable. Borders express structure, never disabled text. Controls and focus must remain identifiable without colour alone.

Charts lead with the same blue. Other series use neutral and desaturated blue steps, with labels, line styles or point shapes to distinguish them. No rainbow palette. Grid and axis roles are `--chart-grid` and `--chart-axis`. Use tabular numerals and preserve units. Authored media and document content may retain deliberate colours; app chrome may not invent new ones.

### Full token table

All properties, including compatibility aliases, are listed. An unchanged dark value means the same expression, evaluated against dark semantic tokens. `color-scheme` is `light` or `dark` to match the chosen theme.

| CSS custom property | Light | Dark |
| --- | --- | --- |
| `--bg` | `#f7f7f7` | `#141414` |
| `--surface` | `#ffffff` | `#1c1c1c` |
| `--surface-overlay` | `#ffffff` | `#242424` |
| `--ink` | `#0f0f0f` | `#f2f2f2` |
| `--text-1` | `rgb(15 15 15 / .94)` | `rgb(242 242 242 / .94)` |
| `--text-2` | `rgb(15 15 15 / .72)` | `rgb(242 242 242 / .78)` |
| `--text-3` | `rgb(15 15 15 / .64)` | `rgb(242 242 242 / .70)` |
| `--border-subtle` | `rgb(15 15 15 / .06)` | `rgb(242 242 242 / .07)` |
| `--border-weak` | `rgb(15 15 15 / .10)` | `rgb(242 242 242 / .12)` |
| `--border-default` | `rgb(15 15 15 / .15)` | `rgb(242 242 242 / .17)` |
| `--border-strong` | `rgb(15 15 15 / .30)` | `rgb(242 242 242 / .32)` |
| `--fill-secondary` | `rgb(15 15 15 / .06)` | `rgb(242 242 242 / .10)` |
| `--fill-hover` | `rgb(15 15 15 / .05)` | `rgb(242 242 242 / .08)` |
| `--fill-active` | `rgb(15 15 15 / .09)` | `rgb(242 242 242 / .13)` |
| `--accent` | `#1c64f2` | `#6c9bff` |
| `--accent-deep` | `#0b3a99` | `#b9cfff` |
| `--accent-sub` | `rgb(28 100 242 / .09)` | `rgb(108 155 255 / .17)` |
| `--on-accent` | `#ffffff` | `#141414` |
| `--success` | `#13834a` | `#3fbf7a` |
| `--success-deep` | `#0d6a3b` | `#9fe3bd` |
| `--success-sub` | `rgb(19 131 74 / .10)` | `rgb(63 191 122 / .16)` |
| `--warning` | `#a36200` | `#e0a530` |
| `--warning-deep` | `#824e00` | `#f3d08a` |
| `--warning-sub` | `rgb(163 98 0 / .10)` | `rgb(224 165 48 / .16)` |
| `--danger` | `#d42a2a` | `#ff6b6b` |
| `--danger-deep` | `#b21f1f` | `#ffb8b8` |
| `--danger-sub` | `rgb(212 42 42 / .10)` | `rgb(255 107 107 / .16)` |
| `--chart-1` | `var(--accent)` | `var(--accent)` |
| `--chart-2` | `#555555` | `#cccccc` |
| `--chart-3` | `#54769e` | `#94b8e0` |
| `--chart-4` | `#757575` | `#a6a6a6` |
| `--chart-5` | `#354f70` | `#b5ccec` |
| `--chart-6` | `#676767` | `#bababa` |
| `--chart-7` | `#416082` | `#83a4cf` |
| `--chart-8` | `#454545` | `#dedede` |
| `--glass-bg` | `rgb(255 255 255 / .88)` | `rgb(36 36 36 / .90)` |
| `--glass-border` | `rgb(15 15 15 / .12)` | `rgb(242 242 242 / .17)` |
| `--glass-highlight` | `rgb(255 255 255 / .90)` | `rgb(242 242 242 / .08)` |
| `--shadow-pop` | `0 4px 16px rgb(15 15 15 / .08)` | `0 8px 24px rgb(0 0 0 / .30)` |
| `--shadow-dialog` | `0 16px 48px rgb(15 15 15 / .14)` | `0 16px 48px rgb(0 0 0 / .45)` |
| `--backdrop` | `rgb(15 15 15 / .32)` | `rgb(0 0 0 / .60)` |
| `--dot` | `rgb(15 15 15 / .18)` | `rgb(242 242 242 / .20)` |
| `--paper-light` | `#ffffff` | `#ffffff` |
| `--paper-ink-light` | `#1d1d1d` | `#1d1d1d` |
| `--paper-muted-light` | `#555555` | `#555555` |
| `--paper-dark` | `#1c1c1c` | `#1c1c1c` |
| `--paper-ink-dark` | `#e4e4e4` | `#e4e4e4` |
| `--paper-muted-dark` | `#b9b9b9` | `#b9b9b9` |
| `--font-sans` | `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif` | `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif` |
| `--font-display` | `-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif` | `-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| `--text-caption` | `12px` | `12px` |
| `--text-label` | `12px` | `12px` |
| `--text-body` | `13px` | `13px` |
| `--text-reading` | `14px` | `14px` |
| `--text-subtitle` | `16px` | `16px` |
| `--text-title` | `22px` | `22px` |
| `--text-headline` | `26px` | `26px` |
| `--text-overview-label` | `22px` | `22px` |
| `--text-overview-figure` | `40px` | `40px` |
| `--leading-caption` | `16px` | `16px` |
| `--leading-body` | `20px` | `20px` |
| `--leading-reading` | `24px` | `24px` |
| `--leading-title` | `28px` | `28px` |
| `--leading-headline` | `32px` | `32px` |
| `--weight-regular` | `400` | `400` |
| `--weight-medium` | `500` | `500` |
| `--weight-semibold` | `600` | `600` |
| `--tracking-heading` | `-.02em` | `-.02em` |
| `--tracking-label` | `.08em` | `.08em` |
| `--space-0-5` | `2px` | `2px` |
| `--space-1` | `4px` | `4px` |
| `--space-2` | `8px` | `8px` |
| `--space-3` | `12px` | `12px` |
| `--space-4` | `16px` | `16px` |
| `--space-5` | `20px` | `20px` |
| `--space-6` | `24px` | `24px` |
| `--space-8` | `32px` | `32px` |
| `--space-10` | `40px` | `40px` |
| `--space-12` | `48px` | `48px` |
| `--space-16` | `64px` | `64px` |
| `--space-24` | `96px` | `96px` |
| `--radius-sm` | `4px` | `4px` |
| `--radius-md` | `8px` | `8px` |
| `--radius-node` | `10px` | `10px` |
| `--radius-lg` | `12px` | `12px` |
| `--radius-xl` | `16px` | `16px` |
| `--radius-full` | `999px` | `999px` |
| `--border-width` | `1px` | `1px` |
| `--border-width-hair` | `.5px` | `.5px` |
| `--control-height` | `36px` | `36px` |
| `--control-touch` | `44px` | `44px` |
| `--menu-row-height` | `36px` | `36px` |
| `--setting-row-height` | `44px` | `44px` |
| `--menu-padding` | `4px` | `4px` |
| `--menu-width` | `220px` | `220px` |
| `--menu-gap` | `8px` | `8px` |
| `--glass-blur` | `20px` | `20px` |
| `--glass-shadow` | `inset 0 1px 0 var(--glass-highlight), var(--shadow-pop)` | `inset 0 1px 0 var(--glass-highlight), var(--shadow-pop)` |
| `--motion-instant` | `0ms` | `0ms` |
| `--motion-fast` | `120ms` | `120ms` |
| `--motion-base` | `180ms` | `180ms` |
| `--motion-slow` | `240ms` | `240ms` |
| `--motion-page` | `var(--motion-slow)` | `var(--motion-slow)` |
| `--motion-menu` | `var(--motion-fast)` | `var(--motion-fast)` |
| `--motion-dialog` | `var(--motion-base)` | `var(--motion-base)` |
| `--ease-out` | `cubic-bezier(.2, 0, 0, 1)` | `cubic-bezier(.2, 0, 0, 1)` |
| `--ease-drawer` | `var(--ease-out)` | `var(--ease-out)` |
| `--ease-in-out` | `var(--ease-out)` | `var(--ease-out)` |
| `--ease-smooth` | `var(--ease-out)` | `var(--ease-out)` |
| `--ease-emphasized` | `var(--ease-out)` | `var(--ease-out)` |
| `--border` | `var(--border-default)` | `var(--border-default)` |
| `--info` | `var(--accent)` | `var(--accent)` |
| `--info-deep` | `var(--accent-deep)` | `var(--accent-deep)` |
| `--info-sub` | `var(--accent-sub)` | `var(--accent-sub)` |
| `--chart-grid` | `var(--border-weak)` | `var(--border-weak)` |
| `--chart-axis` | `var(--border-strong)` | `var(--border-strong)` |
| `--font` | `var(--font-sans)` | `var(--font-sans)` |
| `--mono` | `var(--font-mono)` | `var(--font-mono)` |
| `--canvas` | `var(--bg)` | `var(--bg)` |
| `--card` | `var(--surface)` | `var(--surface)` |
| `--raised` | `var(--surface-overlay)` | `var(--surface-overlay)` |
| `--pill` | `var(--surface)` | `var(--surface)` |
| `--strip` | `color-mix(in srgb, var(--surface) 96%, var(--ink))` | `color-mix(in srgb, var(--surface) 96%, var(--ink))` |
| `--inset` | `color-mix(in srgb, var(--surface) 94%, var(--ink))` | `color-mix(in srgb, var(--surface) 94%, var(--ink))` |
| `--text` | `var(--text-1)` | `var(--text-1)` |
| `--ink-2` | `var(--text-2)` | `var(--text-2)` |
| `--muted` | `var(--text-2)` | `var(--text-2)` |
| `--faint` | `var(--text-3)` | `var(--text-3)` |
| `--line` | `var(--border-weak)` | `var(--border-weak)` |
| `--line-strong` | `var(--border-default)` | `var(--border-default)` |
| `--edge-top` | `var(--glass-highlight)` | `var(--glass-highlight)` |
| `--hover` | `var(--fill-hover)` | `var(--fill-hover)` |
| `--press` | `var(--fill-active)` | `var(--fill-active)` |
| `--focus` | `var(--accent)` | `var(--accent)` |
| `--data` | `var(--accent)` | `var(--accent)` |
| `--data-soft` | `var(--accent-sub)` | `var(--accent-sub)` |
| `--warn` | `var(--warning)` | `var(--warning)` |
| `--ok` | `var(--success)` | `var(--success)` |
| `--color-text` | `var(--text-1)` | `var(--text-1)` |
| `--color-muted` | `var(--text-2)` | `var(--text-2)` |
| `--color-faint` | `var(--text-3)` | `var(--text-3)` |
| `--color-label-secondary` | `var(--text-2)` | `var(--text-2)` |
| `--color-lit` | `var(--ink)` | `var(--ink)` |
| `--color-surface` | `var(--surface)` | `var(--surface)` |
| `--color-float` | `var(--surface-overlay)` | `var(--surface-overlay)` |
| `--color-fill` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--color-fill-hover` | `var(--fill-hover)` | `var(--fill-hover)` |
| `--color-border` | `var(--border-weak)` | `var(--border-weak)` |
| `--color-border-strong` | `var(--border-default)` | `var(--border-default)` |
| `--color-ring` | `var(--accent)` | `var(--accent)` |
| `--color-tint-graphite` | `var(--text-2)` | `var(--text-2)` |
| `--color-term` | `var(--accent-deep)` | `var(--accent-deep)` |
| `--color-code-chip` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--color-code-chip-ink` | `var(--text-2)` | `var(--text-2)` |
| `--shadow` | `none` | `none` |
| `--shadow-lift` | `var(--shadow-dialog)` | `var(--shadow-dialog)` |
| `--shadow-float` | `var(--shadow-pop)` | `var(--shadow-pop)` |
| `--radius` | `var(--radius-md)` | `var(--radius-md)` |
| `--r-win` | `var(--radius-md)` | `var(--radius-md)` |
| `--r-menu` | `var(--radius-lg)` | `var(--radius-lg)` |
| `--r-inset` | `var(--radius-sm)` | `var(--radius-sm)` |
| `--radius-inset` | `var(--radius-sm)` | `var(--radius-sm)` |
| `--radius-control` | `var(--radius-md)` | `var(--radius-md)` |
| `--radius-surface` | `var(--radius-lg)` | `var(--radius-lg)` |
| `--radius-dialog` | `var(--radius-xl)` | `var(--radius-xl)` |
| `--radius-capsule` | `var(--radius-full)` | `var(--radius-full)` |
| `--radius-swatch` | `var(--radius-sm)` | `var(--radius-sm)` |
| `--radius-control-compact` | `var(--radius-md)` | `var(--radius-md)` |
| `--ui-surface` | `var(--surface-overlay)` | `var(--surface-overlay)` |
| `--ui-edge` | `var(--border-default)` | `var(--border-default)` |
| `--ui-highlight` | `var(--glass-highlight)` | `var(--glass-highlight)` |
| `--ui-shadow` | `inset 0 1px 0 var(--ui-highlight)` | `inset 0 1px 0 var(--ui-highlight)` |
| `--ui-scrim` | `var(--backdrop)` | `var(--backdrop)` |
| `--ui-selected` | `var(--accent-sub)` | `var(--accent-sub)` |
| `--ui-danger` | `var(--danger-deep)` | `var(--danger-deep)` |
| `--dim` | `.62` | `.62` |
| `--side-w` | `300px` | `300px` |
| `--side-plate` | `var(--surface)` | `var(--surface)` |
| `--side-rule` | `var(--border-subtle)` | `var(--border-subtle)` |
| `--side-rule-strong` | `var(--border-weak)` | `var(--border-weak)` |
| `--side-edge` | `inset 0 0 0 1px var(--border-weak)` | `inset 0 0 0 1px var(--border-weak)` |
| `--side-hollow` | `var(--text-3)` | `var(--text-3)` |
| `--side-current` | `var(--fill-active)` | `var(--fill-active)` |
| `--mark-windows` | `var(--text-2)` | `var(--text-2)` |
| `--mark-library` | `var(--text-2)` | `var(--text-2)` |
| `--mark-tools` | `var(--text-2)` | `var(--text-2)` |
| `--c-gray` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--c-blue` | `var(--accent-sub)` | `var(--accent-sub)` |
| `--c-green` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--c-yellow` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--c-orange` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--c-red` | `var(--fill-secondary)` | `var(--fill-secondary)` |
| `--c-purple` | `var(--fill-secondary)` | `var(--fill-secondary)` |

### Canonical CSS custom properties

This is the exact token stylesheet, including system preference guards, manual overrides and motion preference rules. AI-built tools must inherit this contract, not paste a stale copy inside a component.

```css
/* Aegis: Avi's Page system adapted to a canvas. Canonical source, mirrored in DESIGN.md.
   Legacy Zephium role names retained for ported components (MPL-2.0). */
:root {
  color-scheme: light;
  --bg: #f7f7f7;
  --surface: #ffffff;
  --surface-overlay: #ffffff;
  --ink: #0f0f0f;
  --text-1: rgb(15 15 15 / .94);
  --text-2: rgb(15 15 15 / .72);
  --text-3: rgb(15 15 15 / .64);
  --border-subtle: rgb(15 15 15 / .06);
  --border-weak: rgb(15 15 15 / .10);
  --border-default: rgb(15 15 15 / .15);
  --border-strong: rgb(15 15 15 / .30);
  --fill-secondary: rgb(15 15 15 / .06);
  --fill-hover: rgb(15 15 15 / .05);
  --fill-active: rgb(15 15 15 / .09);
  --accent: #1c64f2;
  --accent-deep: #0b3a99;
  --accent-sub: rgb(28 100 242 / .09);
  --on-accent: #ffffff;
  --success: #13834a;
  --success-deep: #0d6a3b;
  --success-sub: rgb(19 131 74 / .10);
  --warning: #a36200;
  --warning-deep: #824e00;
  --warning-sub: rgb(163 98 0 / .10);
  --danger: #d42a2a;
  --danger-deep: #b21f1f;
  --danger-sub: rgb(212 42 42 / .10);
  --chart-1: var(--accent);
  --chart-2: #555555;
  --chart-3: #54769e;
  --chart-4: #757575;
  --chart-5: #354f70;
  --chart-6: #676767;
  --chart-7: #416082;
  --chart-8: #454545;
  --glass-bg: rgb(255 255 255 / .88);
  --glass-border: rgb(15 15 15 / .12);
  --glass-highlight: rgb(255 255 255 / .90);
  --shadow-pop: 0 4px 16px rgb(15 15 15 / .08);
  --shadow-dialog: 0 16px 48px rgb(15 15 15 / .14);
  --backdrop: rgb(15 15 15 / .32);
  --dot: rgb(15 15 15 / .18);
  /* Explicit document page preferences are independent of the app theme. */
  --paper-light: #ffffff; --paper-ink-light: #1d1d1d; --paper-muted-light: #555555;
  --paper-dark: #1c1c1c; --paper-ink-dark: #e4e4e4; --paper-muted-dark: #b9b9b9;
  /* Type: system first, bundled Inter only as a fallback. */
  --font-sans: -apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter Variable", sans-serif;
  --font-display: -apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Inter Variable", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --text-caption: 12px; --text-label: 12px; --text-body: 13px;
  --text-reading: 14px; --text-subtitle: 16px; --text-title: 22px; --text-headline: 26px;
  --text-overview-label: 22px; --text-overview-figure: 40px;
  --leading-caption: 16px; --leading-body: 20px; --leading-reading: 24px;
  --leading-title: 28px; --leading-headline: 32px;
  --weight-regular: 400; --weight-medium: 500; --weight-semibold: 600;
  --tracking-heading: -.02em; --tracking-label: .08em;
  --space-0-5: 2px; --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --space-10: 40px; --space-12: 48px; --space-16: 64px; --space-24: 96px;
  --radius-sm: 4px; --radius-md: 8px; --radius-node: 10px;
  --radius-lg: 12px; --radius-xl: 16px; --radius-full: 999px;
  --border-width: 1px; --border-width-hair: .5px;
  --control-height: 36px; --control-touch: 44px;
  --menu-row-height: 36px; --setting-row-height: 44px;
  --menu-padding: 4px; --menu-width: 220px; --menu-gap: 8px;
  --glass-blur: 20px;
  --glass-shadow: inset 0 1px 0 var(--glass-highlight), var(--shadow-pop);
  --motion-instant: 0ms; --motion-fast: 120ms; --motion-base: 180ms; --motion-slow: 240ms;
  --motion-page: var(--motion-slow); --motion-menu: var(--motion-fast); --motion-dialog: var(--motion-base);
  --ease-out: cubic-bezier(.2, 0, 0, 1);
  --ease-drawer: var(--ease-out); --ease-in-out: var(--ease-out);
  --ease-smooth: var(--ease-out); --ease-emphasized: var(--ease-out);
  --border: var(--border-default);
  --info: var(--accent); --info-deep: var(--accent-deep); --info-sub: var(--accent-sub);
  --chart-grid: var(--border-weak); --chart-axis: var(--border-strong);
  /* Compatibility aliases: all existing app and ported object roles resolve here. */
  --font: var(--font-sans); --mono: var(--font-mono);
  --canvas: var(--bg); --card: var(--surface); --raised: var(--surface-overlay); --pill: var(--surface);
  --strip: color-mix(in srgb, var(--surface) 96%, var(--ink));
  --inset: color-mix(in srgb, var(--surface) 94%, var(--ink));
  --text: var(--text-1); --ink-2: var(--text-2); --muted: var(--text-2); --faint: var(--text-3);
  --line: var(--border-weak); --line-strong: var(--border-default); --edge-top: var(--glass-highlight);
  --hover: var(--fill-hover); --press: var(--fill-active);
  --focus: var(--accent); --data: var(--accent); --data-soft: var(--accent-sub);
  --warn: var(--warning); --ok: var(--success);
  --color-text: var(--text-1); --color-muted: var(--text-2); --color-faint: var(--text-3);
  --color-label-secondary: var(--text-2); --color-lit: var(--ink);
  --color-surface: var(--surface); --color-float: var(--surface-overlay);
  --color-fill: var(--fill-secondary); --color-fill-hover: var(--fill-hover);
  --color-border: var(--border-weak); --color-border-strong: var(--border-default);
  --color-ring: var(--accent); --color-tint-graphite: var(--text-2);
  --color-term: var(--accent-deep); --color-code-chip: var(--fill-secondary); --color-code-chip-ink: var(--text-2);
  --shadow: none; --shadow-lift: var(--shadow-dialog); --shadow-float: var(--shadow-pop);
  --radius: var(--radius-md); --r-win: var(--radius-md); --r-menu: var(--radius-lg); --r-inset: var(--radius-sm);
  --radius-inset: var(--radius-sm); --radius-control: var(--radius-md); --radius-surface: var(--radius-lg);
  --radius-dialog: var(--radius-xl); --radius-capsule: var(--radius-full); --radius-swatch: var(--radius-sm);
  --radius-control-compact: var(--radius-md);
  --ui-surface: var(--surface-overlay); --ui-edge: var(--border-default); --ui-highlight: var(--glass-highlight);
  --ui-shadow: inset 0 1px 0 var(--ui-highlight); --ui-scrim: var(--backdrop);
  --ui-selected: var(--accent-sub); --ui-danger: var(--danger-deep);
  --dim: .62; --side-w: 300px;
  --side-plate: var(--surface); --side-rule: var(--border-subtle); --side-rule-strong: var(--border-weak);
  --side-edge: inset 0 0 0 1px var(--border-weak); --side-hollow: var(--text-3); --side-current: var(--fill-active);
  --mark-windows: var(--text-2); --mark-library: var(--text-2); --mark-tools: var(--text-2);
  /* Legacy note tint names remain neutral; authored content may keep its own colours. */
  --c-gray: var(--fill-secondary); --c-blue: var(--accent-sub); --c-green: var(--fill-secondary);
  --c-yellow: var(--fill-secondary); --c-orange: var(--fill-secondary); --c-red: var(--fill-secondary); --c-purple: var(--fill-secondary);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
  color-scheme: dark;
  --bg: #141414;
  --surface: #1c1c1c;
  --surface-overlay: #242424;
  --ink: #f2f2f2;
  --text-1: rgb(242 242 242 / .94);
  --text-2: rgb(242 242 242 / .78);
  --text-3: rgb(242 242 242 / .70);
  --border-subtle: rgb(242 242 242 / .07);
  --border-weak: rgb(242 242 242 / .12);
  --border-default: rgb(242 242 242 / .17);
  --border-strong: rgb(242 242 242 / .32);
  --fill-secondary: rgb(242 242 242 / .10);
  --fill-hover: rgb(242 242 242 / .08);
  --fill-active: rgb(242 242 242 / .13);
  --accent: #6c9bff;
  --accent-deep: #b9cfff;
  --accent-sub: rgb(108 155 255 / .17);
  --on-accent: #141414;
  --success: #3fbf7a;
  --success-deep: #9fe3bd;
  --success-sub: rgb(63 191 122 / .16);
  --warning: #e0a530;
  --warning-deep: #f3d08a;
  --warning-sub: rgb(224 165 48 / .16);
  --danger: #ff6b6b;
  --danger-deep: #ffb8b8;
  --danger-sub: rgb(255 107 107 / .16);
  --chart-2: #cccccc;
  --chart-3: #94b8e0;
  --chart-4: #a6a6a6;
  --chart-5: #b5ccec;
  --chart-6: #bababa;
  --chart-7: #83a4cf;
  --chart-8: #dedede;
  --glass-bg: rgb(36 36 36 / .90);
  --glass-border: rgb(242 242 242 / .17);
  --glass-highlight: rgb(242 242 242 / .08);
  --shadow-pop: 0 8px 24px rgb(0 0 0 / .30);
  --shadow-dialog: 0 16px 48px rgb(0 0 0 / .45);
  --backdrop: rgb(0 0 0 / .60);
  --dot: rgb(242 242 242 / .20);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141414;
  --surface: #1c1c1c;
  --surface-overlay: #242424;
  --ink: #f2f2f2;
  --text-1: rgb(242 242 242 / .94);
  --text-2: rgb(242 242 242 / .78);
  --text-3: rgb(242 242 242 / .70);
  --border-subtle: rgb(242 242 242 / .07);
  --border-weak: rgb(242 242 242 / .12);
  --border-default: rgb(242 242 242 / .17);
  --border-strong: rgb(242 242 242 / .32);
  --fill-secondary: rgb(242 242 242 / .10);
  --fill-hover: rgb(242 242 242 / .08);
  --fill-active: rgb(242 242 242 / .13);
  --accent: #6c9bff;
  --accent-deep: #b9cfff;
  --accent-sub: rgb(108 155 255 / .17);
  --on-accent: #141414;
  --success: #3fbf7a;
  --success-deep: #9fe3bd;
  --success-sub: rgb(63 191 122 / .16);
  --warning: #e0a530;
  --warning-deep: #f3d08a;
  --warning-sub: rgb(224 165 48 / .16);
  --danger: #ff6b6b;
  --danger-deep: #ffb8b8;
  --danger-sub: rgb(255 107 107 / .16);
  --chart-2: #cccccc;
  --chart-3: #94b8e0;
  --chart-4: #a6a6a6;
  --chart-5: #b5ccec;
  --chart-6: #bababa;
  --chart-7: #83a4cf;
  --chart-8: #dedede;
  --glass-bg: rgb(36 36 36 / .90);
  --glass-border: rgb(242 242 242 / .17);
  --glass-highlight: rgb(242 242 242 / .08);
  --shadow-pop: 0 8px 24px rgb(0 0 0 / .30);
  --shadow-dialog: 0 16px 48px rgb(0 0 0 / .45);
  --backdrop: rgb(0 0 0 / .60);
  --dot: rgb(242 242 242 / .20);
}
/* Preferences must disable motion in generated UI as well as the app shell. */
:root:has(body.motion-off) { --motion-fast: 0ms; --motion-base: 0ms; --motion-slow: 0ms; }
@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-base: 0ms; --motion-slow: 0ms; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }
}
```

## Typography

System first: `-apple-system`, SF Pro Text / Display if installed, `system-ui`, then the existing bundled Inter fallback. Do not download or bundle Apple fonts. Use the display stack only for headings, with `--tracking-heading` of -0.02em. Body stays regular; labels medium; titles semibold.

| Role | Size / leading | Weight | Use |
| --- | --- | --- | --- |
| Caption / label | 12 / 16 | 400 or 500 | Versions, hints, status, HUD labels |
| Body | 13 / 20 | 400 | Settings, menus, chrome |
| Reading | 14 / 24 | 400 | Greeting conversation, explanatory text |
| Subtitle | 16 / 24 | 600 | Provider section, panel title |
| Title | 22 / 28 | 600 | Dialog or workspace heading |
| Headline | 26 / 32 | 600 | Rare, substantial workspace title |

Use sentence case for content. Small caps are limited to quiet activity and author labels, using `--tracking-label`, never dense table headers or every button. Versions, counts, dates, chart values and aligned numbers use `font-variant-numeric: tabular-nums`. Keep body and placeholder contrast at least 4.5:1, large text 3:1. Long URLs and commands wrap inside their container.

## Layout

A strict 4px grid, with 8px as the ordinary gap. The 2px half-step exists only for focus offsets and optical alignment. Align headings, row content and input text to a shared edge. Typical hierarchy: 8px within a group, 16px between related blocks, 24px panel padding, 32px between sections. The full spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 and 96px.

A popover has 24px padding on desktop and 16px on narrow screens. At 400px wide its reading width is 350px after two 24px pads and two 1px borders. It never exceeds the viewport minus 32px. Settings uses one scrolling content region with consistent 24px edges. At 640px and below, stack long row actions and use at least 44px touch targets. Test 1440, 768 and 390px, both themes, keyboard and reduced motion.

The empty canvas remains empty except for the AI dock and existing edge chrome. Future AI-built windows and tools use the same card, input and spacing vocabulary. Do not add a hero, onboarding tiles, ornamental HUD frames or placeholder statistics.

## Elevation & Depth

Content is flat: a tone step or a hairline, no resting shadow. Floating menus, the dock, the conversation, popovers and dialogs may use the named floating shadows. Hairlines come from `--border-*`; use the default border for inputs and a stronger border only when needed.

Glass signals a floating surface over real canvas content. The dock popover and greeting surface use this exact recipe:

```css
background: var(--surface-overlay); /* opaque fallback */
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow);
/* Inside a backdrop-filter feature query: */
background: var(--glass-bg);
-webkit-backdrop-filter: blur(var(--glass-blur));
backdrop-filter: blur(var(--glass-blur));
```

The shadow includes an inset 1px top highlight. Use one blur per floating surface, no stacked glass cards. Never use decorative gradients, neon, ambient glows or background animation. A geometric ring and centre mark replace the former animated ribbon orb. A state change can change the mark's ink; the adjacent word explains it.

## Shapes

Fixed radii: 4px for code and small details, 8px for controls and canvas windows, 10px for diagram nodes, 12px for grouped surfaces, 16px for dialogs and the greeting, full for the compact dock and genuine pills. Use circles, squares and simple lines for status and marks. A tiny outlined circle means idle; a filled status circle accompanies Ready or Connected. Do not rely on shape or colour alone.

## Components

The dock is the single clear entrance to AI. Keep the accessible name **Connect AI**, a quiet neutral mark and generous hit area. A floating provider panel opens above it. Close and Escape return focus; keyboard focus leaving the nonmodal panel dismisses it. No focus trap on the surrounding canvas.

Provider connection rows share one component in the dock and Settings > Accounts. Provider name first, worded status below, aligned actions after. ChatGPT sign-in is the blue primary action. Cancel, Disconnect, Copy and Check again remain neutral. Readiness uses status green and the word Ready or Connected. Versions use tabular figures. Keep recovery commands readable and contained. Busy, error, disconnected, missing, pending and ready states all retain their words and actions.

The greeting uses the normal conversation and input controls on one glass sheet. Hide only the synthetic first welcome request in the presentation. Keep it in the stored transcript; keep all real user replies, including a later reply reading Introduction. The conversation opens with the AI's greeting. Reading text and the textarea share an edge. Dictation, collapse, send and keyboard shortcuts remain available.

Motion explains opening, closing and state change. Use `--motion-fast` 120ms for fills, `--motion-base` 180ms for the dock and popover, `--motion-slow` 240ms only for larger panels, with `--ease-out`. Animate opacity and transform, plus short colour or border state transitions. No spring, bounce, orbit, pulse loop or decorative reveal. `prefers-reduced-motion: reduce` and the app Motion off setting make transitions immediate. Never delay an action for animation.

The HTML sandbox receives every custom property through `THEME_KEYS` in `packages/protocol/src/sandbox.ts`, on creation and live preference updates. Forward the resolved theme, colour scheme and motion preference. Keep this allowlist in sync whenever adding tokens. Generated controls use accent/on-accent for primary action and the same focus, radius and material roles.

## Do's and Don'ts

Do align edges, use whitespace before adding borders, name state in words, preserve keyboard paths, respect saved appearance preferences and test both themes. Do use Australian English, sentence case and plain punctuation.

Do not hard-code colours in components, invent palette steps, use a second accent, wrap every paragraph in a card, add shadows to resting content, decorate the canvas with gradients, bundle licensed fonts or use em dashes. Do not restore the removed tool rail or starter tiles as part of visual work.

### Rules for AI-generated UI

Adapted from section 0 of Avi's Page design system:

1. **Inherit tokens.** Use the canonical semantic CSS custom properties. No raw hex, RGB literals or framework palette colours in generated components. Add a named reusable role to the token source and this document if a real role is missing.
2. **Colour has meaning.** Greyscale is the default. One blue for focus, selected states and the primary action. Status green, amber and red always include a word. Data series use the chart roles, labels and differing line styles.
3. **Type and space establish hierarchy.** Use the small app scale above. No unnecessary nested cards, oversized headings or decorative labels. Long reading content stays around 65 to 75 characters per line; wide tables scroll inside their own region.
4. **Use hairlines.** Choose a border token by structural role. Only floating layers receive a named shadow. Glass is for floating canvas surfaces with the documented fallback, highlight and blur.
5. **Keep geometry consistent.** Use the spacing and radius scales. Align all rows and action edges. Do not invent a new radius per component.
6. **Ship both themes.** Inherit system preference and the existing manual override. Check card bodies, editors, chart labels and generated HTML in both modes. Preserve intentional authored content colours without colouring the chrome.
7. **Use tabular numerals.** Aligned counts, versions, tables, dates and chart labels must not jitter when values change. Keep units and explicit missing-value labels.
8. **Draw diagrams structurally.** Use surface-filled nodes, a hairline border, radius-node, semibold title and secondary subtitle. Edges use tertiary ink and clear arrowheads. Distinguish optional or async edges with dashed lines and labels. Blue is a meaningful selection or emphasis, never decoration.
9. **Write plainly.** Australian English, sentence case, concise action labels, clear errors and recovery. No emoji, exclamation marks, invented claims or em dashes. Keep implementation details out of ordinary product flows.
10. **Accessibility is required.** Visible 2px accent focus ring with 2px offset, labelled controls, logical keyboard order, body and placeholder contrast at least 4.5:1, adequate touch targets and worded status. Reduced motion and Motion off apply inside generated tools as well.
11. **Keep work honest and local.** Do not invent stats or profile details. Show loading, empty, error and ready states honestly. Preserve the person's data, selection, history and undo behaviour.
12. **Compose before extending.** Reuse the app's shared controls and semantic tokens. Document any necessary new pattern here so later AI-built panels, tools and windows share the same language.

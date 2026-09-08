# DSI Lab Overview Production Contract

Status: approved production contract for the isolated Astro route `/lab/`, adapted from `D:\ai-output\dsi-lab-overview-playground\DESIGN.md`.

## 0. Source And Scope

- The approved playground and its design contract are the visual source of truth.
- Existing sources inspected: `Layout.astro`, the Field Notebook and Full-Bleed Topnav contracts/layouts, and the three list experiment page/component patterns.
- The audience is the site owner navigating five existing Lab families. The overview distinguishes two independent page systems from one three-stage list-page lineage.
- This route is an index only. It does not preview, merge, restyle, or modify any child Lab page.
- Implementation stays static Astro and CSS. No hydration, dependency, image, icon, tuning control, or decorative animation is permitted.

## 1. Direction And Composition

The page is a compact route ledger in the restrained dark/cool DSI language. Its signature is one continuous rule-led map, not a card grid: compact title and totals, a scope note, two visually parallel independent systems, then a numbered three-stage lineage.

Order is fixed:

1. Compact `LAB / 实验总览` header and two factual totals.
2. Scope note explaining that each child keeps its own visual language.
3. Independent systems: Field Notebook, then Full-Bleed Topnav.
4. List lineage: List Exploration, List Masters, then List Route Schemes.
5. Quiet directory footer.

One `nav` owns the route map. Every row is one direct anchor. No child family receives a card, preview, icon, badge, radius, shadow, or featured treatment.

## 2. Tokens

All overview tokens are declared on `.lab-overview`. Component rules consume token names only. Exact matches alias existing `Layout` tokens; overview-only roles stay local.

### Color And Material

| Token | Value or source | Role |
|---|---|---|
| `--lab-color-canvas` | `var(--bg)` | Main canvas |
| `--lab-color-canvas-deep` | `#05060d` | Lower canvas |
| `--lab-color-surface` | `rgba(18, 23, 37, 0.72)` | Route-map frame |
| `--lab-color-surface-hover` | `rgba(110, 195, 255, 0.07)` | Row hover/focus wash |
| `--lab-color-surface-active` | `rgba(110, 195, 255, 0.11)` | Row active wash |
| `--lab-color-line` | `var(--line)` | Dividers |
| `--lab-color-line-strong` | `rgba(110, 195, 255, 0.38)` | Lineage rail |
| `--lab-color-text` | `var(--text)` | Primary text |
| `--lab-color-text-soft` | `var(--text-soft)` | Supporting prose |
| `--lab-color-text-faint` | `#8793b6` | Metadata and paths |
| `--lab-color-accent` | `var(--accent-soft)` | Focus and link emphasis |
| `--lab-color-ambient-slate` | `rgba(91, 111, 165, 0.10)` | Static top-left depth |
| `--lab-color-ambient-cyan` | `rgba(52, 132, 255, 0.08)` | Static upper-right depth |
| `--lab-color-shadow` | `rgba(0, 0, 0, 0.22)` | Single frame shadow |

The route is dark-only. Cyan is the only interactive accent. Depth is one translucent frame, thin rules, a single shadow, and low-opacity static ambience. No visible orb, moving glow, texture, particle, gradient text, or nested glass surface is allowed.

### Typography

- UI stack: `Inter, "Segoe UI Variable", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`.
- Mono stack: `ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace`.
- Sizes: title `clamp(2rem, 4vw, 3.25rem)`; section `1rem`; family `clamp(1.125rem, 2vw, 1.375rem)`; body `0.9375rem`; metadata `0.75rem`; total `1.5rem`.
- Weights: regular `400`, medium `600`, bold `700`. Line heights: title `1.08`, tight `1.35`, body `1.65`, metadata `1.5`.
- Tracking: title `-0.035em`, family `-0.012em`, metadata `0.08em`.
- English names/descriptions use `lang="en"`. Text wraps naturally without clamping, truncation, or ellipsis.

### Spacing And Geometry

Spacing uses a 4px base: `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.25rem`, `1.5rem`, `2rem`, `2.5rem`, `3rem`, `4rem`, and `5rem`, exposed as `--lab-space-1/2/3/4/5/6/8/10/12/16/20`.

| Token | Value | Role |
|---|---:|---|
| `--lab-content-max` | `72.5rem` | Content ceiling |
| `--lab-copy-measure` | `42rem` | Copy measure |
| `--lab-summary-min` / `--lab-summary-width` | `18rem` / `24rem` | Desktop totals range |
| `--lab-route-id-width` | `4.5rem` | Metadata column |
| `--lab-route-copy-min` | `14rem` | Family copy floor |
| `--lab-route-count-width` | `7.5rem` | Count column |
| `--lab-route-path-min` / `--lab-route-path-width` | `12rem` / `19rem` | Destination range |
| `--lab-chain-rail-width` | `3.5rem` | Lineage rail |
| `--lab-target-min` | `2.75rem` | 44px minimum target |
| `--lab-line-size` | `1px` | Structural rules |
| `--lab-radius-shell` | `1.25rem` | Only content radius |
| `--lab-focus-width` / `--lab-focus-offset` | `2px` / `0.25rem` | Keyboard ring |

Responsive insets are token compositions: gutter `clamp(1rem, 4vw, 4rem)`, page block padding `clamp(2.5rem, 7vw, 5rem)`, section padding `clamp(1.5rem, 4vw, 2.5rem)`, and row block padding `clamp(1.25rem, 3vw, 2rem)`.

## 3. Primitives And States

### Route Row

- Anatomy: route type/stage, family name and description, count, literal destination, and `进入` affordance.
- Default: transparent and divided by rules. The anchor owns the complete row and a minimum 44px target.
- Hover/focus: quiet cyan wash, cyan name/action emphasis, and a `0.125rem` destination shift.
- Focus: inset `2px` cyan outline with `0.25rem` clearance; it cannot be clipped at frame edges.
- Active: stronger wash and a smaller `0.0625rem` destination shift.
- Only destination `transform` and action `opacity` transition for `140ms ease-out`.
- Motion tokens are `--lab-motion-fast: 140ms`, `--lab-motion-ease: ease-out`, `--lab-motion-shift: 0.125rem`, and `--lab-motion-press: 0.0625rem`; opacity states are `--lab-opacity-hidden: 0`, `--lab-opacity-rest: 0.68`, and `--lab-opacity-full: 1`.

### Lineage Guide

An ordered list supplies semantic chronology. A decorative, `aria-hidden` two-digit rail repeats `01`, `02`, and `03` with a continuous one-pixel line. It has no arrow, node card, branching graphic, or animation.

## 4. Responsive Contract

- Above `960px`: two-column header and four-field rows; counts and paths align.
- At or below `960px`: rows use three columns and move the path below family copy.
- At or below `768px`: header becomes one column; rows retain shrink-safe three-column structure.
- At or below `480px`: totals stack; rows use a two-column metadata line followed by full-width copy and path; rail and insets reduce through existing tokens.
- At every width, flexible grid tracks use `minmax(0, 1fr)`, descendants can shrink, and paths use `overflow-wrap: anywhere`. The document is the only scroll owner.

## 5. Accessibility And Production Integration

- `Layout` emits `lang="zh-CN"`, one `main#lab-directory`, one visible-on-focus skip link, and `noindex,nofollow`; the page passes no canonical path.
- The page has exactly one `h1`, ordered `h2` headings, one named `nav`, semantic `ul`/`ol`, and five direct linked rows in approved order.
- All links are base-safe through `withBase(import.meta.env.BASE_URL, path)`. The exact `/lab/` overview is omitted from sitemap output while child Lab routes retain their existing behavior.
- Field Notebook `8` and Full-Bleed Topnav `1` are fixed route-family metadata. The three list-family counts come directly from their exported data arrays, and the aggregate is derived from all five variables.
- Target WCAG 2.2 AA. Meaning is never color-only, focus is always visible, targets are at least 44px, and keyboard/visual order are identical.
- Under `prefers-reduced-motion: reduce`, transitions stop and transforms remain at rest without hiding state information.

## 6. Production Debt

The playground's static-count and root-relative-link debts are closed by production data wiring and `withBase()`. One evidence debt remains because this implementation task explicitly forbids browser and build/test commands:

| ID | Remaining evidence | Exit condition |
|---|---|---|
| `LAB-OV-P01` | Production font metrics, focus rendering, and 960/768/480 reflow are source-conformant but not browser-observed in this task. | Run the project visual QA flow at 1280px, 768px, 480px, and 375px, including keyboard focus and reduced motion. |

No accessibility violation is accepted as debt.

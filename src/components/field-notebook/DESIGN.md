# Field Notebook Lab Design Contract

Status: approved pre-implementation contract. No page, component, mock data, or stylesheet is implemented by this document.

## 0. Research And Reference Log

- **Selected reference:** the Field Notebook candidate in `D:\ai-output\dsi-blog-visual-redesign-handoff\dsi-blog-visual-redesign-handoff\candidate`, supported by its `HANDOFF.md`, `VISUAL_REDESIGN_REPORT.md`, and migration manifest. It was selected over Independent Issue, Index Grid, Raw Dispatch, and Quiet Archive because it best balances long-form reading, scan speed, responsive behavior, accessibility, and maintenance.
- **Candidate files inspected:** `tokens.css`, `candidate.css`, `global.css`, `BaseLayout.astro`, `NotebookPage.astro`, `SecondaryPage.astro`, `PostRows.astro`, `ArticleBody.astro`, `mock.ts`, and `verify-candidate.mjs`.
- **Repository patterns inspected:** the shared layouts, article layout, three existing lab view components, the current docs/projects/categories pages, the current lab index, `withBase()`, package scripts, Astro configuration, and generated sitemap files. Existing pages use Astro components, component-scoped CSS, and `withBase()`; the production visual language is dark, glassy, rounded, and card-led, so it is a deliberate anti-reference for this isolated light editorial lab.
- **Guidance applied:** frontend design-system architecture, image-to-code extraction, perfection/accessibility constraints, and designpowers direction/review/debt guidance. Accessibility outranks candidate fidelity where they conflict.
- **Research not repeated:** no new Lazyweb or Imagen lane was run because the user supplied a selected, previously compared, implementation-ready visual reference. No real content was inspected.
- **Candidate corrections:** namespace every token, contain every selector below `.field-notebook`, use base-safe links, add lab-only robots and sitemap isolation, and change tertiary text from `#687168` (4.43:1 on paper) to `#646d64` (4.69:1 on paper).

## 1. Scope, Atmosphere, And Identity

### Scope Boundary

This contract governs only the isolated route family below and only when an ancestor carries the `.field-notebook` class:

| Route | Role |
|---|---|
| `/lab/field-notebook/` | Notebook landing and current-entry editorial lead |
| `/lab/field-notebook/blog/` | Numbered article index |
| `/lab/field-notebook/article/` | Mock long-form article and reading stress case |
| `/lab/field-notebook/docs/` | Reference shelf |
| `/lab/field-notebook/projects/` | Project register |
| `/lab/field-notebook/archive/` | Chronological archive |
| `/lab/field-notebook/categories/` | Subject index |
| `/lab/field-notebook/not-found/` | Missing field-note state |

The future stylesheet is `src/styles/field-notebook.css`. Its tokens must be declared on `.field-notebook`, and every visual selector must include `.field-notebook`. It must not contain `:root`, bare `html`/`body`/element selectors, or rules that can affect production pages. This file is not a project-global design system and does not authorize changes to existing production tokens, layouts, navigation, content, or routes.

The lab must remain static, dependency-free, mock-only, `noindex,nofollow`, absent from sitemaps, and unlinked from production navigation. Internal URLs must pass through the repository's `withBase(import.meta.env.BASE_URL, path)` convention.

### Atmosphere And Signature

Field Notebook feels like a research workbook that can be reopened, searched, annotated, and extended. Its signature is the contrast between a quiet sage file rail and an unboxed paper field: numbered records, strong horizontal rules, and editorial typography create hierarchy without cards, glass, glow, or dashboard chrome.

The memorable moment is the current entry opening across the paper grid, followed by a disciplined sequence of numbered log rows. Content, not ornament, supplies the visual weight.

### Anti-References

- No dark production palette, glow, gradient mesh, glass, blur, floating panel, pill navigation, or rounded card grid.
- No marketing hero, metric dashboard, bento layout, nested containers, or decorative status UI.
- No continuous animation, 3D, parallax, client-side motion library, or JavaScript used only for presentation.
- No real content collection reads and no imports from production page components or shared production layouts.

## 2. Color

All literals below are declaration values for `.field-notebook`; implementation rules consume only the token names.

| Role | Token | Value | Use |
|---|---|---:|---|
| Paper | `--field-color-paper` | `#f1f0e8` | Page and reading field |
| Rail | `--field-color-rail` | `#d9ddcf` | Left index rail, figure placeholder |
| Ink | `--field-color-ink` | `#1b211c` | Headings, body, heavy rules |
| Muted ink | `--field-color-muted` | `#596158` | Supporting prose; also valid on rail |
| Tertiary ink | `--field-color-faint` | `#646d64` | Metadata on paper only |
| Rule | `--field-color-rule` | `#b5b8af` | Hairline dividers |
| Strong rule | `--field-color-rule-strong` | `#737b73` | Structural separators when ink is too strong |
| Accent | `--field-color-accent` | `#1f6f5c` | Links and focus on paper |
| Strong accent | `--field-color-accent-strong` | `#145445` | Active rail links and high-contrast focus |
| Code surface | `--field-color-code` | `#17211d` | Code block only |
| Code ink | `--field-color-code-ink` | `#e8f2e8` | Code text only |

Rules:

- Set `color-scheme: light`; this lab has no dark mode in the approved scope.
- Ink and spacing establish hierarchy. Accent is reserved for links, current state, focus, and the current-entry rule; it is not decoration.
- On the sage rail, use ink, muted ink, or strong accent. Do not use tertiary ink or the regular accent for small text.
- Never communicate content type or state by color alone.
- No raw color literal may appear outside the `.field-notebook` token declaration block. Extend this table before introducing a new visual role.

## 3. Typography

Three families are intentional: serif carries reading/editorial voice, sans-serif carries navigation and explanatory UI, and monospace carries record metadata. They must not be used interchangeably.

### Font Tokens

| Token | Stack | Role |
|---|---|---|
| `--field-font-reading` | `Georgia, "Iowan Old Style", "Songti SC", STSong, serif` | Display titles, row titles, article prose |
| `--field-font-ui` | `"Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif` | Navigation, summaries, section prose |
| `--field-font-mono` | `ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace` | Dates, numbers, types, overlines, code |

No remote font or font dependency is approved. Preserve the stack order and test Windows/macOS line wrapping during visual QA.

### Type Tokens

| Role | Token | Size | Weight | Line height | Tracking |
|---|---|---:|---:|---:|---:|
| Display | `--field-type-display` | `clamp(3rem, 7vw, 6rem)` | 500 | 0.94 | `-0.045em` |
| Page display | `--field-type-page` | `clamp(3.25rem, 8vw, 6.5rem)` | 500 | 0.92 | `-0.045em` |
| Row title | `--field-type-row` | `clamp(1.375rem, 3vw, 2.125rem)` | 500 | 1.2 | `-0.015em` |
| Article H2 | `--field-type-h2` | `clamp(1.75rem, 4vw, 2.625rem)` | 600 | 1.2 | `-0.025em` |
| Article H3 | `--field-type-h3` | `1.3125rem` | 700 | 1.3 | `0` |
| Reading body | `--field-type-reading` | `1.125rem` | 400 | 1.85 | `0` |
| UI body | `--field-type-body` | `1rem` | 400 | 1.7 | `0` |
| Lead | `--field-type-lead` | `1.25rem` | 400 | 1.65 | `0` |
| Metadata | `--field-type-meta` | `0.75rem` | 700 | 1.4 | `0.08em` |

Rules:

- Keep display titles at approximately 12 CJK characters per line; use natural wrapping and `overflow-wrap: anywhere` for pathological strings.
- Metadata may be uppercase only when the source label is Latin. Do not force uppercase transformations onto Chinese text.
- Article body copy never falls below `1rem`; metadata never falls below `0.75rem`.
- At 390px, override display tokens to a maximum of `3.5rem` so long Chinese titles do not dominate the entire first viewport.

## 4. Spacing, Rules, And Layout

### Spacing Scale

All spacing intent uses a 4px base. Intrinsic layout mechanics such as `auto`, `%`, `minmax()`, `min()`, `max()`, and `clamp()` do not require tokens.

| Token | Value | Typical use |
|---|---:|---|
| `--field-space-1` | `0.25rem` | Inline optical correction |
| `--field-space-2` | `0.5rem` | Tight metadata gap |
| `--field-space-3` | `0.75rem` | Label and caption gap |
| `--field-space-4` | `1rem` | Compact row gap |
| `--field-space-5` | `1.5rem` | Standard inset/gap |
| `--field-space-6` | `2rem` | Main padding and section interior |
| `--field-space-7` | `3rem` | Section separation |
| `--field-space-8` | `4rem` | Editorial column gap |
| `--field-space-9` | `5rem` | Major vertical break |
| `--field-space-10` | `6rem` | Maximum desktop breathing room |

### Geometry Tokens

| Token | Value | Purpose |
|---|---:|---|
| `--field-shell-width` | `71.25rem` | 1140px main-content ceiling |
| `--field-reading-measure` | `44rem` | Article reading measure |
| `--field-rail-width` | `11.25rem` | Full desktop rail |
| `--field-rail-width-compact` | `10rem` | 768px narrow desktop rail |
| `--field-toc-width` | `11.875rem` | Desktop article TOC |
| `--field-touch-target` | `2.75rem` | 44px minimum interactive height/width |
| `--field-rule` | `1px solid var(--field-color-rule)` | Standard divider |
| `--field-rule-heavy` | `4px solid var(--field-color-ink)` | Page and section threshold |
| `--field-focus-ring` | `3px solid var(--field-color-accent-strong)` | Keyboard focus |

### Grid Grammar

- The shell is `rail + minmax(0, 1fr)`. Every content-bearing grid child must permit shrinking with `min-width: 0`.
- The paper column is left-aligned inside its available area and capped by `--field-shell-width`; it does not float as a centered card.
- Major sections use rules, whitespace, and typographic alignment. Asymmetry is deliberate: index/TOC columns are narrow, while content columns retain the reading measure.
- Article code and table regions own their horizontal overflow. The document viewport must never scroll horizontally.
- Desktop rail and TOC may be sticky, but the document remains the only vertical scroll owner.

### Responsive States

| QA width | Required state |
|---:|---|
| **1440px** | `--field-rail-width`; full sage rail fixed by sticky positioning; generous paper gutters; current-entry split grid; article uses `--field-toc-width + minmax(0, 1fr)`; TOC is sticky and aligned to its own column. |
| **768px** | Retain a compact `--field-rail-width-compact` rail. Reduce gutters and column gaps through existing spacing tokens. All structural grids use `minmax(0, 1fr)`; the article TOC remains sticky but must not force the reading column or viewport wider. |
| **390px** | Below the 760px CSS breakpoint, the rail becomes a normal-flow top header. Navigation stays visible and horizontally scrollable, never fixed, absolute, overlaid, or hidden behind a menu. Every content layout becomes one column; TOC becomes static before the article body; page gutter is `--field-space-5`; primary content has no horizontal overflow. |

The 760px breakpoint is a contract boundary: 768px must exercise the retained-rail state, while 390px must exercise normal-flow navigation.

## 5. Primitives And Page Compositions

### Stable Verification Hooks

These classes are the minimal shared vocabulary between future Astro components, the scoped stylesheet, and the static verifier. They describe roles rather than page-specific appearance.

| Class | Contract role |
|---|---|
| `.field-notebook` | Lab scope root |
| `.field-notebook__rail` | Sage index rail and labelled navigation region |
| `.field-notebook__main` | Paper main-content region |
| `.field-notebook__current-entry` | Landing editorial lead |
| `.field-notebook__log` | Numbered ordered record list |
| `.field-notebook__log-row` | One numbered record |
| `.field-notebook__type` | Visible content-type text |
| `.field-notebook__article-grid` | TOC plus article body grid |
| `.field-notebook__toc` | Labelled article table of contents |
| `.field-notebook__prose` | Long-form reading body |

Do not add page-name classes merely to satisfy a screenshot. Extend this vocabulary only when a genuinely reusable structural role appears.

### Notebook Shell And Left Rail

- **Structure:** one document, skip link, `.field-notebook` root, shell, `aside` rail, labelled `nav`, and one `main#main-content`.
- **Desktop:** sage field, brand/index mark at top, vertically ordered lab links, quiet notebook note at bottom, sticky for the viewport without creating a second scroll container.
- **Mobile:** normal-flow header with brand and horizontally scrollable navigation. The note may be omitted, but navigation may not be collapsed.
- **States:** the current listed destination uses `aria-current="page"`, stronger ink weight, and strong accent. The article view keeps Blog current; the unlisted not-found concept has no false current item. Hover changes underline/color only. Focus uses `--field-focus-ring` and is never clipped.

### Section Label

- A mono label/count pair above a hairline rule.
- It identifies a real section; it is not a pill, badge, or decorative pseudo-system marker.
- Long labels wrap without pushing the count outside the viewport.

### Editorial Current Entry

- **Job:** establish the newest/high-priority field note before the log.
- **Structure:** content-type label, date/reading metadata, serif title, concise summary, and a descriptive text link.
- **Layout:** open split grid bounded by whitespace and `--field-rule-heavy`; never place it inside a card or rounded panel.
- **Content stress:** the title must survive short, long CJK, and mixed-language cases without truncation.

### Numbered Log Rows

- **Structure:** semantic `ol`; each `li` contains a decorative two-digit number, metadata, an `article`, linked serif heading, optional summary, and optional tag list.
- **Rhythm:** rows are separated by `--field-rule`; no independent row background, radius, shadow, or elevation.
- **States:** title underline/color signals hover and focus. The full row must not pretend to be clickable if only the title is a link.
- **Content stress:** summary and tags disappear only when data is absent; long tags wrap, and the title remains the primary scan path.

### Content-Type Label

- Data types are exactly `note`, `essay`, and `reference`.
- Visible labels are `札记`, `长文`, and `参考`; type remains explicit in text and is never encoded only by color.
- Render as inline mono metadata, not a filled badge or pill.

### Article Grid And TOC

- **Structure:** one `article`, article header, labelled TOC `nav`, and body. Heading IDs are unique and every TOC hash resolves to a heading.
- **Desktop:** TOC is sticky with `align-self: start`; body is `minmax(0, 1fr)` and capped at `--field-reading-measure` for prose.
- **Mobile:** TOC is static in normal flow before the body. It is never a drawer, floating panel, or collapsed JavaScript control.
- **Rich content:** `pre > code`, figure/caption, blockquote, and a semantic table with caption/header scopes. Code and table wrappers are keyboard reachable when they overflow.

### Route-Specific Compositions

- **Reference shelf:** narrow collection index beside editorial reference rows; no card grid.
- **Project register:** ledger rows with record number, textual status, title, note, and link; status is not color-only.
- **Chronological archive:** oversized serif year anchors beside chronological rows.
- **Subject index:** numbered subject heading beside an ordered entry list.
- **Not found:** large `404` record mark plus plain return links; no error card or production 404 replacement.

Disabled, loading, modal, toast, and form states are not applicable to this static lab. Do not invent them to make the system look more complete.

## 6. Motion And Interaction

| Token | Value | Use |
|---|---:|---|
| `--field-motion-fast` | `140ms` | Link color and underline response only |
| `--field-motion-ease` | `ease` | Restrained state transition |

- Interaction communicates navigation, current state, or focus. No decorative movement is approved.
- Do not translate, scale, float, pulse, reveal, or continuously animate rows, headings, rules, or the rail.
- Hash navigation may use native smooth scrolling only when motion preference permits it.
- Under `prefers-reduced-motion: reduce`, scrolling is immediate and non-essential transition/animation duration is removed.
- Hover is enhancement only. Every action remains understandable by text, keyboard focus, and current-state semantics.

## 7. Depth And Surface

The depth strategy is **borders-only plus one tonal rail shift**.

- Paper and rail are solid fields. Rules and whitespace create every structural layer.
- `box-shadow`, `filter`, `backdrop-filter`, glow, translucent glass, gradients, and elevated cards are forbidden.
- Default radius is zero. A future exception requires a new documented primitive and evidence that a square editorial treatment fails.
- The dark code surface is a content material, not an elevated panel.
- The layout must still feel intentional through baseline rhythm, type contrast, rule weight, numbering, and asymmetric editorial columns; adding cards is not an acceptable shortcut.

## 8. Accessibility Constraints And Accepted Debt

### Inclusive Use Cases

- **Keyboard-only reader:** reaches the skip link first, enters `main`, traverses visible navigation in document order, and sees every focus state.
- **Low-vision/zoom reader:** at 200% zoom, content reflows without lost text or viewport-level horizontal scrolling.
- **Reduced-motion reader:** receives no smooth or continuous motion.
- **CJK mobile reader:** can read long Chinese titles and mixed-language metadata at 390px without clipping, overlap, or an obstructing navigation layer.
- **Long-form technical reader:** can reach TOC targets and independently scroll long code/table regions with keyboard and touch.

### Constraints

- Target WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text and non-text focus/controls. The approved palette satisfies normal text on its permitted surfaces; do not swap token roles casually.
- Emit `lang="zh-CN"`, a unique non-empty title and description, exactly one `h1`, one `main#main-content`, and a visible-on-focus skip link targeting that main.
- Use semantic `header`, `nav`, `main`, `article`, `aside`, `ol`, `time`, `figure`/`figcaption`, `pre`/`code`, and table elements according to their meaning. ARIA supplements semantics; it does not replace them.
- Give each navigation an accessible name. Use `aria-current="page"` on at most one listed destination; do not invent a current link for the unlisted not-found concept.
- Keep interactive targets at least `--field-touch-target` in the relevant dimension with safe spacing. Never suppress browser zoom.
- Every focus ring is visible against both paper and rail, with an offset that avoids merging into rules.
- TOC and other hash links resolve to unique IDs. Heading order cannot skip levels for styling.
- Overflowing code/table regions need an accessible label and keyboard-reachable scroll container. Table headers use scopes and the table has a concise caption.
- Do not truncate meaningful text. Use natural wrapping, `min-width: 0`, and local overflow containment.
- The lab is `noindex,nofollow`, excluded from generated sitemaps, and absent from production navigation.

### Verification Gates

1. The dependency-free static verifier must pass for exactly the eight nested routes at root and optional non-root bases.
2. Safe Astro build must pass without content preparation or sync.
3. Implementation QA must inspect geometry before screenshots at 390px, 768px, and 1440px.
4. Browser QA must cover keyboard focus, TOC anchors, code/table scrolling, 200% zoom, and reduced motion before the lab can be called visually complete.

### Accepted Debt

| ID | Item | Affected users / risk | Why accepted now | Owner / exit condition |
|---|---|---|---|---|
| FN-D01 | System serif and CJK font metrics vary across Windows and macOS. | Readers may see different line wraps, but no content may be lost. | The isolated lab adds no font files or dependencies. | Implementation owner; close after 390/768/1440 visual QA on Windows and one WebKit/macOS-equivalent environment, or after a separately approved local font strategy. |
| FN-D02 | This RED phase has no rendered Field Notebook surface. | Visual geometry, sticky behavior, and actual focus rendering cannot yet be observed. | Routes/components/styles are explicitly out of scope for this phase. | Implementation owner; this debt blocks visual sign-off and closes only with fresh browser evidence. |
| FN-D03 | The Node verifier checks static invariants, not a full accessibility tree or computed layout. | Screen-reader, zoom, and runtime layout failures remain possible. | No dependency or browser harness is being added in this baseline. | QA owner; close with browser accessibility/geometry checks. The static verifier must remain in place afterward. |

No WCAG violation is accepted as design debt. Any discovered Critical or Major accessibility barrier blocks completion rather than entering this table.

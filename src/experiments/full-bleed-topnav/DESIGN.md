# Full-Bleed Top Navigation Blog Experiment

Status: approved implementation contract for the isolated Astro route `/lab/full-bleed-topnav/`.

This document governs only the experiment rooted at `.full-bleed-topnav-page`. It is not a production redesign and does not authorize changes to `Layout.astro`, production pages, shared styles, content, dependencies, or package/config files beyond the two exact isolated exceptions named below: add the dedicated npm verifier script, and exclude only `/lab/full-bleed-topnav/` from the existing sitemap filter.

## 1. Visual Thesis

Keep the Dead Soul Insects atmosphere: a cold near-black canvas, blue-violet residual light, pale text, translucent depth, and restrained glow. Change the composition, not the identity. The memorable device is an uninterrupted sequence of viewport-wide tonal bands and luminous horizontal rules, with editorial copy held inside a quiet reading measure.

The page must read as a full-bleed publication index, not as the current card system made wider:

- The top navigation, hero, topic band, chronology band, row rules, and footer rule span the viewport.
- Only the inner copy frame is width-constrained; it has no background, border, radius, or shadow.
- Topic and article entries are asymmetric rows separated by full-width rules. They are never rounded cards.
- Depth comes from tonal band changes, translucency, the inherited static canvas glow, and rules. Content surfaces do not float.

**Structural acceptance test:** at 1440px, removing the inner copy from view must still leave distinct hero, topic, and chronology bands touching both viewport edges. If the page can be described as one centered shell containing large panels, the implementation fails this contract.

## 2. Production Sources And Inheritance

The experiment extracts the existing implicit system rather than introducing a new brand direction:

- [`Layout.astro`](../../layouts/Layout.astro): production palette, font stack, glass treatment, focus ring, brand, top-navigation labels/order, footer line, and base-aware navigation behavior.
- [`blog.astro`](../../pages/blog.astro): sole content prototype, section sequence, copy, counts, topic rows, standalone article rows, and conditional rendering.
- [`archive.astro`](../../pages/archive.astro), [`docs.astro`](../../pages/docs.astro), and [`categories/index.astro`](../../pages/categories/index.astro): rule-led list rhythm, date treatment, semantic lists, long-text wrapping, and responsive stacking precedents.
- [`content.ts`](../../utils/content.ts), [`topics.ts`](../../utils/topics.ts), and [`paths.ts`](../../utils/paths.ts): real collection ordering, topic grouping, date formatting, slugs, and base-safe URLs.

### Inherited Direction

- Dark-only color scheme.
- Existing `Inter`, `Segoe UI`, and CJK system font stack; no font download or new type dependency.
- Cool violet and cyan accents, pale primary text, blue-grey secondary text.
- Translucency remains atmospheric, but blur is reserved for the top navigation band.
- Focus treatment remains a high-contrast cyan outline.
- Production brand and navigation contract remains: `Dead Soul Insects`, `个人博客 / 笔记 / 项目`, then `博客`, `项目`, `文档`, `起源`, `关于` in that order.

## 3. Local Tokens

All experiment tokens are declared on `.full-bleed-topnav-page` and use the `--fb-` prefix. Raw visual values may appear only in that local declaration block; component rules consume tokens. These are local copies of production decisions, not additions to the production token set.

### Color And Material

| Token | Locked source/value | Role |
| --- | --- | --- |
| `--fb-canvas` | production `--bg`: `#070811` | Page canvas |
| `--fb-canvas-deep` | production lower canvas: `#05060d` | Canvas gradient end |
| `--fb-surface` | production `--panel`: `rgba(18, 23, 37, 0.78)` | Topic band and navigation tint |
| `--fb-surface-strong` | production `--panel-strong`: `rgba(24, 31, 51, 0.92)` | Hover/focus tonal emphasis |
| `--fb-rule` | production `--line`: `rgba(153, 176, 255, 0.16)` | Default viewport and row rules |
| `--fb-rule-strong` | production `--hover-border`: `rgba(157, 140, 255, 0.3)` | Interactive row emphasis |
| `--fb-text` | production `--text`: `#edf2ff` | Headings and primary labels |
| `--fb-text-soft` | production `--text-soft`: `#a4b0d3` | Body, dates, and metadata |
| `--fb-accent` | production `--accent`: `#9d8cff` | Violet semantic accent |
| `--fb-accent-cool` | production `--accent-soft`: `#6ec3ff` | Links, kickers, and focus-adjacent emphasis |
| `--fb-glow-violet` | production canvas glow: `rgba(114, 92, 255, 0.18)` | Static top-left atmosphere |
| `--fb-glow-cyan` | production canvas glow: `rgba(52, 132, 255, 0.15)` | Static top-right atmosphere |
| `--fb-band-hero` | `color-mix(in srgb, var(--fb-surface) 24%, transparent)` | Hero band fill |
| `--fb-band-topic` | `color-mix(in srgb, var(--fb-surface) 64%, transparent)` | Topic band fill |
| `--fb-band-chronology` | `color-mix(in srgb, var(--fb-canvas) 82%, transparent)` | Chronology band fill |
| `--fb-row-hover` | `color-mix(in srgb, var(--fb-surface-strong) 52%, transparent)` | Full-row hover/focus wash |
| `--fb-nav-blur` | production `--glass-blur`: `blur(18px)` | Top navigation only |
| `--fb-focus-ring` | production `--focus-ring`: `2px solid rgba(110, 195, 255, 0.9)` | Every keyboard-focusable control |
| `--fb-focus-offset` | production `--focus-offset`: `3px` | Focus clearance |

The canvas uses the production three-layer recipe: violet radial light at top-left, cyan radial light at top-right, then a vertical `--fb-canvas` to `--fb-canvas-deep` gradient. It is static. No new color literals are permitted.

### Typography

| Token group | Locked values | Use |
| --- | --- | --- |
| `--fb-font-sans` | `Inter, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` | Entire experiment |
| `--fb-display-size`, `--fb-display-leading`, `--fb-display-weight` | `clamp(2.75rem, 7vw, 6.25rem)`, `0.98`, `800` | Hero title |
| `--fb-section-size`, `--fb-section-leading`, `--fb-section-weight` | `clamp(1.5rem, 3vw, 2.25rem)`, `1.12`, `700` | Band headings |
| `--fb-row-size`, `--fb-row-leading`, `--fb-row-weight` | `clamp(1.15rem, 2vw, 1.5rem)`, `1.28`, `700` | Topic and article titles |
| `--fb-lead-size`, `--fb-lead-leading`, `--fb-lead-weight` | `1.0625rem`, `1.75`, `400` | Hero lead and band notes |
| `--fb-body-size`, `--fb-body-leading`, `--fb-body-weight` | `1rem`, `1.75`, `400` | Descriptions |
| `--fb-meta-size`, `--fb-meta-leading`, `--fb-meta-weight` | `0.875rem`, `1.5`, `600` | Dates, kickers, and counts |
| `--fb-kicker-tracking` | `0.12em` | Kicker tracking |

Kickers use `--fb-kicker-tracking` and the cool accent. Display and section headings use `text-wrap: balance`; row titles and body copy use natural wrapping. No text is line-clamped or ellipsized.

### Spacing And Geometry

The local spacing scale is based on 4px: `--fb-space-1: 0.25rem`, `--fb-space-2: 0.5rem`, `--fb-space-3: 0.75rem`, `--fb-space-4: 1rem`, `--fb-space-6: 1.5rem`, `--fb-space-8: 2rem`, `--fb-space-12: 3rem`, `--fb-space-16: 4rem`, and `--fb-space-24: 6rem`.

| Token | Value | Use |
| --- | --- | --- |
| `--fb-inner-max` | `72.5rem` | Production-equivalent maximum alignment width |
| `--fb-copy-measure` | `40rem` | Lead and description measure |
| `--fb-gutter` | `clamp(var(--fb-space-4), 4vw, var(--fb-space-16))` | Viewport-safe inline gutter |
| `--fb-band-pad` | `clamp(var(--fb-space-12), 7vw, var(--fb-space-24))` | Band block rhythm |
| `--fb-row-pad` | `clamp(var(--fb-space-4), 2.5vw, var(--fb-space-8))` | Rule-row block rhythm |
| `--fb-rule-size` | `1px` | Band and row separators |
| `--fb-target-min` | `2.75rem` | 44px minimum interactive dimension |
| `--fb-motion-fast` | `160ms` | Maximum opacity-transition duration |
| `--fb-motion-ease` | `ease-out` | Affordance-indicator opacity easing |

Browser mechanics such as `auto`, percentages, `minmax(0, 1fr)`, intrinsic sizing, and media-query breakpoints remain un-tokenized. There is deliberately no content-card radius or content-card shadow token.

## 4. Content Jobs And Data Contract

Real production blog data and production ordering are reused. The implementation calls `getSortedPosts()`, passes its result to `getTopicGroups(posts)`, and derives `standalonePosts` with the same empty-topic filter used by `blog.astro`. It must not copy content into a local array, invent mock entries, or re-sort either output.

Consequently:

- All posts originate in the `blog` content collection and begin in descending publication order.
- Topic groups retain `getTopicGroups()` ordering, currently `localeCompare(..., 'zh-CN')` by topic name.
- Standalone articles retain descending publication order from `getSortedPosts()`.
- Topic name, article count, post title, post description, and formatted date use the same production fields and utilities. A missing topic description uses the production fallback `继续沿着同一条内容线索往下读。`.
- Empty topic or chronology bands are omitted, matching production conditional rendering; no invented empty-state copy is shipped.

| Sequence | Content block | Job |
| --- | --- | --- |
| 0 | Top navigation | Preserve site identity and navigate to real production sections |
| 1 | Hero band | Hook with the production blog title/lead, explain the browsing model, and prove scale with live article/topic counts |
| 2 | Topic band | Navigate by established topic before chronological browsing; show topic name, real description/fallback, and count |
| 3 | Chronology band | Let readers scan standalone posts by date, title, and description in production order |
| 4 | Footer band | Retain the production line `Where Dead Souls Still Glow` and close the page with a viewport rule |

## 5. Document And Layout Primitives

The DOM hierarchy must preserve this ownership model:

```text
body.full-bleed-topnav-page
  a.fb-skip-link
  header.fb-topnav-band
    .fb-inner (brand + main navigation)
  main#main-content
    section.fb-band.fb-hero-band
      .fb-inner (hero editorial grid)
    section.fb-band.fb-topic-band
      .fb-inner (band heading)
      ul.fb-rule-list
        li.fb-rule-row
          a.fb-row-link > .fb-inner > .fb-row-grid (asymmetric topic row)
    section.fb-band.fb-chronology-band
      .fb-inner (band heading)
      ol.fb-rule-list
        li.fb-rule-row
          a.fb-row-link > .fb-inner > .fb-row-grid (asymmetric article row)
  footer.fb-footer-band
    .fb-inner
```

### Viewport Shell

- `.full-bleed-topnav-page` owns the canvas and document flow; there is no centered outer shell.
- `.fb-band`, `.fb-topnav-band`, `.fb-rule-row`, and `.fb-footer-band` use `inline-size: 100%` in normal flow. Do not use `100vw`, negative-margin breakout tricks, or clipped overflow.
- Every band owns its background and full-width block rule. Adjacent boundaries render one rule, not doubled rules.
- `.fb-rule-list` resets margin, padding, and list markers but remains full-width; its direct `li` elements own the separators.

### Inner Frame

- `.fb-inner` supplies only `max-inline-size: var(--fb-inner-max)`, auto inline margins, and `var(--fb-gutter)` inline padding.
- It never receives a panel background, border, radius, shadow, or blur.
- Text columns inside it use `max-inline-size: var(--fb-copy-measure)`; the frame itself may remain wide enough to establish asymmetry.

### Top Navigation Band

- Reproduce the production brand text, subtitle, link labels, order, destinations, `aria-label="主导航"`, and exact-path `aria-current` behavior inside an edge-to-edge translucent band.
- Destinations are locked to brand `/`, then `博客` `/blog`, `项目` `/projects`, `文档` `/docs`, `起源` `/origin`, and `关于` `/about`.
- The band is square-cornered, uses `--fb-nav-blur`, and has a single bottom rule. No other band uses blur.
- Navigation items are 44px-minimum text links with transparent resting backgrounds. Hover, focus, and current states use text/rule emphasis, never rounded pills.
- The brand links home. Internal links are generated through `withBase(import.meta.env.BASE_URL, ...)`.
- Because the lab URL is not a production navigation destination, no item receives a false `aria-current="page"`; the hero provides the blog context.
- At `>= 64rem` the band is sticky at the viewport top. Below `64rem`, including 768px and 200% reflow, it remains in normal document flow so wrapped navigation cannot obscure content.

### Hero Band

- Use the production kicker, heading, lead, explanatory note, and live counts.
- Desktop uses an asymmetric 12-column editorial grid: primary copy occupies columns 1-7; a rule-led `dl` of counts and the note occupy columns 9-12. Column 8 remains deliberate breathing room.
- Counts are plain definition-list rows separated by rules, never mini cards or pills.
- The title may be oversized, but its copy and lead remain measure-constrained and never overlap the count column.

### Topic Rows

- The topic band owns a subtle translucent tonal shift distinct from the hero and chronology bands.
- Each `.fb-rule-row` owns a full-viewport top rule; the last row also closes the list with a bottom rule.
- Desktop row anatomy is asymmetric: narrow type label at left, topic title/description in the dominant middle column, count at right.
- The entire inner row is one anchor to the real topic route. No nested controls.

### Article Rows

- The chronology band returns toward the canvas tone so the topic and chronology sections are distinguishable without cards.
- Each row uses the same full-width rule ownership as topics but a different grid: date at left, title/description in the dominant right field.
- Use semantic `<time datetime>` values from `formatDateTime()` and visible dates from `formatDate()`.
- The entire inner row is one anchor to the real article route. No row number, badge, thumbnail, or invented metadata is added.

## 6. Responsive Behavior

| State | Contract |
| --- | --- |
| Desktop, `>= 64rem` | 12-column hero; three-field topic rows; two-field chronology rows; generous band rhythm; sticky top navigation; copy remains within measure while rules and band fills reach viewport edges. |
| Tablet, `40.0625rem-63.9375rem` | Navigation is non-sticky and wraps without reordering. Hero becomes one column with a horizontally distributed count list below the copy. Topic rows keep a compact label/content/count grid; chronology keeps date/content. Section notes move below headings. |
| Mobile, `<= 40rem` | Navigation and brand stack and the header becomes non-sticky. Navigation wraps in DOM order with no horizontal scroller. Hero, counts, topic rows, and chronology rows become one column. Metadata precedes titles, counts align left, and band/row rules remain edge-to-edge. |

At all widths:

- No fixed block height, absolute content positioning, line clamp, or primary-content `overflow: hidden` is allowed.
- Grid children use `min-inline-size: 0` and text uses `overflow-wrap: anywhere`; normal CJK wrapping remains enabled and long unbroken Latin strings may break rather than widen the viewport.
- Every navigation and row link has at least `var(--fb-target-min)` by `var(--fb-target-min)` of interactive area.
- At 200% browser zoom on a 1440px viewport, the result follows the tablet/reflow contract and has no two-dimensional scrolling.

## 7. Interaction And Motion

- The page has no sorting control, tuning controls, menu toggle, or client-side state. Reading order is fixed by production data utilities.
- Hover may strengthen a row rule, apply a token-derived tonal wash, and change the title to `--fb-accent-cool`. It must not lift, scale, slide, or become card-like.
- `:active` keeps geometry stable and increases tonal contrast only.
- `:focus-visible` uses `--fb-focus-ring` and `--fb-focus-offset`; focus is never communicated by color alone. Navigation links carry their own ring. A focused full-width row draws the ring on its gutter-inset `.fb-row-grid`, not outside the viewport, so no band or list boundary can clip it.
- If an affordance indicator fades, only `opacity` may transition with `--fb-motion-fast` and `--fb-motion-ease`. There are no load, reveal, scroll, glow, particle, or decorative animations.
- Under `prefers-reduced-motion: reduce`, all transitions are removed. Layout and every state remain otherwise identical.

## 8. Accessibility Contract

- Target WCAG 2.2 AA: at least 4.5:1 for normal text and 3:1 for large text and meaningful non-text boundaries.
- Set `lang="zh-CN"` and `<meta name="viewport" content="width=device-width, initial-scale=1">`, include a visible-on-focus skip link to `#main-content`, use one `h1`, ordered `h2` sections, semantic lists, and labelled sections.
- Keyboard order is skip link, brand, production navigation links, topic links, article links. It follows visual and DOM order without positive `tabindex`.
- Keep all targets at least 44px in both dimensions, including wrapped mobile navigation links.
- Counts and dates remain available to assistive technology; do not hide information needed to distinguish rows.
- Long CJK titles, spaced Latin titles, and unbroken Latin strings wrap without collision, truncation, overlap, or horizontal page scrolling.
- The local document head includes `<meta name="robots" content="noindex,nofollow">`. Do not emit a canonical URL for the lab route.
- All internal navigation, topic, article, home, and favicon URLs are base-safe. Use the shared `withBase()` helper rather than root-relative string literals.

## 9. Isolation

- All UI implementation code lives under `src/experiments/full-bleed-topnav/` with only a thin route entry at `src/pages/lab/full-bleed-topnav/index.astro` when implementation begins. The only other authorized edits are adding the dedicated npm verifier script and changing the existing sitemap filter solely to exclude `/lab/full-bleed-topnav/`; no dependency, unrelated script, or other configuration change is permitted.
- Use an experiment-local Astro document shell so the route can own `noindex` metadata without changing `Layout.astro`. Reproduce only the production top-navigation contract and local token values named here.
- The body carries the sole root class `.full-bleed-topnav-page`; descendant classes use the `fb-` prefix.
- Every selector begins with `.full-bleed-topnav-page`. Do not declare global `:root`, `html`, generic `body`, `.site-*`, `.page-*`, or shared component rules.
- Do not import Field Notebook styles or any other experiment's visual language.
- Do not mutate, duplicate, or reorder collection data. Imported production utilities remain read-only inputs.

## 10. Accepted Debt

| Debt | Why accepted | Exit condition |
| --- | --- | --- |
| The local document shell duplicates the production brand/navigation markup and a small locked token subset. | Isolation and route-level `noindex` are required, while `Layout.astro` must remain untouched. | Delete the experiment, or consolidate only after the direction is explicitly approved for production. |
| The experiment does not extract shared band/row components. | Its structure is intentionally unproven and must not enlarge the production component surface yet. | Extract primitives only if a production rollout is separately approved and at least two production routes will use them. |

No accessibility debt is accepted. Any contrast, focus, touch-target, reflow, or content-wrapping failure blocks approval.

## 11. Required QA States

These are implementation gates, not evidence claimed by this document.

| Named state | Pass criteria |
| --- | --- |
| `QA-1440-FULL-BLEED` | At 1440px, navigation, hero/topic/chronology fills, all band boundaries, every row rule, and footer rule touch both viewport edges; `.fb-inner` never exceeds `--fb-inner-max`; asymmetry is visibly structural rather than a centered stack of wider cards. |
| `QA-768-TABLET` | At 768px, hero and section headers reflow as specified; topic/article grids remain readable; the non-sticky wrapped navigation cannot cover focused or anchored content; no horizontal overflow. |
| `QA-390-MOBILE` | At 390px, navigation wraps in order, all targets measure at least 44px, rows are single-column, dates/counts remain associated with the right entry, and rules still reach both edges. |
| `QA-375-MOBILE` | At 375px, the same mobile contract holds with no clipped focus ring, orphaned heading, collision, fixed-height crop, or horizontal scrolling. |
| `QA-200-PERCENT-REFLOW` | At 200% zoom on a 1440px viewport, the layout behaves like a roughly 720-CSS-pixel view: one-dimensional document scrolling only, readable text, reachable navigation, and no overlap. |
| `QA-KEYBOARD-FOCUS` | Tab from the skip link through brand, five navigation links, topic rows, and article rows. Focus order matches reading order; every ring is visible at all four edges; Enter follows the correct base-safe URL. |
| `QA-REDUCED-MOTION` | With reduced motion enabled, no transitions or animations run; hover, active, focus, sticky/mobile behavior, and information hierarchy remain clear. |
| `QA-LONG-TITLE-STRESS` | In a temporary, uncommitted QA state, stress a topic and article with a multi-line CJK title and a long unbroken Latin token. Both wrap inside `minmax(0, 1fr)` without truncation, overlap, rule displacement, or viewport widening. |

## 12. Explicit Anti-Patterns

Do not implement any of the following:

- A centered `.page-shell` wrapping the experiment, or any full-page max-width container.
- Production `.page-card`, `.entry-card`, `.topic-card`, `.post-card`, or visually equivalent wider cards.
- Rounded content cards, card grids, bento layouts, floating panels, shadow stacks, or count pills.
- A left rail, sidebar navigation, or the Field Notebook paper palette.
- `100vw` breakout hacks, negative margins, clipped overflow, fixed viewport heights, or absolute-positioned primary content.
- Tuning panels, sliders, reset/undo controls, debug labels, or playground scripts.
- Decorative animation, starfields, particles, parallax, reveal choreography, or moving glows.
- New dependencies, React, Tailwind, a UI framework, or a new font.
- Copied mock content, locally duplicated blog data, invented metadata, or changed production ordering.
- Global style leakage, unprefixed experiment classes, or edits to production pages, `Layout.astro`, shared styles, content, deployment, or package/config files other than the dedicated npm verifier script and the single `/lab/full-bleed-topnav/` exclusion in the existing sitemap filter.

## 13. Definition Of Done

Implementation is conformant only when every visual value resolves through a `--fb-` token, every band and rule passes the viewport-span checks, inner copy remains measure-constrained, real blog data and ordering are unchanged, all links are base-safe, the route is `noindex,nofollow`, and every named QA state passes. Build success alone is not approval.

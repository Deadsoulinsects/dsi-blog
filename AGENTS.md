\# AGENTS.md



> Purpose: give opencode / AI coding agents short, stable project rules with low context usage.



\## Project Overview



This is an Astro-based personal static blog named \*\*Dead Soul Insects\*\*. It publishes blog posts, documentation, project notes, and origin/about pages. Content is Markdown-driven and includes scripts for syncing content from a local Obsidian vault.



Keep the default architecture as an Astro static site. Do not make the project more complex without a reason. If the user asks for optimization, long-term planning, architecture upgrades, or complex features, propose a plan first and explain benefits, cost, affected files, and risks before making major changes.



\## Tech Stack



\* Astro

\* TypeScript

\* Markdown / Astro Content Collections

\* npm

\* GitHub Pages



\## Common Commands



```bash

npm run dev         # local development

npm run build       # build check

npm run preview     # preview built site

npm run links:check # check Markdown links

```



Do not run this unless the user explicitly asks:



```bash

npm run publish

```



`publish` may build, commit, and push changes.



\## Work Modes



\### Maintenance Mode



For bugs, text edits, style tweaks, pages, and posts. Keep changes minimal. Preserve the current structure. Do not perform unrelated refactors.



\### Suggestion Mode



When the user has no clear plan, asks for optimization, or discusses long-term growth, proactively suggest improvements for structure, features, UI, SEO, performance, or content workflow. Give a plan before large code changes.



\### Architecture Upgrade Mode



For new dependencies, new frameworks, complex features, deployment changes, directory refactors, or content-system changes. Explain the goal, affected files, risks, and rollback path before editing.



\## Directory Rules



\* `src/pages/`: route pages.

\* `src/layouts/`: site layouts; edit carefully.

\* `src/content/blog/`: blog Markdown content.

\* `src/content/docs/`: documentation Markdown content.

\* `src/content.config.ts`: content collection schema; edit carefully.

\* `scripts/`: sync, preprocessing, and publishing scripts; high-risk area.

\* `public/`: static assets; adding is safe, deleting requires care.

\* `.github/workflows/`: deployment config; do not edit by default.



Never edit generated, dependency, or Git internal directories:



\* `dist/`

\* `.astro/`

\* `node\_modules/`

\* `.git/`



\## Content Rules



Blog posts belong in `src/content/blog/`. Documentation pages belong in `src/content/docs/`.



When adding or editing Markdown, keep valid frontmatter. Use `YYYY-MM-DD` dates. Do not remove title, description, category, tags, or other metadata without a reason. Do not publish private raw Obsidian notes directly into public content directories.



Preserve Chinese filenames, Chinese paths, and existing Chinese content. Do not rename them into pinyin, English, or escaped forms unless requested.



\## Obsidian Sync Rules



The project includes Obsidian sync scripts. Local Windows paths inside these scripts are part of the user's personal workflow. Do not change them by default.



In non-user environments, sync scripts may warn that the source directory does not exist. This is usually not a source-code error. Do not rewrite scripts just to remove that warning.



\## UI and Styling Rules



Preserve the current visual direction: dark background, cool colors, translucent panels, rounded cards, subtle glow, and restrained animation.



Do not introduce new UI frameworks, Tailwind, React, or large dependencies by default. If there is a long-term benefit, explain the purpose, alternatives, necessity, and impact before adding them.



\## Code Change Rules



Make changes small and clear. Read relevant files before editing. Do not refactor the whole project for a small request.



Do not do the following by default unless the user explicitly asks or the task truly requires it:



\* Change site domain or deployment config

\* Change GitHub Actions

\* Change publishing scripts

\* Change existing routes

\* Mass rename files

\* Delete existing Chinese content

\* Add large dependencies

\* Batch delete or move files



Before deleting files, mass renaming, changing deployment, changing publishing flow, changing dependencies, or changing the content system, explain the impact first.



Before adding a dependency, explain its purpose, alternatives, and necessity. Prefer Astro, native CSS, and native JavaScript for small features.



After changes, try to run:



```bash

npm run links:check

npm run build

```



If validation fails, report the exact failure. Do not claim success without verification.



\## Beginner Collaboration Rules



The user is still learning programming and project architecture. For non-trivial changes, explain why the change is needed, which files changed, and what risks exist.



When the user has no clear plan, suggest phased options: short-term fix, medium-term improvement, and long-term upgrade.



\## Known Notes



If build fails with `Permission denied`, it may be caused by archive extraction or cross-platform permissions on `node\_modules/.bin/\*`. Prefer reinstalling dependencies before changing source code.



\## Final Response Format



After modifying code, briefly report:



\* What changed

\* Which files changed

\* Whether validation commands were run

\* Remaining risks or follow-up suggestions



\## Agent Principles



1\. Small tasks: edit directly and keep changes minimal.

2\. Complex tasks: propose a plan before major changes.

3\. Never edit generated directories, dependency directories, Git data, or high-risk publishing flow.

4\. Preserve the Astro + Markdown + Obsidian workflow unless the user requests an architecture upgrade.

5\. After changes, summarize changed files, validation results, and remaining risks.




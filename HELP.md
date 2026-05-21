# Help — Gists Index

A browsable, tag-based index for your [GitHub Gists](https://gist.github.com), built from Markdown and GitHub Actions. Fork this repo, set your username, tag your gists with `(tags:...)`, and the index updates automatically.

---

## What this does

This repo scans your gists, reads structured metadata from each gist **description**, and generates:

- **`README.md`** — landing page listing all tags (and untagged gists) with counts
- **`tags/<tag>.md`** — one page per tag, linking to each matching gist
- **`tags/untagged.md`** — gists with no `(tags:...)` block (when enabled)

Everything is plain Markdown in the repo—no database, no hosted app. Browse the index on GitHub (or GitHub Pages later).

---

## Tagging format (required reading)

**Only these two metadata blocks are supported.** Hashtags such as `#python` or `#cli` are **not** parsed and will be ignored for indexing.

### `(tags:tag1, tag2, ...)`

- Wrap tags in a single `(tags:...)` block.
- Separate tags with commas.
- Spaces before and after each tag are trimmed (`tags: foo , bar` → `foo`, `bar`).
- Tag names are lowercased for grouping; filenames use URL-safe slugs (`node.js` → `tags/node-js.md`).
- A gist with **no** `(tags:...)` block is listed under **Untagged** when `includeUntagged` is true.

### `(about:...)`

- Optional short summary shown after the gist link on index pages.
- Text inside `(about:...)` is trimmed.

### Title

- Any text in the description **outside** `(tags:...)` and `(about:...)` becomes the display title.
- If nothing remains, the first filename or gist ID is used.

### Examples

**Tagged gist:**

```text
Bulk rename utility (tags:powershell, automation) (about:Recursively rename files by pattern)
```

**Minimal (tags only):**

```text
(tags:unity, editor)
```

**Untagged** (no `(tags:...)` — appears on Untagged page only):

```text
Quick scratch snippet (about:Work in progress)
```

**Invalid for tagging** (hashtags are not read):

```text
My snippet #python #cli (about:This about line is ignored for tags)
```

Use `(tags:python, cli)` instead.

### Rendered entry on a tag page

```markdown
- [Bulk rename utility](https://gist.github.com/you/abc123) — Recursively rename files by pattern
  Tags: `automation`
  Updated: 2026-05-21
```

---

## Quick start

1. **Fork or create** a repo (e.g. `github.com/<you>/gists` or any name—see HELP intro in repo).

2. **Edit `config.json`** — set your GitHub username:

   ```json
   {
     "username": "your-github-username"
   }
   ```

3. **Annotate gists** on [gist.github.com](https://gist.github.com) using `(tags:...)` and optional `(about:...)`.

4. **Push** and enable **Actions** for the repo.

5. **Run** **Actions → Update Gist Index → Run workflow** (or wait for the daily schedule).

6. Open **`README.md`** to browse the index.

No API token required for public gists.

_Run the update workflow or `npm run update` after configuring `config.json` to generate the index._

---

## Configuration (`config.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `username` | — | GitHub user whose **public** gists to index |
| `includePrivate` | `false` | Index private gists (requires `GIST_TOKEN`) |
| `includeUntagged` | `true` | List gists without `(tags:...)` on `tags/untagged.md` |
| `sortTagsBy` | `alphabetical` | Tag order on the index (see below) |
| `sortGistsBy` | `updated-desc` | Newest-updated gists first on tag pages |
| `showUpdatedDate` | `true` | Show `Updated: YYYY-MM-DD` per gist |
| `showSecondaryTags` | `true` | Show other tags on each line |
| `generateHtml` | `true` | Generate `docs/` HTML for GitHub Pages |
| `generatedFileHeader` | HTML comment | Marks auto-generated Markdown (do not remove) |

### `sortTagsBy` values

Controls tag order on `README.md` and the HTML index (`docs/index.html`). **Untagged** is always listed last when present.

| Value | Sort order |
|-------|------------|
| `alphabetical` | Same as `alphabetical-desc` (default) |
| `alphabetical-desc` | Tag name Z → A |
| `alphabetical-asc` | Tag name A → Z |
| `count` | Same as `count-desc` |
| `count-desc` | Most gists first; ties broken A → Z |
| `count-asc` | Fewest gists first; ties broken A → Z |

Example:

```json
"sortTagsBy": "count-desc"
```

---

## Optional: private gists & API limits

1. Create a [Personal Access Token](https://github.com/settings/tokens) with **gist** read access.
2. Add repo secret `GIST_TOKEN`.
3. Set `"includePrivate": true` in `config.json`.

---

## Run locally

```bash
npm ci
npm run update
```

With a token:

```bash
# PowerShell
$env:GIST_TOKEN="ghp_xxx"; node scripts/update-index.js

# bash
GIST_TOKEN=ghp_xxx node scripts/update-index.js
```

---

## How it works

```text
Gist descriptions with (tags:...) and (about:...)
        │
        ▼
GitHub Actions (daily or manual)
        │
        ▼
scripts/update-index.js → README.md + tags/*.md → auto-commit
```

**Parsing rules:**

1. Read tags only from `(tags:tag1, tag2, ...)` (comma-separated, trimmed).
2. Read summary from `(about:...)` if present.
3. Remove both blocks from the description to derive the title.
4. No `(tags:...)` → **Untagged** only (gists with at least one tag never appear there).

---

## Customizing output

### Markdown (`templates/`)

| File | Placeholders |
|------|----------------|
| `README.md` | `[USERNAME]`, `[LAST_UPDATED]`, `[GENERATED_TAGS]` |
| `TAG.md` | `[TAG]`, `[GENERATED]` |
| `UNTAGGED.md` (optional) | `[GENERATED]` — only gists with **no** `(tags:...)` |

### HTML index (`templates/index.html`)

| Placeholder | Replaced with |
|-------------|----------------|
| `[USERNAME]` | Username (plain text; e.g. footer URL) |
| `[GISTS_LINK]` | Linked phrase: `username's GitHub Gists` → gist.github.com (new tab) |
| `[LAST_UPDATED]` | Index run timestamp |
| `[GENERATED_TAGS]` | HTML tag list (`<ul class="tag-list">…`) |

Tag pages use built-in HTML layout (`templates/TAG.html` not required).

### Colors (`pages.json`)

Edit **`pages.json`** at the repo root (not overwritten by the script):

| Field | Default | Used for |
|-------|---------|----------|
| `backgroundColor` | `#fafafa` | Page background |
| `textColor` | `#1a1a1a` | Body text |
| `textColorSecondary` | `#666666` | About, meta, dates, footer |
| `linkColor` | `#0969da` | Links |
| `borderColor` | `#e8e8e8` | List dividers |

Regenerated each run: `docs/style.css` (from `pages.json`).

**Safe to edit:** `templates/`, `pages.json`, `HELP.md`, `config.json`

**Do not edit by hand:** `README.md`, `tags/*.md`, `docs/index.html`, `docs/tags/*.html`, `docs/style.css`

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Gist not on any tag page | Description must use `(tags:...)` — not `#hashtags` |
| Empty index | Wrong `username` or no gists for that account |
| Only Untagged | Add `(tags:tag1, tag2)` to gist descriptions |
| Workflow didn’t run | Actions enabled; workflow file present |
| Private gists missing | `includePrivate` + `GIST_TOKEN` |

---

## Project layout

```text
gists/
├── README.md              ← generated index
├── tags/                  ← generated Markdown tag pages
├── docs/                  ← generated HTML (GitHub Pages)
├── templates/             ← README.md, index.html, TAG.md, …
├── pages.json             ← HTML colors (your edits kept)
├── HELP.md
├── config.json
├── scripts/update-index.js
└── .github/workflows/update.yml
```

## GitHub Pages (HTML site)

Each index run generates a minimal site under **`docs/`** (when `generateHtml` is true in `config.json`).

1. **Enable Pages:** Repo **Settings → Pages → Deploy from branch → `/docs` folder → Save.**
2. Open **`https://<username>.github.io/<repo-name>/`** (e.g. `…/gists/` if your repo is named `gists`).
3. Custom domains: configure in Pages settings; path stays `/` for root or use your repo name as the path segment.

Gist titles open the GitHub gist in a **new tab**.

**`docs/` is cleared on every run** (auto-generated HTML and `style.css`), then rebuilt. Edit `templates/index.html` and `pages.json` to customize; those files are kept.

## Disclosure

This project was created with generative AI using Cursor.

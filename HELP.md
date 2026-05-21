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
| `sortTagsBy` | `alphabetical` | `alphabetical` or `count-desc` |
| `sortGistsBy` | `updated-desc` | Newest-updated gists first on tag pages |
| `showUpdatedDate` | `true` | Show `Updated: YYYY-MM-DD` per gist |
| `showSecondaryTags` | `true` | Show other tags on each line |
| `generateHtml` | `true` | Generate `docs/` HTML for GitHub Pages |
| `generatedFileHeader` | HTML comment | Marks auto-generated Markdown (do not remove) |

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
4. No `(tags:...)` → **Untagged** when `includeUntagged` is true.

---

## Customizing output (`templates/`)

Edit `templates/README.md` and `templates/TAG.md`. Replace `[GENERATED]` with generated lists. On tag pages, `[TAG]` is the tag name.

Optional `templates/UNTAGGED.md` for the untagged page layout (only needs `[GENERATED]`).

**Safe to edit:** `templates/`, `HELP.md`, `config.json`, workflow, `scripts/update-index.js`

**Do not edit by hand:** `README.md`, `tags/*.md` (regenerated each run)

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
├── templates/             ← customize Markdown layout
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

Gist titles open the GitHub gist in a **new tab**. Stale HTML tag pages are removed automatically when tags are dropped.

## Disclosure

This project was created with generative AI using Cursor.

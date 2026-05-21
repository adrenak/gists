# Gists Index — Design & Implementation Spec

A GitHub-native browsable index for [GitHub Gists](https://gist.github.com). Users fork this repo, annotate gist descriptions with structured metadata, and GitHub Actions regenerates Markdown index pages.

**User-facing guide:** [HELP.md](../HELP.md)  
**This document:** architecture, formats, and what the repo actually does today.

---

## Goal

Turn a user's Gists into a browsable, tag-based index using only:

- Markdown files in the repo
- GitHub Actions (scheduled + manual)
- The GitHub Gists REST API

No database, hosted backend, or custom web app required.

---

## Repository layout (as built)

```text
gists/
├── README.md                 ← generated index (do not edit)
├── tags/
│   ├── <slug>.md             ← generated, one file per tag
│   └── untagged.md           ← generated when includeUntagged is true
├── templates/
│   ├── README.md             ← layout; [GENERATED] = tag list
│   ├── TAG.md                ← layout; [TAG] + [GENERATED]
│   └── UNTAGGED.md           ← optional; untagged page layout
├── HELP.md                   ← fork/setup guide (canonical)
├── config.json
├── scripts/update-index.js
├── package.json
└── .github/workflows/update.yml
```

The repo **name on GitHub does not matter** (e.g. `gists`, `allmygists`). Only `config.json` → `username` selects whose gists are indexed.

---

## Gist description format

**Only two metadata blocks are parsed.** Hashtags (`#python`, `#cli`, etc.) are **not** supported.

### `(tags:tag1, tag2, ...)`

- Comma-separated list inside one `(tags:...)` block.
- Spaces around each tag are trimmed.
- Tags are lowercased for grouping.
- A gist with **no** `(tags:...)` is listed under **Untagged** when `includeUntagged` is true (default).

### `(about:...)`

- Optional one-line summary shown after the gist link on index pages.

### Title

- Text in the description after removing `(tags:...)` and `(about:...)`.
- Fallback: first filename in the gist, then gist ID.

### Example

```text
Bulk rename utility (tags:powershell, automation) (about:Recursively rename files by pattern)
```

Parsed as:

```json
{
  "title": "Bulk rename utility",
  "tags": ["powershell", "automation"],
  "about": "Recursively rename files by pattern"
}
```

### Parsing implementation

```js
const TAGS_RE = /\(tags:([^)]*)\)/i;
const ABOUT_RE = /\(about:([^)]*)\)/i;
```

Tags are split on `,`, trimmed, empty segments dropped, then deduplicated.

---

## Generated output

### `README.md`

- Built from `templates/README.md` when present.
- `[GENERATED]` is replaced with `_Last updated: …_` plus the tag list.
- Each line: `- [tag name](tags/<slug>.md) — N gists`
- **Untagged** is listed last when applicable.

### `tags/<slug>.md`

- One page per active tag; slug from `tagToSlug()`:
  - Lowercase
  - `.` → `-` (e.g. `node.js` → `node-js`)
  - `+` → `p` (e.g. `C++` → `cpp`)
  - Other non-alphanumeric characters removed
- Built from `templates/TAG.md` (`[TAG]`, `[GENERATED]`) or built-in fallback.
- Gists sorted by `updated_at` descending (configurable via `sortGistsBy`).
- Optional per-line: secondary tags, `Updated: YYYY-MM-DD`.

### `tags/untagged.md`

- Gists with no `(tags:...)` block.
- Uses `templates/UNTAGGED.md` if present, else built-in layout.

### Stale file cleanup

After each run, the script removes generated `.md` files under `tags/` that:

- Start with `generatedFileHeader` from `config.json`, and
- No longer correspond to an active tag (or untagged page is no longer needed).

Legacy tag `.md` files mistakenly left in the repo root are also removed.

---

## Configuration (`config.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `username` | `""` | GitHub user whose public gists to index |
| `includePrivate` | `false` | Use `GIST_TOKEN` + `/gists` API for authenticated user's gists |
| `includeUntagged` | `true` | Generate `tags/untagged.md` for gists without `(tags:...)` |
| `sortTagsBy` | `alphabetical` | `alphabetical` or `count-desc` |
| `sortGistsBy` | `updated-desc` | Newest first on tag pages |
| `showUpdatedDate` | `true` | Show update date on each entry |
| `showSecondaryTags` | `true` | Show other tags on each gist line |
| `generatedFileHeader` | HTML comment | Marks auto-generated files for stale detection |

---

## GitHub API

**Public gists:**

```text
GET /users/{username}/gists?per_page=100
```

**Private gists** (when `includePrivate` and `GIST_TOKEN`):

```text
GET /gists?per_page=100
Authorization: Bearer <token>
```

Pagination via `Link` response header until no `next` page.

---

## GitHub Actions

**Workflow:** `.github/workflows/update.yml`

**Triggers:**

- `workflow_dispatch` (manual)
- `schedule`: `*/30 * * * *` (every 30 minutes)

**Steps:**

1. Checkout repo
2. Node 20 + `npm ci`
3. `node scripts/update-index.js` with optional `GIST_TOKEN` secret
4. `git-auto-commit-action` if files changed

**Permissions:** `contents: write`

---

## Example generated `README.md`

```md
<!-- This file is auto-generated. Do not edit manually. -->

# Gists

…

## Tags

_Last updated: 2026-05-21 14:00 UTC_

- [automation](tags/automation.md) — 3 gists
- [powershell](tags/powershell.md) — 5 gists
- [Untagged](tags/untagged.md) — 2 gists
```

## Example generated `tags/powershell.md`

```md
# Gists tagged `powershell`

_Back to [all tags](../README.md)._

## Gists

- [Bulk rename utility](https://gist.github.com/user/abc123) — Recursively rename files
  Tags: `automation`
  Updated: 2026-05-21
```

---

## Implemented MVP

- [x] Public gist indexing by `username`
- [x] `(tags:...)` and `(about:...)` parsing (no hashtags)
- [x] `README.md` + `tags/*.md` generation
- [x] Untagged category (`includeUntagged`)
- [x] Customizable `templates/` with `[GENERATED]` placeholders
- [x] Stale tag page cleanup
- [x] Scheduled + manual GitHub Action updates
- [x] Optional private gists via `GIST_TOKEN`
- [x] Local run via `npm run update`

---

## Not implemented (future ideas)

- GitHub Pages as default hosting
- Tag aliases / nested groups
- Search page, JSON export, RSS
- Badge with gist count
- Configurable output directory
- Language badges, tag cloud, favorites

---

## Design principles

- GitHub-native, Markdown-first
- Easy to fork and understand
- Low maintenance
- No OAuth beyond optional PAT for private gists

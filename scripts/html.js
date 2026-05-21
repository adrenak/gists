import fs from "node:fs/promises";
import path from "node:path";

const HTML_MARKER = "<!-- gists-index:auto -->";

const STYLES = `/* gists-index */
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  line-height: 1.5;
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  color: #1a1a1a;
  background: #fafafa;
}
@media (prefers-color-scheme: dark) {
  body { color: #e8e8e8; background: #111; }
  a { color: #7eb8ff; }
  .meta, .updated, .count { color: #999; }
}
a { color: #0969da; }
a:hover { text-decoration: underline; }
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25rem; }
.subtitle, .updated { color: #666; font-size: 0.875rem; margin: 0 0 1.5rem; }
.back { font-size: 0.875rem; margin-bottom: 1rem; display: inline-block; }
.tag-list, .gist-list { list-style: none; padding: 0; margin: 0; }
.tag-list li, .gist-list li {
  padding: 0.6rem 0;
  border-bottom: 1px solid #e8e8e8;
}
@media (prefers-color-scheme: dark) {
  .tag-list li, .gist-list li { border-color: #333; }
}
.tag-list a { font-weight: 500; }
.count { color: #666; font-size: 0.875rem; }
.gist-list a { font-weight: 500; }
.about { color: #444; }
@media (prefers-color-scheme: dark) { .about { color: #bbb; } }
.meta { font-size: 0.8rem; color: #666; margin-top: 0.2rem; }
.empty { color: #666; font-style: italic; }
footer { margin-top: 2rem; font-size: 0.75rem; color: #888; }
`;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage({ title, subtitle, backHref, backLabel, body, username }) {
  const back = backHref
    ? `<a class="back" href="${escapeHtml(backHref)}">← ${escapeHtml(backLabel)}</a>`
    : "";
  const gistHub = username
    ? `https://gist.github.com/${encodeURIComponent(username)}`
    : "https://gist.github.com";
  return `${HTML_MARKER}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${backHref ? "../style.css" : "style.css"}">
</head>
<body>
  ${back}
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
  ${body}
  <footer><a href="${escapeHtml(gistHub)}" target="_blank" rel="noopener noreferrer">Gists on GitHub</a></footer>
</body>
</html>
`;
}

function buildGistListHtml(gists, config, currentTag, helpers) {
  const { parseGistDescription, sortGists, formatDate, UNTAGGED_KEY } = helpers;
  const sorted = sortGists(gists, config.sortGistsBy);
  const isUntagged = currentTag === UNTAGGED_KEY;

  if (sorted.length === 0) {
    return `<p class="empty">${isUntagged ? "No untagged gists." : "No gists with this tag."}</p>`;
  }

  const items = sorted.map((gist) => {
    const { title, tags, about } = parseGistDescription(
      gist.description,
      gist
    );
    const url = escapeHtml(gist.html_url);
    const titleEsc = escapeHtml(title);
    let html = `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${titleEsc}</a>`;
    if (about) html += `<span class="about"> — ${escapeHtml(about)}</span>`;

    const meta = [];
    if (config.showSecondaryTags && !isUntagged) {
      const others = tags.filter((t) => t !== currentTag);
      if (others.length) {
        meta.push(`Tags: ${others.map((t) => escapeHtml(t)).join(", ")}`);
      }
    }
    if (config.showUpdatedDate && gist.updated_at) {
      meta.push(`Updated: ${formatDate(gist.updated_at)}`);
    }
    if (meta.length) html += `<div class="meta">${meta.join(" · ")}</div>`;
    html += "</li>";
    return html;
  });

  return `<ul class="gist-list">${items.join("")}</ul>`;
}

function tagHtmlSlug(tag, helpers) {
  const { UNTAGGED_KEY, UNTAGGED_SLUG, tagToSlug } = helpers;
  return tag === UNTAGGED_KEY ? UNTAGGED_SLUG : tagToSlug(tag);
}

/**
 * @param {Map} tagMap
 * @param {object} config
 * @param {string} updatedAt
 * @param {string} docsDir
 * @param {object} helpers - fns from update-index.js
 */
export async function generateHtmlSite(tagMap, config, updatedAt, docsDir, helpers) {
  const {
    sortTags,
    UNTAGGED_KEY,
    UNTAGGED_LABEL,
    tagToSlug,
  } = helpers;

  const tagsDir = path.join(docsDir, "tags");
  await fs.mkdir(tagsDir, { recursive: true });

  const untaggedGists = tagMap.get(UNTAGGED_KEY);
  const regularEntries = [...tagMap.entries()].filter(
    ([tag]) => tag !== UNTAGGED_KEY
  );
  const tagEntries = sortTags(
    regularEntries.map(([tag, gists]) => ({ tag, gists })),
    config.sortTagsBy
  );
  if (untaggedGists?.length) {
    tagEntries.push({ tag: UNTAGGED_KEY, gists: untaggedGists });
  }

  let changed = false;

  const stylePath = path.join(docsDir, "style.css");
  if (await writeIfChanged(stylePath, STYLES)) changed = true;

  const nojekyllPath = path.join(docsDir, ".nojekyll");
  try {
    await fs.writeFile(nojekyllPath, "", { flag: "wx" });
    changed = true;
  } catch {
    // exists
  }

  let indexBody;
  if (tagEntries.length === 0) {
    indexBody = `<p class="empty">No gists found.</p>`;
  } else {
    const items = tagEntries.map(({ tag, gists }) => {
      const name = tag === UNTAGGED_KEY ? UNTAGGED_LABEL : tag;
      const slug = tagHtmlSlug(tag, helpers);
      const count = gists.length;
      const label = count === 1 ? "gist" : "gists";
      return `<li><a href="tags/${escapeHtml(slug)}.html">${escapeHtml(name)}</a> <span class="count">${count} ${label}</span></li>`;
    });
    indexBody = `<p class="updated">Last updated: ${escapeHtml(updatedAt)}</p><ul class="tag-list">${items.join("")}</ul>`;
  }

  const indexHtml = htmlPage({
    title: "Gists",
    subtitle: "A browsable index of GitHub Gists",
    backHref: null,
    backLabel: null,
    body: indexBody,
    username: config.username,
  });

  const indexPath = path.join(docsDir, "index.html");
  if (await writeIfChanged(indexPath, indexHtml)) changed = true;

  const activeHtml = new Set(["index.html", "style.css", ".nojekyll"]);

  for (const [tag, tagGists] of tagMap) {
    const slug = tagHtmlSlug(tag, helpers);
    const filename = `${slug}.html`;
    activeHtml.add(`tags/${filename}`);

    const isUntagged = tag === UNTAGGED_KEY;
    const pageTitle = isUntagged
      ? "Untagged gists"
      : `Gists tagged “${tag}”`;
    const subtitle = isUntagged
      ? "No (tags:...) in the description"
      : null;

    const body = buildGistListHtml(tagGists, config, tag, helpers);
    const pageHtml = htmlPage({
      title: pageTitle,
      subtitle,
      backHref: "../index.html",
      backLabel: "All tags",
      body,
      username: config.username,
    });

    const tagPath = path.join(tagsDir, filename);
    if (await writeIfChanged(tagPath, pageHtml)) changed = true;
  }

  changed = (await cleanupStaleHtml(docsDir, activeHtml)) || changed;

  return changed;
}

async function writeIfChanged(filePath, content) {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content) return false;
  } catch {
    // missing
  }
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function cleanupStaleHtml(docsDir, activeRelativePaths) {
  let removed = false;

  async function scan(dir, prefix) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(full, rel);
        continue;
      }

      if (!entry.name.endsWith(".html")) continue;
      if (activeRelativePaths.has(rel)) continue;

      const content = await fs.readFile(full, "utf8");
      if (!content.startsWith(HTML_MARKER)) continue;

      await fs.unlink(full);
      console.log(`Removed stale HTML: docs/${rel}`);
      removed = true;
    }
  }

  await scan(docsDir, "");
  return removed;
}

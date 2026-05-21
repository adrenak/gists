import fs from "node:fs/promises";
import path from "node:path";

const HTML_MARKER = "<!-- gists-index:auto -->";
const CSS_MARKER = "/* gists-index:auto */";
const TEMPLATES_DIR_NAME = "templates";
const INDEX_FOOTER_HTML = `<footer><a href="https://github.com/adrenak/gists" target="_blank" rel="noopener noreferrer">Get your own Gists page</a></footer>`;

const PAGES_DEFAULTS = {
  backgroundColor: "#fafafa",
  textColor: "#1a1a1a",
  textColorSecondary: "#666666",
  linkColor: "#0969da",
  borderColor: "#e8e8e8",
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function loadPagesTheme(rootDir) {
  const pagesPath = path.join(rootDir, "pages.json");
  try {
    const raw = await fs.readFile(pagesPath, "utf8");
    return { ...PAGES_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...PAGES_DEFAULTS };
  }
}

function buildStyles(theme) {
  const bg = theme.backgroundColor;
  const text = theme.textColor;
  const secondary = theme.textColorSecondary;
  const link = theme.linkColor;
  const border = theme.borderColor;

  return `${CSS_MARKER}
/* gists-index — customize via pages.json */
:root {
  color-scheme: light dark;
  --bg: ${bg};
  --text: ${text};
  --text-secondary: ${secondary};
  --link: ${link};
  --border: ${border};
}
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  line-height: 1.5;
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  color: var(--text);
  background: var(--bg);
}
a { color: var(--link); }
a:hover { text-decoration: underline; }
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem; }
.intro, .subtitle, .updated { color: var(--text-secondary); font-size: 0.9375rem; margin: 0 0 1rem; }
.intro a { color: var(--link); font-weight: 500; }
.back { font-size: 0.875rem; margin-bottom: 1rem; display: inline-block; color: var(--link); }
.tag-list, .gist-list { list-style: none; padding: 0; margin: 0; }
.tag-list li, .gist-list li {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}
.tag-list a { font-weight: 500; }
.count { color: var(--text-secondary); font-size: 0.875rem; }
.gist-title { margin: 0 0 0.25rem; }
.gist-title a { font-weight: 500; }
.gist-list .about {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  margin: 0 0 0.35rem;
  line-height: 1.45;
}
.meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem; }
.meta-line + .meta-line { margin-top: 0.2rem; }
.meta a { color: var(--link); }
.empty { color: var(--text-secondary); font-style: italic; }
footer { margin-top: 2rem; font-size: 0.75rem; color: var(--text-secondary); }
`;
}

async function renderHtmlTemplate(templatesDir, templateName, placeholders) {
  const templatePath = path.join(templatesDir, templateName);
  let template;
  try {
    template = await fs.readFile(templatePath, "utf8");
  } catch {
    return null;
  }

  if (!template.includes("[GENERATED_TAGS]") && !template.includes("[GENERATED]")) {
    console.warn(
      `Template ${templateName} missing [GENERATED_TAGS]; using built-in HTML layout.`
    );
    return null;
  }

  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.split(`[${key}]`).join(value);
  }
  return result.endsWith("\n") ? result : `${result}\n`;
}

function htmlPage({
  title,
  subtitle,
  backHref,
  backLabel,
  body,
  username,
  footerHtml,
}) {
  const back = backHref
    ? `<a class="back" href="${escapeHtml(backHref)}">← ${escapeHtml(backLabel)}</a>`
    : "";
  const gistHub = username
    ? `https://gist.github.com/${encodeURIComponent(username)}`
    : "https://gist.github.com";
  const footer =
    footerHtml ??
    `<footer><a href="${escapeHtml(gistHub)}" target="_blank" rel="noopener noreferrer">Gists on GitHub</a></footer>`;
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
  ${footer}
</body>
</html>
`;
}

function buildHtmlTagList(tagEntries, helpers) {
  const { UNTAGGED_KEY, UNTAGGED_LABEL, tagHtmlSlug } = helpers;

  if (tagEntries.length === 0) {
    return `<p class="empty">No gists found.</p>`;
  }

  const items = tagEntries.map(({ tag, gists }) => {
    const name = tag === UNTAGGED_KEY ? UNTAGGED_LABEL : tag;
    const slug = tagHtmlSlug(tag, helpers);
    const count = gists.length;
    const label = count === 1 ? "gist" : "gists";
    return `<li><a href="tags/${escapeHtml(slug)}.html">${escapeHtml(name)}</a> <span class="count">${count} ${label}</span></li>`;
  });

  return `<ul class="tag-list">${items.join("")}</ul>`;
}

function buildGistListHtml(gists, config, currentTag, helpers) {
  const {
    parseGistDescription,
    sortGists,
    formatDate,
    UNTAGGED_KEY,
    gistHasNoTags,
    tagHtmlSlug,
  } = helpers;
  const isUntagged = currentTag === UNTAGGED_KEY;

  const sorted = sortGists(gists, config.sortGistsBy).filter((gist) => {
    if (!isUntagged) return true;
    return gistHasNoTags(gist);
  });

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
    let html = `<li><div class="gist-title"><a href="${url}" target="_blank" rel="noopener noreferrer">${titleEsc}</a></div>`;
    if (about) html += `<p class="about">${escapeHtml(about)}</p>`;

    const metaLines = [];
    if (config.showSecondaryTags && !isUntagged && tags.length > 0) {
      const allTags = [...tags].sort((a, b) => a.localeCompare(b));
      const tagLinks = allTags
        .map((t) => {
          const slug = tagHtmlSlug(t, helpers);
          return `<a href="${escapeHtml(slug)}.html">${escapeHtml(t)}</a>`;
        })
        .join(", ");
      metaLines.push(`All Tags: ${tagLinks}`);
    }
    if (config.showUpdatedDate && gist.updated_at) {
      metaLines.push(`Updated: ${formatDate(gist.updated_at)}`);
    }
    if (metaLines.length) {
      html += `<div class="meta">${metaLines.map((line) => `<div class="meta-line">${line}</div>`).join("")}</div>`;
    }
    html += "</li>";
    return html;
  });

  return `<ul class="gist-list">${items.join("")}</ul>`;
}

function buildUsernameGistsLink(username) {
  const user = username || "your";
  const href = `https://gist.github.com/${encodeURIComponent(user)}`;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(user)}'s GitHub Gists</a>`;
}

function tagHtmlSlug(tag, helpers) {
  const { UNTAGGED_KEY, UNTAGGED_SLUG, tagToSlug } = helpers;
  return tag === UNTAGGED_KEY ? UNTAGGED_SLUG : tagToSlug(tag);
}

/** Remove auto-generated HTML/CSS from docs/ before each build. */
export async function clearGeneratedDocs(docsDir) {
  let cleared = false;

  const tagsDir = path.join(docsDir, "tags");
  try {
    await fs.rm(tagsDir, { recursive: true, force: true });
    cleared = true;
  } catch {
    // missing
  }

  let entries;
  try {
    entries = await fs.readdir(docsDir, { withFileTypes: true });
  } catch {
    return cleared;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(docsDir, entry.name);
    if (entry.name === "style.css") {
      await fs.unlink(full);
      cleared = true;
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    const content = await fs.readFile(full, "utf8");
    if (content.startsWith(HTML_MARKER)) {
      await fs.unlink(full);
      cleared = true;
    }
  }

  if (cleared) console.log("Cleared generated files in docs/");
  return cleared;
}

export async function generateHtmlSite(
  tagMap,
  config,
  updatedAt,
  docsDir,
  rootDir,
  helpers
) {
  const { sortTags, UNTAGGED_KEY, UNTAGGED_LABEL } = helpers;
  const templatesDir = path.join(rootDir, TEMPLATES_DIR_NAME);
  const theme = await loadPagesTheme(rootDir);

  await clearGeneratedDocs(docsDir);

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

  let changed = true;

  const stylePath = path.join(docsDir, "style.css");
  await fs.writeFile(stylePath, buildStyles(theme), "utf8");

  const nojekyllPath = path.join(docsDir, ".nojekyll");
  try {
    await fs.writeFile(nojekyllPath, "", { flag: "wx" });
  } catch {
    // exists
  }

  const htmlHelpers = { ...helpers, tagHtmlSlug, UNTAGGED_KEY, UNTAGGED_LABEL };
  const tagListHtml = buildHtmlTagList(tagEntries, htmlHelpers);
  const displayUser = config.username || "your";

  const gistsLink = buildUsernameGistsLink(config.username);

  const indexFromTemplate = await renderHtmlTemplate(
    templatesDir,
    "index.html",
    {
      USERNAME: escapeHtml(displayUser),
      GISTS_LINK: gistsLink,
      LAST_UPDATED: escapeHtml(updatedAt),
      GENERATED_TAGS: tagListHtml,
    }
  );

  const indexHtml =
    indexFromTemplate ??
    htmlPage({
      title: "Gists",
      subtitle: null,
      backHref: null,
      backLabel: null,
      body: `<p class="intro">A browsable index of ${gistsLink}.</p><p class="updated">Last updated: ${escapeHtml(updatedAt)}</p>${tagListHtml}`,
      username: config.username,
      footerHtml: INDEX_FOOTER_HTML,
    });

  await fs.writeFile(path.join(docsDir, "index.html"), indexHtml, "utf8");

  for (const [tag, tagGists] of tagMap) {
    const slug = tagHtmlSlug(tag, htmlHelpers);
    const filename = `${slug}.html`;
    const isUntagged = tag === UNTAGGED_KEY;

    const pageTitle = isUntagged
      ? "Untagged gists"
      : `Gists tagged “${tag}”`;
    const subtitle = isUntagged
      ? "Gists with no (tags:...) in the description"
      : null;

    const body = buildGistListHtml(tagGists, config, tag, {
      ...htmlHelpers,
      gistHasNoTags: helpers.gistHasNoTags,
    });
    const pageHtml = htmlPage({
      title: pageTitle,
      subtitle,
      backHref: "../index.html",
      backLabel: "All tags",
      body,
      username: config.username,
    });

    await fs.writeFile(path.join(tagsDir, filename), pageHtml, "utf8");
  }

  return changed;
}

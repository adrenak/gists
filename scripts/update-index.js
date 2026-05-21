import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateHtmlSite } from "./html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TAGS_DIR = path.join(ROOT, "tags");
const TAGS_PREFIX = "tags/";
const TEMPLATES_DIR = path.join(ROOT, "templates");
const DOCS_DIR = path.join(ROOT, "docs");
const GENERATED_MARKER = "[GENERATED]";

/** Only `(tags:...)` is supported for tagging — not hashtags like #python. */
const TAGS_RE = /\(tags:([^)]*)\)/i;
const ABOUT_RE = /\(about:([^)]*)\)/i;
const METADATA_RE = /\((?:tags|about):[^)]*\)/gi;

/** Internal map key for gists with no tags (written to untagged.md). */
const UNTAGGED_KEY = "__untagged__";
const UNTAGGED_LABEL = "Untagged";
const UNTAGGED_SLUG = "untagged";

const DEFAULTS = {
  username: "",
  includePrivate: false,
  includeUntagged: true,
  sortTagsBy: "alphabetical",
  sortGistsBy: "updated-desc",
  showUpdatedDate: true,
  showSecondaryTags: true,
  generateHtml: true,
  generatedFileHeader:
    "<!-- This file is auto-generated. Do not edit manually. -->",
};

async function loadConfig() {
  const configPath = path.join(ROOT, "config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

/**
 * Normalize a tag name to a URL-safe filename slug.
 * Examples: data-cleaning -> data-cleaning, C++ -> cpp, node.js -> node-js
 */
export function tagToSlug(tag) {
  return tag
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/\+/g, "p")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseTagsList(tagsBlock) {
  return [
    ...new Set(
      tagsBlock
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => t.toLowerCase())
    ),
  ];
}

export function parseGistDescription(description, gist) {
  const text = description ?? "";
  const tagsMatch = text.match(TAGS_RE);
  const tags = tagsMatch ? parseTagsList(tagsMatch[1]) : [];

  const aboutMatch = text.match(ABOUT_RE);
  const about = aboutMatch ? aboutMatch[1].trim() : "";

  let title = text
    .replace(METADATA_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    const filenames = gist?.files ? Object.keys(gist.files) : [];
    title = filenames[0] ?? gist?.id ?? "Untitled gist";
  }

  return { title, tags, about };
}

function parseLinkHeader(link) {
  if (!link) return {};
  const result = {};
  for (const part of link.split(",")) {
    const section = part.trim().split(";");
    if (section.length < 2) continue;
    const url = section[0].replace(/<(.*)>/, "$1").trim();
    const name = section[1].replace(/rel="(.*)"/, "$1").trim();
    result[name] = url;
  }
  return result;
}

async function fetchAllGists(config) {
  const token = process.env.GIST_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gists-index-updater",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const useAuthenticated = Boolean(token && config.includePrivate);
  const baseUrl = useAuthenticated
    ? "https://api.github.com/gists"
    : `https://api.github.com/users/${encodeURIComponent(config.username)}/gists`;

  if (!useAuthenticated && !config.username) {
    throw new Error(
      "config.json must set username for public gist indexing, or provide GIST_TOKEN for authenticated access."
    );
  }

  const gists = [];
  let url = `${baseUrl}?per_page=100`;

  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API error ${response.status}: ${body.slice(0, 500)}`
      );
    }
    const page = await response.json();
    gists.push(...page);
    const links = parseLinkHeader(response.headers.get("link"));
    url = links.next ?? null;
  }

  if (config.includePrivate && !token) {
    console.warn(
      "includePrivate is true but GIST_TOKEN is not set; only public gists will be indexed."
    );
  }

  return gists;
}

function sortGists(gists, sortGistsBy) {
  const sorted = [...gists];
  if (sortGistsBy === "updated-desc") {
    sorted.sort(
      (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
    );
  }
  return sorted;
}

function sortTags(tagEntries, sortTagsBy) {
  const sorted = [...tagEntries];
  const key =
    sortTagsBy === "alphabetical"
      ? "alphabetical-desc"
      : sortTagsBy === "count"
        ? "count-desc"
        : sortTagsBy;

  switch (key) {
    case "alphabetical-desc":
      sorted.sort((a, b) => b.tag.localeCompare(a.tag));
      break;
    case "alphabetical-asc":
      sorted.sort((a, b) => a.tag.localeCompare(b.tag));
      break;
    case "count-desc":
      sorted.sort(
        (a, b) =>
          b.gists.length - a.gists.length || a.tag.localeCompare(b.tag)
      );
      break;
    case "count-asc":
      sorted.sort(
        (a, b) =>
          a.gists.length - b.gists.length || a.tag.localeCompare(b.tag)
      );
      break;
  }
  return sorted;
}

function formatDate(iso) {
  return iso.slice(0, 10);
}

function tagToFilename(tag) {
  if (tag === UNTAGGED_KEY) return `${UNTAGGED_SLUG}.md`;
  return `${tagToSlug(tag)}.md`;
}

function tagPageHref(tag) {
  const slug = tag === UNTAGGED_KEY ? UNTAGGED_SLUG : tagToSlug(tag);
  return `${TAGS_PREFIX}${slug}.md`;
}

async function renderTemplate(templateName, placeholders) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  let template;
  try {
    template = await fs.readFile(templatePath, "utf8");
  } catch {
    return null;
  }

  const hasSlot =
    template.includes("[GENERATED_TAGS]") ||
    template.includes("[GENERATED]");
  if (!hasSlot) {
    console.warn(
      `Template ${templateName} is missing [GENERATED_TAGS] or [GENERATED]; using built-in layout.`
    );
    return null;
  }

  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.split(`[${key}]`).join(value);
  }

  if (result.includes("[GENERATED_TAGS]") || result.includes("[GENERATED]")) {
    console.warn(
      `Template ${templateName} still has unreplaced placeholders after render.`
    );
  }

  return result.endsWith("\n") ? result : `${result}\n`;
}

function gistHasNoTags(gist) {
  return parseGistDescription(gist.description, gist).tags.length === 0;
}

function buildTagListMarkdown(tagEntries) {
  if (tagEntries.length === 0) {
    return "_No gists found._";
  }

  const lines = [];
  for (const { tag, gists } of tagEntries) {
    const name = tag === UNTAGGED_KEY ? UNTAGGED_LABEL : tag;
    const count = gists.length;
    const countLabel = count === 1 ? "gist" : "gists";
    lines.push(`- [${name}](${tagPageHref(tag)}) — ${count} ${countLabel}`);
  }
  return lines.join("\n");
}

function buildTagPageGenerated(tag, gists, config) {
  const isUntagged = tag === UNTAGGED_KEY;
  let sorted = sortGists(gists, config.sortGistsBy);
  if (isUntagged) {
    sorted = sorted.filter(gistHasNoTags);
  }

  if (sorted.length === 0) {
    return isUntagged ? "_No untagged gists._" : "_No gists with this tag._";
  }

  return sorted.map((gist) => buildGistLine(gist, config, tag)).join("\n");
}

function buildGistLine(gist, config, currentTag) {
  const { title, tags, about } = parseGistDescription(
    gist.description,
    gist
  );
  const url = gist.html_url;
  let line = `- [${title}](${url})`;
  if (about) line += ` — ${about}`;

  const extras = [];
  const isUntaggedPage = currentTag === UNTAGGED_KEY;
  if (config.showSecondaryTags && !isUntaggedPage) {
    const others = tags.filter((t) => t !== currentTag);
    if (others.length) {
      extras.push(`Tags: ${others.map((t) => `\`${t}\``).join(", ")}`);
    }
  }
  if (config.showUpdatedDate && gist.updated_at) {
    extras.push(`Updated: ${formatDate(gist.updated_at)}`);
  }

  if (extras.length) {
    line += "  \n  " + extras.join("  \n  ");
  }

  return line;
}

async function generateReadme(tagMap, config, updatedAt) {
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

  const tagList = buildTagListMarkdown(tagEntries);
  const displayUser = config.username || "your";
  const fromTemplate = await renderTemplate("README.md", {
    USERNAME: displayUser,
    LAST_UPDATED: updatedAt,
    GENERATED_TAGS: tagList,
    GENERATED: `_Last updated: ${updatedAt}_\n\n${tagList}`,
  });
  if (fromTemplate) return fromTemplate;

  const header = config.generatedFileHeader;
  return [
    header,
    "",
    "# Gists",
    "",
    `A browsable index of ${displayUser}'s GitHub Gists.`,
    "",
    "See [HELP.md](HELP.md) for setup and how this repo works.",
    "",
    `_Last updated: ${updatedAt}_`,
    "",
    tagList,
    "",
  ].join("\n");
}

async function generateTagPage(tag, gists, config) {
  const isUntagged = tag === UNTAGGED_KEY;
  const generated = buildTagPageGenerated(tag, gists, config);
  if (isUntagged) {
    const untaggedTemplate = await renderTemplate("UNTAGGED.md", {
      GENERATED: generated,
    });
    if (untaggedTemplate) return untaggedTemplate;
  }

  const fromTemplate = await renderTemplate("TAG.md", {
    TAG: tag,
    GENERATED: generated,
  });
  if (fromTemplate) return fromTemplate;

  const header = config.generatedFileHeader;
  const lines = [
    header,
    "",
    isUntagged ? "# Untagged gists" : `# Gists tagged \`${tag}\``,
    "",
    isUntagged
      ? "_Gists with no (tags:...) in the description. Back to [all tags](../README.md)._"
      : "_Back to [all tags](../README.md)._",
    "",
    "## Gists",
    "",
    generated,
    "",
  ];
  return lines.join("\n");
}

async function listGeneratedTagFiles(config) {
  const header = config.generatedFileHeader;
  const generated = [];

  let entries;
  try {
    entries = await fs.readdir(TAGS_DIR, { withFileTypes: true });
  } catch {
    return generated;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const filePath = path.join(TAGS_DIR, entry.name);
    const content = await fs.readFile(filePath, "utf8");
    if (content.startsWith(header)) {
      generated.push(entry.name);
    }
  }

  return generated;
}

/** Remove tag pages left in repo root from before tags/ layout. */
async function cleanupLegacyRootTagPages(config) {
  const header = config.generatedFileHeader;
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  let removed = false;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md" || entry.name === "HELP.md") continue;

    const filePath = path.join(ROOT, entry.name);
    const content = await fs.readFile(filePath, "utf8");
    if (content.startsWith(header)) {
      await fs.unlink(filePath);
      console.log(`Removed legacy tag page from root: ${entry.name}`);
      removed = true;
    }
  }

  return removed;
}

async function writeIfChanged(filePath, content) {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content) return false;
  } catch {
    // file missing
  }
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function main() {
  const config = await loadConfig();
  const gists = await fetchAllGists(config);

  const taggedGists = [];
  const untaggedGists = [];

  for (const gist of gists) {
    const parsed = parseGistDescription(gist.description, gist);
    if (parsed.tags.length === 0) {
      if (config.includeUntagged) untaggedGists.push(gist);
      continue;
    }
    taggedGists.push({ gist, parsed });
  }

  const tagMap = new Map();
  for (const { gist, parsed } of taggedGists) {
    for (const tag of parsed.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(gist);
    }
  }

  if (config.includeUntagged) {
    const onlyUntagged = untaggedGists.filter(gistHasNoTags);
    if (onlyUntagged.length > 0) {
      tagMap.set(UNTAGGED_KEY, onlyUntagged);
    }
  }

  const now = new Date();
  const updatedAt = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  let changed = false;

  const readmePath = path.join(ROOT, "README.md");
  const readme = await generateReadme(tagMap, config, updatedAt);
  if (await writeIfChanged(readmePath, readme)) changed = true;

  await fs.mkdir(TAGS_DIR, { recursive: true });

  const activeSlugs = new Set();
  for (const [tag, tagGists] of tagMap) {
    const filename = tagToFilename(tag);
    activeSlugs.add(filename);
    const tagPath = path.join(TAGS_DIR, filename);
    const content = await generateTagPage(tag, tagGists, config);
    if (await writeIfChanged(tagPath, content)) changed = true;
  }

  const existingGenerated = await listGeneratedTagFiles(config);
  for (const filename of existingGenerated) {
    if (!activeSlugs.has(filename)) {
      await fs.unlink(path.join(TAGS_DIR, filename));
      changed = true;
      console.log(`Removed stale tag page: tags/${filename}`);
    }
  }

  if (await cleanupLegacyRootTagPages(config)) changed = true;

  if (config.generateHtml !== false) {
    const htmlHelpers = {
      parseGistDescription,
      sortGists,
      sortTags,
      formatDate,
      tagToSlug,
      UNTAGGED_KEY,
      UNTAGGED_LABEL,
      UNTAGGED_SLUG,
    };
    if (
      await generateHtmlSite(
        tagMap,
        config,
        updatedAt,
        DOCS_DIR,
        ROOT,
        { ...htmlHelpers, gistHasNoTags }
      )
    ) {
      changed = true;
    }
  }

  const tagCount = tagMap.size - (tagMap.has(UNTAGGED_KEY) ? 1 : 0);
  const untaggedCount = untaggedGists.length;
  const gistCount = taggedGists.length + untaggedCount;
  const untaggedNote =
    untaggedCount > 0 ? ` (${untaggedCount} untagged)` : "";
  console.log(
    `Indexed ${gistCount} gist(s) across ${tagCount} tag(s)${untaggedNote}.${changed ? " Files updated." : " No changes."}`
  );

  if (process.env.CI && !changed) {
    process.exit(0);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

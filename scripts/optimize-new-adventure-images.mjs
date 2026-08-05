import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const publicNewAdventureDir = path.join(
  rootDir,
  "apps/web/public/new-adventure"
);
const sourceNewAdventureDir = path.join(rootDir, "assets/new-adventure art");

const classSlugs = [
  "artificer",
  "barbarian",
  "bard",
  "blood-hunter",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "psion",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard"
];

const speciesSlugs = [
  "dragonborn",
  "dwarf",
  "elf",
  "gnome",
  "half-elf",
  "half-orc",
  "halfling",
  "human",
  "tiefling"
];

const directConversions = [
  {
    source: path.join(sourceNewAdventureDir, "flow-bg.png"),
    output: path.join(publicNewAdventureDir, "flow-bg.webp"),
    width: 1376,
    quality: 72
  },
  {
    source: path.join(sourceNewAdventureDir, "eldermere-banner.jpg"),
    output: path.join(publicNewAdventureDir, "eldermere-banner.webp"),
    width: 1200,
    quality: 76
  },
  {
    source: path.join(sourceNewAdventureDir, "custom-world-banner.jpg"),
    output: path.join(publicNewAdventureDir, "custom-world-banner.webp"),
    width: 1200,
    quality: 76
  }
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walk(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".jpg")) {
      yield entryPath;
    }
  }
}

async function convertToWebp({ source, output, width, quality }) {
  await mkdir(path.dirname(output), { recursive: true });

  await sharp(source)
    .rotate()
    .resize({
      width,
      withoutEnlargement: true
    })
    .webp({
      quality,
      effort: 6,
      smartSubsample: true
    })
    .toFile(output);
}

for (const image of directConversions) {
  await convertToWebp(image);
}

for (const slug of classSlugs) {
  await convertToWebp({
    source: path.join(rootDir, "assets/classes art", `${slug}.png`),
    output: path.join(publicNewAdventureDir, "classes", `${slug}.webp`),
    width: 640,
    quality: 78
  });
}

for (const slug of speciesSlugs) {
  await convertToWebp({
    source: path.join(rootDir, "assets/races art", `${slug}.png`),
    output: path.join(publicNewAdventureDir, "species", `${slug}.webp`),
    width: 640,
    quality: 78
  });
}

for await (const source of walk(path.join(sourceNewAdventureDir, "options"))) {
  await convertToWebp({
    source,
    output: path
      .join(publicNewAdventureDir, path.relative(sourceNewAdventureDir, source))
      .replace(/\.jpg$/, ".webp"),
    width: 640,
    quality: 74
  });
}

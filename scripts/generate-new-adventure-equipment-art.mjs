import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const outputRoot = path.join(
  rootDir,
  "apps/web/public/new-adventure/options"
);
const size = 420;

const armorItems = [
  "Chain mail",
  "Leather armor",
  "Scale mail",
  "Shield",
  "Studded leather armor"
];

const focusItems = [
  "Arcane focus",
  "Component pouch",
  "Druidic focus",
  "Holy symbol"
];

const instrumentItems = [
  "Bagpipes",
  "Drum",
  "Dulcimer",
  "Flute",
  "Horn",
  "Lute",
  "Lyre",
  "Musical instrument",
  "Pan flute",
  "Shawm",
  "Viol"
];

const panelItems = [
  "Any simple weapon",
  "Any martial melee weapon",
  "Any other musical instrument",
  "Any simple melee weapon",
  "One martial weapon and a shield",
  "Two martial weapons",
  "Two simple melee weapons",
  "One martial weapon",
  "Two simple weapons",
  "Scale mail and shield",
  "Wooden shield"
];

const gearItems = [
  "10 candles",
  "10 days of rations",
  "10 feet of string",
  "10 GP",
  "10 pitons",
  "10 sheets of parchment",
  "10 torches",
  "15 GP",
  "2 blocks of incense",
  "2 costumes",
  "2 days of rations",
  "2 flasks of oil",
  "2 map cases",
  "20 arrows",
  "20 bolts",
  "25 GP",
  "5 candles",
  "5 days of rations",
  "5 GP",
  "5 sheets of paper",
  "5 sticks of incense",
  "50 feet hempen rope",
  "50 feet silk rope",
  "6 GP",
  "Admirer's favor",
  "Alms box",
  "Artisan's tools",
  "Backpack",
  "Bag of 1,000 ball bearings",
  "Bedroll",
  "Belaying pin",
  "Bell",
  "Blanket",
  "Book of lore",
  "Bottle of ink",
  "Censer",
  "Chest",
  "City map",
  "Common clothes",
  "Con prop",
  "Costume",
  "Crowbar",
  "Dark common clothes with hood",
  "Fine clothes",
  "Gaming set",
  "Guild introduction letter",
  "Hammer",
  "Hooded lantern",
  "Hunting trap",
  "Hunting trophy",
  "Ink pen",
  "Iron pot",
  "Lamp",
  "Little bag of sand",
  "Lucky charm",
  "Map case",
  "Mess kit",
  "Parent token",
  "Pedigree scroll",
  "Pet mouse",
  "Prayer book",
  "Quill",
  "Quiver",
  "Rank insignia",
  "Scroll case of notes",
  "Sealing wax",
  "Shovel",
  "Signet ring",
  "Small knife",
  "Soap",
  "Spellbook",
  "Staff",
  "Tinderbox",
  "Traveler's clothes",
  "Trophy from a fallen enemy",
  "Unanswered scholarly letter",
  "Vestments",
  "Vial of perfume",
  "Waterskin",
  "Winter blanket"
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function esc(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseCard(innerSvg) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="warmGlow" cx="48%" cy="30%" r="70%">
      <stop offset="0" stop-color="#594225"/>
      <stop offset="0.52" stop-color="#15100b"/>
      <stop offset="1" stop-color="#050403"/>
    </radialGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4ead0"/>
      <stop offset="0.42" stop-color="#9d9a8f"/>
      <stop offset="1" stop-color="#36383b"/>
    </linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2d283"/>
      <stop offset="0.55" stop-color="#9f6927"/>
      <stop offset="1" stop-color="#38200d"/>
    </linearGradient>
    <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a5430"/>
      <stop offset="0.55" stop-color="#4b2616"/>
      <stop offset="1" stop-color="#160b07"/>
    </linearGradient>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000" flood-opacity="0.65"/>
    </filter>
    <pattern id="speckle" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="9" r="1.1" fill="#f4cf7a" opacity="0.15"/>
      <circle cx="23" cy="19" r="0.9" fill="#fff0ba" opacity="0.10"/>
      <circle cx="14" cy="29" r="1.4" fill="#5f4425" opacity="0.34"/>
    </pattern>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#warmGlow)"/>
  <rect width="${size}" height="${size}" fill="url(#speckle)" opacity="0.52"/>
  <path d="M26 24h368v372H26z" fill="none" stroke="#3a250f" stroke-width="9"/>
  <path d="M31 30h358v360H31z" fill="none" stroke="#c38a38" stroke-width="3" opacity="0.92"/>
  <path d="M46 47c28 0 43-13 52-29M374 47c-28 0-43-13-52-29M46 373c28 0 43 13 52 29M374 373c-28 0-43 13-52 29" fill="none" stroke="#c38a38" stroke-width="5" stroke-linecap="round" opacity="0.82"/>
  <g filter="url(#softShadow)">
    ${innerSvg}
  </g>
  <rect x="4" y="4" width="412" height="412" fill="none" stroke="#110a04" stroke-width="8"/>
</svg>`;
}

function coinPile() {
  return `
    <g>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = 138 + (i % 4) * 38;
        const y = 244 - Math.floor(i / 4) * 18;
        return `<ellipse cx="${x}" cy="${y}" rx="34" ry="12" fill="url(#brass)" stroke="#f8dc8f" stroke-width="3"/>`;
      }).join("")}
      <path d="M148 205c42-30 89-30 126 1-31 22-94 23-126-1z" fill="url(#brass)" stroke="#f3d58a" stroke-width="5"/>
    </g>`;
}

function weaponBundle(kind) {
  const martial = /martial/i.test(kind);
  const two = /two/i.test(kind);
  const shield = /shield/i.test(kind);
  return `
    <g transform="translate(${shield ? 4 : 0} 0)">
      <path d="M118 298L292 124" stroke="url(#steel)" stroke-width="${martial ? 18 : 13}" stroke-linecap="round"/>
      <path d="M106 310l46-46" stroke="url(#brass)" stroke-width="18" stroke-linecap="round"/>
      ${two ? `<path d="M301 300L135 126" stroke="url(#steel)" stroke-width="${martial ? 15 : 11}" stroke-linecap="round"/><path d="M312 312l-43-43" stroke="url(#brass)" stroke-width="16" stroke-linecap="round"/>` : ""}
      ${shield ? `<path d="M254 174c38 14 65 13 96 0-2 82-28 121-48 141-23-19-45-60-48-141z" fill="url(#brass)" stroke="#f2d283" stroke-width="6"/>` : ""}
    </g>`;
}

function armorArt(name) {
  if (/shield/i.test(name)) {
    return `<path d="M210 92c53 31 89 38 125 37-7 113-49 163-125 207-76-44-118-94-125-207 36 1 72-6 125-37z" fill="url(#brass)" stroke="#f6d993" stroke-width="8"/><path d="M210 128v164" stroke="#3a210d" stroke-width="10" opacity="0.65"/><path d="M137 164c45 13 96 13 146 0" fill="none" stroke="#fff0ba" stroke-width="5" opacity="0.46"/>`;
  }

  const fill = /leather|studded/i.test(name) ? "url(#leather)" : "url(#steel)";
  const studs = /studded/i.test(name)
    ? Array.from({ length: 24 }, (_, i) => {
        const x = 132 + (i % 6) * 30;
        const y = 164 + Math.floor(i / 6) * 34;
        return `<circle cx="${x}" cy="${y}" r="5" fill="url(#brass)"/>`;
      }).join("")
    : "";
  const mail = /chain|scale/i.test(name)
    ? Array.from({ length: 8 }, (_, i) => `<path d="M132 ${154 + i * 21}c42 18 111 18 156 0" fill="none" stroke="#f5efd9" stroke-width="3" opacity="0.45"/>`).join("")
    : "";
  return `<path d="M140 106l35 28h70l35-28 64 55-45 58-24-18v117H145V201l-24 18-45-58 64-55z" fill="${fill}" stroke="#f0d189" stroke-width="7"/>${mail}${studs}`;
}

function focusArt(name) {
  if (/pouch/i.test(name)) {
    return `<path d="M145 142c26 19 103 19 130 0l33 152c-34 35-163 35-196 0l33-152z" fill="url(#leather)" stroke="#e0b96d" stroke-width="7"/><path d="M143 148c43 20 91 19 133 0" fill="none" stroke="#f4d68f" stroke-width="6"/><circle cx="210" cy="221" r="26" fill="url(#brass)" opacity="0.75"/>`;
  }
  if (/druidic/i.test(name)) {
    return `<path d="M207 92c49 56 70 93 70 134 0 45-30 80-67 80s-67-35-67-80c0-41 20-78 64-134z" fill="#3f6b35" stroke="#d8bd75" stroke-width="7"/><path d="M210 112c-2 76 0 135 0 201" stroke="#e7d79d" stroke-width="6"/><path d="M210 201c33-17 54-37 66-66M210 231c-35-16-56-35-70-62" stroke="#e7d79d" stroke-width="5" fill="none"/>`;
  }
  if (/holy/i.test(name)) {
    return `<circle cx="210" cy="210" r="92" fill="url(#brass)" stroke="#fff1b8" stroke-width="8"/><path d="M210 128v164M128 210h164" stroke="#3a210d" stroke-width="18" stroke-linecap="round"/><circle cx="210" cy="210" r="35" fill="#fff1b8" opacity="0.35"/>`;
  }
  return `<path d="M138 278l140-140" stroke="url(#steel)" stroke-width="24" stroke-linecap="round"/><path d="M268 130l31-31 24 24-31 31z" fill="url(#brass)" stroke="#f3d78c" stroke-width="5"/><circle cx="210" cy="206" r="45" fill="#6fc7ff" opacity="0.48" stroke="#e6f7ff" stroke-width="7"/>`;
}

function instrumentArt(name) {
  if (/bagpipes/i.test(name)) {
    return `<ellipse cx="194" cy="226" rx="68" ry="82" fill="url(#leather)" stroke="#ddb66e" stroke-width="7"/><path d="M228 164l74-70M241 205l94-24M164 174l-42-68" stroke="url(#brass)" stroke-width="15" stroke-linecap="round"/>`;
  }
  if (/drum/i.test(name)) {
    return `<ellipse cx="210" cy="138" rx="92" ry="32" fill="#ead9b1" stroke="#d4a85e" stroke-width="7"/><path d="M118 138v116c0 18 184 18 184 0V138" fill="url(#leather)" stroke="#d4a85e" stroke-width="7"/><ellipse cx="210" cy="254" rx="92" ry="32" fill="#5a2d19" stroke="#d4a85e" stroke-width="7"/><path d="M122 120l-36-36M298 120l36-36" stroke="url(#steel)" stroke-width="8" stroke-linecap="round"/>`;
  }
  if (/horn/i.test(name)) {
    return `<path d="M112 251c96-10 126-74 177-140 17 51 0 128-48 166-42 34-91 34-129-26z" fill="url(#brass)" stroke="#f4d992" stroke-width="8"/><circle cx="118" cy="250" r="34" fill="#2b160b" stroke="#e9c470" stroke-width="8"/>`;
  }
  if (/flute|shawm|pan flute|viol|dulcimer|lyre|lute|musical/i.test(name)) {
    const strings = Array.from({ length: 5 }, (_, i) => `<path d="M${184 + i * 9} 132v166" stroke="#f8e8bb" stroke-width="2" opacity="0.8"/>`).join("");
    if (/flute|shawm/i.test(name)) {
      return `<path d="M120 280L294 106" stroke="url(#brass)" stroke-width="20" stroke-linecap="round"/><circle cx="182" cy="218" r="5" fill="#2b160b"/><circle cx="209" cy="191" r="5" fill="#2b160b"/><circle cx="236" cy="164" r="5" fill="#2b160b"/>`;
    }
    if (/pan flute/i.test(name)) {
      return Array.from({ length: 7 }, (_, i) => `<rect x="${128 + i * 25}" y="${116 + i * 10}" width="17" height="${170 - i * 14}" rx="8" fill="url(#brass)" stroke="#f1d184" stroke-width="4"/>`).join("");
    }
    if (/lyre/i.test(name)) {
      return `<path d="M141 115c-18 75-2 145 69 190 70-45 86-115 68-190" fill="none" stroke="url(#brass)" stroke-width="20"/><path d="M146 300h128" stroke="url(#brass)" stroke-width="18" stroke-linecap="round"/>${strings}`;
    }
    if (/viol/i.test(name)) {
      return `<ellipse cx="210" cy="175" rx="44" ry="60" fill="url(#leather)" stroke="#d6ac64" stroke-width="6"/><ellipse cx="210" cy="258" rx="56" ry="64" fill="url(#leather)" stroke="#d6ac64" stroke-width="6"/><path d="M210 80v238" stroke="url(#brass)" stroke-width="12"/>${strings}`;
    }
    return `<ellipse cx="210" cy="244" rx="66" ry="76" fill="url(#leather)" stroke="#d6ac64" stroke-width="7"/><path d="M210 82v128" stroke="url(#brass)" stroke-width="18" stroke-linecap="round"/><path d="M178 101h64" stroke="url(#brass)" stroke-width="14" stroke-linecap="round"/>${strings}`;
  }
  return `<circle cx="210" cy="210" r="86" fill="url(#brass)" stroke="#f8df99" stroke-width="8"/>`;
}

function gearArt(name) {
  if (/\bGP\b/.test(name)) return coinPile();
  if (/arrow|bolt/i.test(name)) return weaponBundle("two simple weapons");
  if (/rope|string/i.test(name)) return `<path d="M124 218c0-66 171-66 171 0s-171 66-171 0z" fill="none" stroke="url(#brass)" stroke-width="18"/><path d="M153 218c0-34 113-34 113 0s-113 34-113 0z" fill="none" stroke="#7b4b1e" stroke-width="10"/>`;
  if (/candle|incense|torch/i.test(name)) return `<path d="M153 292h114" stroke="url(#brass)" stroke-width="18" stroke-linecap="round"/><rect x="177" y="151" width="24" height="130" rx="10" fill="#f1ddba"/><rect x="221" y="132" width="24" height="149" rx="10" fill="#e4cda6"/><path d="M190 125c-18-22 2-42 12-61 18 25 19 42-12 61zM234 106c-18-22 2-42 12-61 18 25 19 42-12 61z" fill="#ef8f38"/>`;
  if (/ration|bedroll|blanket|clothes|costume|vestments/i.test(name)) return `<path d="M118 154c56-31 127-31 184 0v120c-58 27-127 27-184 0V154z" fill="url(#leather)" stroke="#d7af69" stroke-width="7"/><path d="M143 183c47 19 89 19 134 0M143 222c47 19 89 19 134 0" stroke="#f1d188" stroke-width="5" opacity="0.55"/>`;
  if (/backpack|pouch|case|chest|kit|tools|set/i.test(name)) return `<path d="M139 144h142c17 0 31 14 31 31v113H108V175c0-17 14-31 31-31z" fill="url(#leather)" stroke="#d4aa64" stroke-width="7"/><path d="M151 144v-28h118v28M108 205h204" stroke="#e5bf74" stroke-width="7"/><circle cx="210" cy="205" r="15" fill="url(#brass)"/>`;
  if (/book|letter|scroll|paper|parchment|map|quill|ink|scroll/i.test(name)) return `<path d="M126 131c42-18 88-18 128 0v158c-40-18-86-18-128 0V131z" fill="#d8c199" stroke="#c79b58" stroke-width="7"/><path d="M254 131c22-13 45-13 69 0v158c-24-13-47-13-69 0V131z" fill="#bfa06d" stroke="#c79b58" stroke-width="7"/><path d="M151 168h77M151 199h77M151 230h77" stroke="#51361f" stroke-width="5" opacity="0.58"/>`;
  if (/knife|staff|belaying pin|shovel|hammer|crowbar|piton/i.test(name)) return `<path d="M124 294L294 124" stroke="url(#steel)" stroke-width="16" stroke-linecap="round"/><path d="M113 305l49-49" stroke="url(#brass)" stroke-width="21" stroke-linecap="round"/><path d="M260 116l42 42" stroke="#f3dfaa" stroke-width="9" stroke-linecap="round"/>`;
  if (/bell|censer|lamp|lantern|alms/i.test(name)) return `<path d="M162 176c0-55 96-55 96 0l31 104H131l31-104z" fill="url(#brass)" stroke="#f7dc95" stroke-width="8"/><path d="M180 141c0-37 60-37 60 0" fill="none" stroke="#f7dc95" stroke-width="8"/><circle cx="210" cy="282" r="17" fill="#3b220d"/>`;
  if (/waterskin|flask|bottle|vial|perfume|soap|wax|sand|pot/i.test(name)) return `<path d="M172 103h76l10 47c39 32 54 72 39 119-20 63-154 63-174 0-15-47 0-87 39-119l10-47z" fill="url(#leather)" stroke="#dcb66e" stroke-width="8"/><path d="M179 103h62" stroke="#f1d188" stroke-width="13" stroke-linecap="round"/>`;
  if (/ring|token|insignia|charm|favor|trophy|prop|symbol/i.test(name)) return `<circle cx="210" cy="210" r="76" fill="none" stroke="url(#brass)" stroke-width="23"/><circle cx="210" cy="210" r="33" fill="#7dc7ff" opacity="0.42" stroke="#f3dda0" stroke-width="6"/>`;
  if (/trap|ball bearings|mouse/i.test(name)) return `<circle cx="210" cy="210" r="88" fill="none" stroke="url(#steel)" stroke-width="14"/><path d="M143 276l134-134M143 143l134 134" stroke="url(#brass)" stroke-width="11" stroke-linecap="round"/>`;
  return `<path d="M129 158c44-42 118-42 162 0 41 39 41 106 0 145-44 42-118 42-162 0-41-39-41-106 0-145z" fill="url(#brass)" stroke="#f5d992" stroke-width="8"/><path d="M164 209h92M210 163v92" stroke="#3a210d" stroke-width="12" stroke-linecap="round" opacity="0.65"/>`;
}

function panelArt(name) {
  if (/instrument/i.test(name)) return instrumentArt("Musical instrument");
  if (/shield|mail|armor/i.test(name)) return /shield/i.test(name) && !/mail/i.test(name) ? armorArt("Shield") : armorArt("Chain mail");
  return weaponBundle(name);
}

async function writeImage(folder, name, innerSvg) {
  const output = path.join(outputRoot, folder, `${slug(name)}.webp`);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(Buffer.from(baseCard(innerSvg)))
    .resize(size, size)
    .webp({ quality: 76, effort: 6, smartSubsample: true })
    .toFile(output);
}

for (const item of armorItems) {
  await writeImage("armor", item, armorArt(item));
}

for (const item of focusItems) {
  await writeImage("foci", item, focusArt(item));
}

for (const item of instrumentItems) {
  await writeImage("instruments", item, instrumentArt(item));
}

for (const item of panelItems) {
  await writeImage("equipment-panels", item, panelArt(item));
}

for (const item of gearItems) {
  await writeImage("gear", item, gearArt(item));
}

console.log(
  `Generated ${armorItems.length + focusItems.length + instrumentItems.length + panelItems.length + gearItems.length} new-adventure equipment art assets.`
);

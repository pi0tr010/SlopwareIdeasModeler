import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const svg = readFileSync("public/logo.svg");
const png = (size) => sharp(svg).resize(size, size).png().toBuffer();

const icons = [
  ["src-tauri/icons/32x32.png", 32],
  ["src-tauri/icons/64x64.png", 64],
  ["src-tauri/icons/128x128.png", 128],
  ["src-tauri/icons/128x128@2x.png", 256],
  ["src-tauri/icons/icon.png", 512],
  ["public/favicon.png", 32],
  ["src-tauri/icons/Square30x30Logo.png", 30],
  ["src-tauri/icons/Square44x44Logo.png", 44],
  ["src-tauri/icons/Square71x71Logo.png", 71],
  ["src-tauri/icons/Square89x89Logo.png", 89],
  ["src-tauri/icons/Square107x107Logo.png", 107],
  ["src-tauri/icons/Square142x142Logo.png", 142],
  ["src-tauri/icons/Square150x150Logo.png", 150],
  ["src-tauri/icons/Square284x284Logo.png", 284],
  ["src-tauri/icons/Square310x310Logo.png", 310],
  ["src-tauri/icons/StoreLogo.png", 50],
];

for (const [file, size] of icons) writeFileSync(file, await png(size));
const ico = await pngToIco([await png(16), await png(32), await png(48), await png(256)]);
writeFileSync("src-tauri/icons/icon.ico", ico);
writeFileSync("public/favicon.ico", ico);
console.log("icons written");

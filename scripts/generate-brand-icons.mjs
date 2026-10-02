import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(
  ROOT,
  "public/brand/the-sync-exchange/logos/website-symbol-transparent.png"
);
const BRAND_BACKGROUND = { r: 17, g: 22, b: 28, alpha: 1 };

const standardSizes = [16, 32, 48, 64, 96, 192, 512];
const icoSizes = [16, 32, 48, 64];

async function readTrimmedSource() {
  return sharp(SOURCE)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function alphaCentroid(data, width, height) {
  let alphaTotal = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      alphaTotal += alpha;
      weightedX += x * alpha;
      weightedY += y * alpha;
    }
  }

  return {
    x: weightedX / alphaTotal,
    y: weightedY / alphaTotal
  };
}

async function renderIcon(source, size, occupancy, background = null) {
  const targetHeight = Math.max(1, Math.round(size * occupancy));
  const resized = await sharp(source)
    .resize({ height: targetHeight, fit: "inside", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const centroid = alphaCentroid(resized.data, resized.info.width, resized.info.height);
  const left = Math.round((size - 1) / 2 - centroid.x);
  const top = Math.round((size - 1) / 2 - centroid.y);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: resized.data,
        raw: {
          width: resized.info.width,
          height: resized.info.height,
          channels: 4
        },
        left,
        top
      }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function buildIco(pngBuffers, sizes) {
  const headerLength = 6 + sizes.length * 16;
  const header = Buffer.alloc(headerLength);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let offset = headerLength;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngBuffers[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngBuffers[index].length;
  });

  return Buffer.concat([header, ...pngBuffers]);
}

async function writeCopies(buffer, paths) {
  await Promise.all(
    paths.map(async (relativePath) => {
      const destination = path.join(ROOT, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, buffer);
    })
  );
}

const source = await readTrimmedSource();
const standard = new Map();

for (const size of standardSizes) {
  // A 15px-tall symbol touches one edge on a 16px canvas. Fourteen pixels is
  // the largest discrete rendering that preserves a transparent safety row.
  const occupancy = size === 16 ? 14 / 16 : 0.92;
  const buffer = await renderIcon(source, size, occupancy);
  standard.set(size, buffer);

  const copies = [
    `public/brand/the-sync-exchange/app/blue-s-v1/favicon-${size}x${size}.png`
  ];

  if ([16, 32, 48, 64, 96].includes(size)) {
    copies.push(`public/favicon-${size}x${size}.png`);
  }
  if ([32, 64, 96, 192, 512].includes(size)) {
    copies.push(`public/brand/the-sync-exchange/app/favicon-${size}x${size}.png`);
  }
  if ([192, 512].includes(size)) {
    copies.push(`public/android-chrome-${size}x${size}.png`);
  }

  await writeCopies(buffer, copies);
}

const ico = buildIco(
  icoSizes.map((size) => standard.get(size)),
  icoSizes
);
await writeCopies(ico, [
  "public/favicon.ico",
  "public/brand/the-sync-exchange/app/blue-s-v1/favicon.ico"
]);

const apple = await renderIcon(source, 180, 0.8, BRAND_BACKGROUND);
await writeCopies(apple, [
  "public/apple-touch-icon.png",
  "public/brand/the-sync-exchange/app/apple-touch-icon-180x180.png",
  "public/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png"
]);

const appIcon = await renderIcon(source, 1024, 0.8, BRAND_BACKGROUND);
await writeCopies(appIcon, [
  "public/brand/the-sync-exchange/app/app-icon-1024x1024.png",
  "public/brand/the-sync-exchange/app/blue-s-v1/app-icon-1024x1024.png"
]);

for (const size of [192, 512]) {
  const maskable = await renderIcon(source, size, 0.68, BRAND_BACKGROUND);
  await writeCopies(maskable, [
    `public/android-chrome-maskable-${size}x${size}.png`,
    `public/brand/the-sync-exchange/app/blue-s-v1/maskable-${size}x${size}.png`
  ]);
}

console.log(
  `Generated ${standardSizes.length} transparent sizes, ${icoSizes.length} ICO entries, Apple/app icons, and maskable icons from ${path.relative(ROOT, SOURCE)}.`
);

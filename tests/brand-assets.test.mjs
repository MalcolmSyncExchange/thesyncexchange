import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const expectedPngDimensions = new Map([
  ["public/brand/the-sync-exchange/logos/website-header-logo-transparent.png", [1200, 700]],
  ["public/brand/the-sync-exchange/logos/website-footer-logo-transparent.png", [900, 525]],
  ["public/brand/the-sync-exchange/logos/website-mobile-header-logo-transparent.png", [600, 350]],
  ["public/brand/the-sync-exchange/logos/website-header-horizontal-logo-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-footer-horizontal-logo-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-logo-transparent.png", [900, 300]],
  ["public/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-footer-horizontal-dark-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-footer-horizontal-light-transparent.png", [1200, 400]],
  ["public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-dark-transparent.png", [900, 300]],
  ["public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-light-transparent.png", [900, 300]],
  ["public/brand/the-sync-exchange/logos/website-wordmark-transparent.png", [1200, 420]],
  ["public/brand/the-sync-exchange/logos/website-symbol-transparent.png", [1024, 1024]],
  ["public/brand/the-sync-exchange/logos/master-logo-transparent-2400x1400.png", [2400, 1400]],
  ["public/brand/the-sync-exchange/logos/master-logo-dark-2400x1400.png", [2400, 1400]],
  ["public/brand/the-sync-exchange/app/app-icon-1024x1024.png", [1024, 1024]],
  ["public/brand/the-sync-exchange/app/apple-touch-icon-180x180.png", [180, 180]],
  ["public/brand/the-sync-exchange/app/favicon-512x512.png", [512, 512]],
  ["public/brand/the-sync-exchange/app/favicon-192x192.png", [192, 192]],
  ["public/brand/the-sync-exchange/app/favicon-96x96.png", [96, 96]],
  ["public/brand/the-sync-exchange/app/favicon-64x64.png", [64, 64]],
  ["public/brand/the-sync-exchange/app/favicon-32x32.png", [32, 32]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-512x512.png", [512, 512]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-192x192.png", [192, 192]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-96x96.png", [96, 96]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-64x64.png", [64, 64]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-48x48.png", [48, 48]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-32x32.png", [32, 32]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/favicon-16x16.png", [16, 16]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png", [180, 180]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/app-icon-1024x1024.png", [1024, 1024]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/maskable-192x192.png", [192, 192]],
  ["public/brand/the-sync-exchange/app/blue-s-v1/maskable-512x512.png", [512, 512]],
  ["public/brand/the-sync-exchange/social/social-profile-logo-1080x1080.png", [1080, 1080]],
  ["public/brand/the-sync-exchange/social/social-share-og-1200x630.png", [1200, 630]],
  ["public/brand/the-sync-exchange/watermark/Watermark.png", [1024, 1024]],
  ["public/android-chrome-192x192.png", [192, 192]],
  ["public/android-chrome-512x512.png", [512, 512]],
  ["public/apple-touch-icon.png", [180, 180]],
  ["public/favicon-16x16.png", [16, 16]],
  ["public/favicon-32x32.png", [32, 32]],
  ["public/favicon-48x48.png", [48, 48]],
  ["public/favicon-64x64.png", [64, 64]],
  ["public/favicon-96x96.png", [96, 96]]
]);

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

const transparentLogoPaths = [
  "public/brand/the-sync-exchange/logos/website-header-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-footer-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-mobile-header-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-header-horizontal-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-footer-horizontal-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-logo-transparent.png",
  "public/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png",
  "public/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png",
  "public/brand/the-sync-exchange/logos/website-footer-horizontal-dark-transparent.png",
  "public/brand/the-sync-exchange/logos/website-footer-horizontal-light-transparent.png",
  "public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-dark-transparent.png",
  "public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-light-transparent.png",
  "public/brand/the-sync-exchange/logos/website-wordmark-transparent.png",
  "public/brand/the-sync-exchange/logos/website-symbol-transparent.png",
  "public/brand/the-sync-exchange/logos/master-logo-transparent-2400x1400.png"
];

test("approved logo and browser assets exist at their intended dimensions", async () => {
  for (const [path, dimensions] of expectedPngDimensions) {
    assert.deepEqual(pngDimensions(await readFile(path)), dimensions, path);
  }
});

test("transparent logo files retain an alpha channel", async () => {
  for (const path of transparentLogoPaths) {
    const png = await readFile(path);
    assert.ok([4, 6].includes(png[25]), `${path} must use an alpha-capable PNG color type`);
  }
});

test("clean wordmark and horizontal lockups contain no detached top artifact", async () => {
  const { data, info } = await sharp(
    "public/brand/the-sync-exchange/logos/website-wordmark-transparent.png"
  ).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const opaqueRows = [];
  for (let y = 0; y < info.height; y += 1) {
    let opaquePixels = 0;
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 0) opaquePixels += 1;
    }
    if (opaquePixels > 0) opaqueRows.push(y);
  }

  assert.equal(opaqueRows[0], 54);
  assert.equal(opaqueRows.at(-1), 366);
  assert.ok(!opaqueRows.some((row) => row >= 30 && row <= 47));
});

test("light and dark lockups preserve cyan and symbol pixels while changing only SYNC", async () => {
  const darkPath = "public/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png";
  const lightPath = "public/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png";
  const [dark, light] = await Promise.all([
    sharp(darkPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(lightPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);

  assert.deepEqual(dark.info, light.info);

  let changed = 0;
  let minX = dark.info.width;
  let maxX = -1;
  let minY = dark.info.height;
  let maxY = -1;
  let darkLuminance = 0;
  let lightLuminance = 0;

  for (let y = 0; y < dark.info.height; y += 1) {
    for (let x = 0; x < dark.info.width; x += 1) {
      const offset = (y * dark.info.width + x) * 4;
      if (
        dark.data[offset] === light.data[offset] &&
        dark.data[offset + 1] === light.data[offset + 1] &&
        dark.data[offset + 2] === light.data[offset + 2] &&
        dark.data[offset + 3] === light.data[offset + 3]
      ) continue;

      changed += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      darkLuminance += dark.data[offset] * 0.2126 + dark.data[offset + 1] * 0.7152 + dark.data[offset + 2] * 0.0722;
      lightLuminance += light.data[offset] * 0.2126 + light.data[offset + 1] * 0.7152 + light.data[offset + 2] * 0.0722;
    }
  }

  assert.ok(changed > 1_000);
  assert.ok(minX >= 360 && maxX <= 1_110, { minX, maxX });
  assert.ok(minY >= 120 && maxY <= 270, { minY, maxY });
  assert.ok(darkLuminance / changed > 150);
  assert.ok(lightLuminance / changed < 80);
});

test("standalone S preserves the approved master lower-tip geometry", async () => {
  const masterUpper = await sharp(
    "public/brand/the-sync-exchange/logos/master-logo-transparent-2400x1400.png"
  ).extract({ left: 0, top: 0, width: 2400, height: 920 }).png().toBuffer();
  const masterSymbol = await sharp(masterUpper)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });

  assert.equal(masterSymbol.info.width, 609);
  assert.equal(masterSymbol.info.height, 809);

  const resized = await sharp(masterSymbol.data)
    .resize({ height: 884, fit: "inside", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expected = Buffer.alloc(1024 * 1024 * 4);
  const left = Math.floor((1024 - resized.info.width) / 2);
  const top = 70;

  for (let y = 0; y < resized.info.height; y += 1) {
    for (let x = 0; x < resized.info.width; x += 1) {
      const sourceOffset = (y * resized.info.width + x) * 4;
      const destinationOffset = ((top + y) * 1024 + left + x) * 4;
      resized.data.copy(expected, destinationOffset, sourceOffset, sourceOffset + 4);
    }
  }

  const actual = await sharp(
    "public/brand/the-sync-exchange/logos/website-symbol-transparent.png"
  ).ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual, expected, "standalone S must use the intact rounded master artwork");
});

test("horizontal lockups preserve the full padded approved S geometry", async () => {
  const symbolPath = "public/brand/the-sync-exchange/logos/website-symbol-transparent.png";
  const cases = [
    {
      files: [
        "website-header-horizontal-logo-transparent.png",
        "website-header-horizontal-dark-transparent.png",
        "website-header-horizontal-light-transparent.png",
        "website-footer-horizontal-logo-transparent.png",
        "website-footer-horizontal-dark-transparent.png",
        "website-footer-horizontal-light-transparent.png"
      ],
      canvasWidth: 1200,
      width: 350,
      height: 400,
      symbolSize: 348,
      left: 35,
      top: 26
    },
    {
      files: [
        "website-mobile-header-horizontal-logo-transparent.png",
        "website-mobile-header-horizontal-dark-transparent.png",
        "website-mobile-header-horizontal-light-transparent.png"
      ],
      canvasWidth: 900,
      width: 260,
      height: 300,
      symbolSize: 261,
      left: 26,
      top: 20
    }
  ];

  for (const variant of cases) {
    const symbol = await sharp(symbolPath)
      .resize(variant.symbolSize, variant.symbolSize, { fit: "fill", kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const expected = Buffer.alloc(variant.width * variant.height * 4);
    for (let y = 0; y < variant.symbolSize; y += 1) {
      for (let x = 0; x < variant.symbolSize; x += 1) {
        const destinationX = variant.left + x;
        const destinationY = variant.top + y;
        if (destinationX >= variant.width || destinationY >= variant.height) continue;
        const sourceOffset = (y * variant.symbolSize + x) * 4;
        const destinationOffset = (destinationY * variant.width + destinationX) * 4;
        symbol.copy(expected, destinationOffset, sourceOffset, sourceOffset + 4);
      }
    }

    for (const file of variant.files) {
      const actual = await sharp(`public/brand/the-sync-exchange/logos/${file}`)
        .extract({ left: 0, top: 0, width: variant.width, height: variant.height })
        .ensureAlpha()
        .raw()
        .toBuffer();
      assert.deepEqual(actual, expected, `${file} must retain the approved S with its source padding`);
    }
  }
});

test("favicon.ico contains real 16, 32, 48 and 64 pixel icon entries", async () => {
  const favicon = await readFile("public/favicon.ico");
  assert.deepEqual([...favicon.subarray(0, 4)], [0, 0, 1, 0]);
  const count = favicon.readUInt16LE(4);
  assert.equal(count, 4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = favicon.readUInt8(entry) || 256;
    const height = favicon.readUInt8(entry + 1) || 256;
    const byteLength = favicon.readUInt32LE(entry + 8);
    const offset = favicon.readUInt32LE(entry + 12);
    assert.equal(width, height);
    assert.deepEqual([...favicon.subarray(offset, offset + 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(byteLength > 8);
    sizes.push(width);
  }
  assert.deepEqual(sizes, [16, 32, 48, 64]);

  const versioned = await readFile("public/brand/the-sync-exchange/app/blue-s-v1/favicon.ico");
  assert.deepEqual(versioned, favicon);
});

test("standard favicon family uses the canonical S at maximum safe occupancy", async () => {
  const source = await sharp(
    "public/brand/the-sync-exchange/logos/website-symbol-transparent.png"
  )
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  for (const size of [16, 32, 48, 64, 96, 192, 512]) {
    const path = `public/brand/the-sync-exchange/app/blue-s-v1/favicon-${size}x${size}.png`;
    const actual = await sharp(path)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const expected = await sharp(source)
      .resize({
        height: size === 16 ? 14 : Math.round(size * 0.92),
        fit: "inside",
        kernel: "lanczos3"
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    assert.deepEqual(
      [actual.info.width, actual.info.height, actual.info.channels],
      [expected.info.width, expected.info.height, expected.info.channels],
      path
    );
    let alphaDifference = 0;
    let colorDifference = 0;
    for (let offset = 0; offset < actual.data.length; offset += 4) {
      alphaDifference += Math.abs(actual.data[offset + 3] - expected.data[offset + 3]);
      colorDifference += Math.abs(actual.data[offset] - expected.data[offset]);
      colorDifference += Math.abs(actual.data[offset + 1] - expected.data[offset + 1]);
      colorDifference += Math.abs(actual.data[offset + 2] - expected.data[offset + 2]);
    }
    assert.ok(alphaDifference / (actual.data.length / 4) < 1, { path, alphaDifference });
    assert.ok(colorDifference / (actual.data.length * 0.75) < 2, { path, colorDifference });
    const occupancy = actual.info.height / size;
    assert.ok(occupancy >= 0.875 && occupancy <= 0.94, { path, occupancy });
  }
});

test("conventional root and legacy-compatible icon paths match the versioned blue S family", async () => {
  const copies = [
    ["public/favicon-16x16.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-16x16.png"],
    ["public/favicon-32x32.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-32x32.png"],
    ["public/favicon-48x48.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-48x48.png"],
    ["public/favicon-64x64.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-64x64.png"],
    ["public/favicon-96x96.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-96x96.png"],
    ["public/android-chrome-192x192.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-192x192.png"],
    ["public/android-chrome-512x512.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-512x512.png"],
    ["public/brand/the-sync-exchange/app/favicon-32x32.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-32x32.png"],
    ["public/brand/the-sync-exchange/app/favicon-64x64.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-64x64.png"],
    ["public/brand/the-sync-exchange/app/favicon-96x96.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-96x96.png"],
    ["public/brand/the-sync-exchange/app/favicon-192x192.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-192x192.png"],
    ["public/brand/the-sync-exchange/app/favicon-512x512.png", "public/brand/the-sync-exchange/app/blue-s-v1/favicon-512x512.png"],
    ["public/apple-touch-icon.png", "public/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png"],
    ["public/brand/the-sync-exchange/app/apple-touch-icon-180x180.png", "public/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png"],
    ["public/brand/the-sync-exchange/app/app-icon-1024x1024.png", "public/brand/the-sync-exchange/app/blue-s-v1/app-icon-1024x1024.png"],
    ["public/android-chrome-maskable-192x192.png", "public/brand/the-sync-exchange/app/blue-s-v1/maskable-192x192.png"],
    ["public/android-chrome-maskable-512x512.png", "public/brand/the-sync-exchange/app/blue-s-v1/maskable-512x512.png"]
  ];

  for (const [copy, canonical] of copies) {
    assert.deepEqual(await readFile(copy), await readFile(canonical), copy);
  }
});

test("Apple and maskable icons use the approved opaque brand treatment", async () => {
  const cases = [
    ["public/brand/the-sync-exchange/app/blue-s-v1/apple-touch-icon-180x180.png", 180],
    ["public/brand/the-sync-exchange/app/blue-s-v1/maskable-192x192.png", 192],
    ["public/brand/the-sync-exchange/app/blue-s-v1/maskable-512x512.png", 512]
  ];

  for (const [path, size] of cases) {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [size, size]);
    for (let offset = 3; offset < data.length; offset += 4) assert.equal(data[offset], 255, path);

    if (path.includes("maskable")) {
      const [backgroundR, backgroundG, backgroundB] = [data[0], data[1], data[2]];
      let furthestSymbolPixel = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const offset = (y * size + x) * 4;
          const differsFromBackground = Math.max(
            Math.abs(data[offset] - backgroundR),
            Math.abs(data[offset + 1] - backgroundG),
            Math.abs(data[offset + 2] - backgroundB)
          ) > 3;
          if (!differsFromBackground) continue;
          furthestSymbolPixel = Math.max(
            furthestSymbolPixel,
            Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)
          );
        }
      }
      assert.ok(furthestSymbolPixel <= size * 0.4, { path, furthestSymbolPixel });
    }
  }
});

test("verified legacy brand files remain removed", async () => {

  for (const path of [
    "public/favicon.svg",
    "public/brand/the-sync-exchange/logos/Primary_Logo_Dark_Mode.png",
    "public/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png",
    "public/brand/the-sync-exchange/logos/Icon_Gold.png",
    "public/brand/the-sync-exchange/app/AppIcon_1024.png",
    "public/brand/the-sync-exchange/app/AppIcon_512.png",
    "public/brand/the-sync-exchange/app/AppIcon_256.png"
  ]) {
    await assert.rejects(access(path), undefined, path);
  }
});

test("metadata uses the approved social image and new icon family", async () => {
  const [layout, manifest] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("app/manifest.ts", "utf8")
  ]);

  assert.match(layout, /social\/social-share-og-1200x630\.png/);
  assert.match(layout, /blue-s-v1\/favicon\.ico/);
  assert.match(layout, /blue-s-v1\/favicon-64x64\.png/);
  assert.match(layout, /blue-s-v1\/apple-touch-icon-180x180\.png/);
  assert.doesNotMatch(layout, /AppIcon_|Primary_Logo_|Icon_Gold|favicon\.svg/);
  assert.doesNotMatch(layout, /url: "\/favicon/);
  assert.match(manifest, /blue-s-v1\/favicon-192x192\.png/);
  assert.match(manifest, /blue-s-v1\/favicon-512x512\.png/);
  assert.match(manifest, /blue-s-v1\/maskable-192x192\.png/);
  assert.match(manifest, /blue-s-v1\/maskable-512x512\.png/);
  assert.match(manifest, /purpose: "any"/);
  assert.match(manifest, /purpose: "maskable"/);
});

test("shared brand component maps each UI role to its approved asset", async () => {
  const source = await readFile("components/layout/brand-assets.tsx", "utf8");

  for (const asset of [
    "website-header-horizontal-dark-transparent.png",
    "website-header-horizontal-light-transparent.png",
    "website-mobile-header-horizontal-dark-transparent.png",
    "website-mobile-header-horizontal-light-transparent.png",
    "website-symbol-transparent.png"
  ]) {
    assert.match(source, new RegExp(asset.replaceAll(".", "\\.")));
  }

  for (const nonHorizontalAsset of [
    "website-header-logo-transparent.png",
    "website-mobile-header-logo-transparent.png",
    "website-footer-logo-transparent.png",
    "website-wordmark-transparent.png",
    "website-header-horizontal-logo-transparent.png",
    "website-mobile-header-horizontal-logo-transparent.png",
    "website-footer-horizontal-logo-transparent.png"
  ]) {
    assert.doesNotMatch(source, new RegExp(nonHorizontalAsset.replaceAll(".", "\\.")));
  }

  const footerComponent = source.slice(
    source.indexOf("export function BrandFooterLogo"),
    source.indexOf("export function BrandIcon")
  );
  assert.match(footerComponent, /website-header-horizontal-light-transparent\.png/);
  assert.match(footerComponent, /website-header-horizontal-dark-transparent\.png/);
  assert.doesNotMatch(footerComponent, /website-footer-horizontal/);

  assert.match(source, /h-auto/);
  assert.doesNotMatch(source, /object-cover|overflow-hidden/);
});

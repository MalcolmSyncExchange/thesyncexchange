import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const assets = {
  'public/images/sync-sound-sculpture-hero.webp': '874b0b4ac2dde89eb545296997208fc12d3c57950c259f3c499b5cb3833a91ef',
  'public/images/sync-sound-sculpture-hero-mobile.webp': '1c63821f749566aaab92b13ebf06405c487384a6197f70ea5891e987abc4f9c8',
  'public/images/sync-sound-sculpture-hero-mobile-400.webp': 'fd0328c65ce21b4dc0d5c338754706309b475f9745498ee89a669044cd29ffe4',
  'public/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png': 'baa47f61f503e6b72d6dd9bb2a6c932905eb8ad010fc65b9b5b4afc103de5eab',
  'public/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png': 'fe10774b93ee425164accfc11cdbf2ecab0f49eec748418452678b1b18823942',
  'public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-dark-transparent.png': '93352806c2927968ff3e11ebe94a415186c6866427f4926eadb882bce41fa154',
  'public/brand/the-sync-exchange/logos/website-mobile-header-horizontal-light-transparent.png': '68cbe217cd3baaaa1f44f888a8767f49e88640aaf752c65ddf2128f4e9fddc65'
};

test('restoration preserves exact approved PR26 artwork and theme-specific logo bytes', () => {
  for (const [file, hash] of Object.entries(assets)) {
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash, file);
  }
});

// Render the real Next Image component, rather than a mock that ignores
// optimization, to catch a return to the colliding /_next/image URLs.
const source = readFileSync('components/layout/brand-assets.tsx', 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
} }).outputText;
const compiled = { exports: {} };
new Function('require', 'module', 'exports', javascript)(
  id => id === '@/lib/utils' ? { cn: (...values) => values.filter(Boolean).join(' ') } : require(id),
  compiled, compiled.exports
);

for (const component of ['BrandLogo', 'BrandHeaderLogo', 'BrandFooterLogo']) {
  test(component + ' delivers separate original dark/light paths without optimizer cache aliasing', () => {
    const html = renderToStaticMarkup(React.createElement(compiled.exports[component]));
    assert.match(html, /src="\/brand\/the-sync-exchange\/logos\/website-header-horizontal-dark-transparent\.png"/);
    assert.match(html, /src="\/brand\/the-sync-exchange\/logos\/website-header-horizontal-light-transparent\.png"/);
    assert.doesNotMatch(html, /\/_next\/image/);
    assert.match(html, /alt="The Sync Exchange"/);
    if (component === 'BrandHeaderLogo') {
      assert.match(html, /media="\(max-width: 1000px\)"/);
      assert.match(html, /website-mobile-header-horizontal-dark-transparent\.png/);
      assert.match(html, /website-mobile-header-horizontal-light-transparent\.png/);
    }
  });
}

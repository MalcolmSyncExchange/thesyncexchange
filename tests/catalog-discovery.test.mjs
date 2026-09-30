import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCatalogFilters, filterCatalog, getCatalogPrice } from '../lib/catalog-discovery.ts';
const option = (name, base_price, price_override = null, active = true) => ({ name, slug: name, base_price, price_override, active });
const track = (title, options, overrides = {}) => ({ title, artist_name: 'Maya Sol', genre: 'Electronic', subgenre: '', mood: ['Driving'], bpm: 118, vocals: false, instrumental: true, explicit: false, featured: false, license_options: options, ...overrides });
test('minimum available price uses base fallback, preserves zero and skips inactive or invalid licenses', () => {
 assert.deepEqual(getCatalogPrice(track('A', [option('Base', 2500), option('Disabled', 1, null, false), option('Override', 5000, 1200)])), { amount: 1200, name: 'Override' });
 assert.equal(getCatalogPrice(track('Zero', [option('Zero', 100, 0)])).amount, 0);
 assert.equal(getCatalogPrice(track('Missing', [])), null);
 assert.equal(getCatalogPrice(track('Invalid', [option('Invalid', NaN), option('Negative', -1)])), null);
});
test('budget and sort use the price of the selected license rather than the first array item', () => {
 const a = track('A', [option('Film', 5000), option('Social', 1000)]);
 const b = track('B', [option('Social', 2000), option('Film', 3000)]);
 assert.deepEqual(filterCatalog([a,b], { ...defaultCatalogFilters, sort:'price-low' }).map(t=>t.title), ['A','B']);
 assert.deepEqual(filterCatalog([a,b], { ...defaultCatalogFilters, licenseType:'Film', sort:'price-low' }).map(t=>t.title), ['B','A']);
 assert.deepEqual(filterCatalog([a,b], { ...defaultCatalogFilters, licenseType:'Film', priceBand:'under-2000' }), []);
});
test('search matches moods and ignores leading whitespace and case; all filters combine', () => {
 const a=track('A',[option('Social',1000)]); const b=track('B',[option('Social',3000)],{ vocals:true,instrumental:false });
 assert.deepEqual(filterCatalog([a,b], {...defaultCatalogFilters,query:' DRIVING ',vocalProfile:'instrumental',minBpm:'100',maxBpm:'120'}).map(t=>t.title),['A']);
 assert.equal(filterCatalog([a], {...defaultCatalogFilters,minBpm:'140',maxBpm:'100'}).length,0);
});
test('missing prices never match a budget and sort after actual prices',()=>{
 const missing=track('Missing',[]);const valid=track('Valid',[option('Social',100)]);
 assert.deepEqual(filterCatalog([missing,valid],{...defaultCatalogFilters,priceBand:'under-2000'}).map(t=>t.title),['Valid']);
 assert.deepEqual(filterCatalog([missing,valid],{...defaultCatalogFilters,sort:'price-low'}).map(t=>t.title),['Valid','Missing']);
});
test('budget boundaries are unambiguous and filtering does not mutate the catalog',()=>{
 const tracks=[track('Low',[option('A',1999)]),track('Mid',[option('A',2000)]),track('High',[option('A',5000)]),track('Over',[option('A',5001)])];
 assert.deepEqual(filterCatalog(tracks,{...defaultCatalogFilters,priceBand:'2000-5000'}).map(t=>t.title),['Mid','High']);
 assert.deepEqual(filterCatalog(tracks,{...defaultCatalogFilters,priceBand:'5000-plus'}).map(t=>t.title),['Over']);
 assert.deepEqual(tracks.map(t=>t.title),['Low','Mid','High','Over']);
});

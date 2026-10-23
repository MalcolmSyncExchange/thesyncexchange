import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, copyFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
const fixture = new URL("../app/v2-sec-intelligence-fixture-local/", import.meta.url);
await mkdir(fixture); // Fail safely if another run owns this directory.
let server;
let browser;
try {
 await copyFile(new URL("./fixtures/sec-intelligence-page.tsx.fixture", import.meta.url),new URL("page.tsx",fixture));
 server = spawn("./node_modules/.bin/next",["dev","--hostname","127.0.0.1","--port","3104"],{env:{...process.env,SYNC_EXCHANGE_DEMO_MODE:"true"},stdio:"ignore"});
 let ready=false;
 for(let i=0;i<60;i++) {
  if(server.exitCode !== null) throw new Error("Local fixture server failed to start.");
  try { ready=(await fetch("http://127.0.0.1:3104/v2-sec-intelligence-fixture-local")).ok; } catch {}
  if(ready) break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready) throw new Error("Local fixture server was not ready.");
 browser = await chromium.launch({headless:true});
 const page=await browser.newPage(); page.setDefaultTimeout(15000);
 await page.goto("http://127.0.0.1:3104/v2-sec-intelligence-fixture-local");
 await page.getByRole("heading",{name:"SEC Intelligence",exact:true}).waitFor();
 await page.locator("section select").selectOption("submission_completed");
 const points=page.getByRole("button",{name:/2026-01-0[123]T/});
 assert.equal(await points.count(),3);
 await points.nth(1).hover();
 assert.match(await page.getByRole("tooltip").innerText(),/Completed submissions: 1/);
 await points.nth(0).focus();
 assert.match(await page.getByRole("tooltip").innerText(),/Completed submissions: 0/);
 await page.keyboard.press("ArrowRight");
 assert.match(await page.getByRole("tooltip").innerText(),/Completed submissions: 1/);
 assert.match(await page.getByRole("tooltip").innerText(),/Provisional/);
 assert.match(await page.getByRole("tooltip").innerText(),/Previous: 0/);
 for(const width of [390,1280]) {
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
 }
 assert.equal(await page.getByRole("navigation",{name:"SEC Intelligence"}).getByRole("link").count(),4);
 assert.equal(await page.locator('input[name="compare"]').isChecked(),true);
 console.log("PASS: hover, actual zero/nonzero values, focus, arrow navigation, previous-period values, provisional status, 390/1280px layout, navigation and date controls");
} finally { await browser?.close(); server?.kill("SIGTERM"); await rm(fixture,{recursive:true,force:true}); }

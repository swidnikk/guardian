// Usage: node test/catalog.measure.mjs <out dir> [width height]. Prints the filter panel's full content height (B-01 before/after).
import puppeteer from 'puppeteer-core';
const [dir, w = '1400', h = '900'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
await p.goto('file://' + dir + '/index.html'); await p.waitForSelector('html[data-ready="1"]');
console.log(await p.evaluate(() => { const f = document.getElementById('filters'); return { scrollHeight: f.scrollHeight, clientHeight: f.clientHeight }; }));
await b.close();

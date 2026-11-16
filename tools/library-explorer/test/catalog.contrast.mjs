// Worst-case background luminance behind header text, per header art class (text hidden, pixels sampled).
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1300, height: 850 });
await p.goto((process.argv[2] || 'http://127.0.0.1:8412/') + '?include_deprecated=1&include_superseded=1', { waitUntil: 'load' });
await p.waitForSelector('html[data-ready]');
await p.addStyleTag({ content: '.card-head *{color:transparent!important}' });
const seen = new Set(); const res = [];
for (const h of await p.$$('.card-head')) {
  const cls = await h.evaluate((e) => e.className);
  if (seen.has(cls)) continue; seen.add(cls);
  await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const buf = await h.screenshot({ encoding: 'base64' });
  const lum = await p.evaluate(async (d) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const a = x.getImageData(0, 0, c.width, c.height).data; let mn = 9;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < a.length; i += 4) { const L = 0.2126 * f(a[i]) + 0.7152 * f(a[i + 1]) + 0.0722 * f(a[i + 2]); if (L < mn) mn = L; }
    return mn;
  }, buf);
  res.push(`${cls} minL=${lum.toFixed(3)} contrast vs ink #14201f=${((lum + 0.05) / (0.012 + 0.05)).toFixed(1)}`);
}
console.log(res.join('\n'));
await b.close();

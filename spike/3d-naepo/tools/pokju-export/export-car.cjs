const {chromium} = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']}); const p = await b.newPage();
  const logs = []; p.on('pageerror', e => logs.push('err ' + e.message));
  await p.goto('file://' + process.argv[2]); await p.waitForFunction(() => window.__pokju, null, {timeout: 120000});
  console.log('cars', (await p.evaluate(() => window.__pokju.keys)).join(','));
  for (const key of process.argv.slice(4)) { const b64 = await p.evaluate(k => window.__pokju.exportCar(k), key); fs.writeFileSync(process.argv[3] + '/' + key + '.glb', Buffer.from(b64, 'base64')); console.log(key, Buffer.from(b64, 'base64').length); }
  console.log(logs.join('\n')); await b.close();
})();

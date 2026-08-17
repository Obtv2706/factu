'use strict';

const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const step = (name) => console.log('  ✓', name);
  const fail = (name, err) => { console.log('  ✗ ' + name + ' -> ' + err.message); process.exitCode = 1; };

  try {
    await page.goto(BASE + '/#/login', { waitUntil: 'networkidle0' });
    await page.type('#login-email', 'admin@factu.app');
    await page.type('#login-pass', 'admin123');
    await Promise.all([page.waitForSelector('.projects-grid, .empty', { timeout: 10000 }), page.click('#login-form button')]);
    step('login + dashboard');

    await page.evaluate(() => API.post('/api/projects', {
      client_name: 'Cliente E2E', project_name: 'Prueba E2E', default_profit_pct: 25,
      stages: [{ name: 'Concreto', profit_pct: 25, items: [{ description: 'Piso', qty: 10, unit: 'cyds', cost: 100 }] }],
    }));
    await page.goto(BASE + '/#/dashboard', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.project-card');
    const hasCard = await page.evaluate(() => document.body.innerText.includes('Prueba E2E'));
    if (!hasCard) throw new Error('project card not found');
    step('dashboard shows project');

    const ids = await page.evaluate(async () => {
      const res = await API.get('/api/projects');
      const p = res.projects.find((x) => x.project_name === 'Prueba E2E');
      return p ? p.id : null;
    });
    await page.goto(BASE + '/#/project/' + ids, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.stage-card');
    const totals = await page.evaluate(() => ({
      price: document.querySelector('#g-price').textContent,
      profit: document.querySelector('#g-profit').textContent,
      stagePct: document.querySelector('#stage-profitpct-0').textContent,
    }));
    if (totals.price !== '$1,250.00') throw new Error('total price wrong: ' + totals.price);
    if (totals.profit !== '$250.00') throw new Error('profit wrong: ' + totals.profit);
    if (totals.stagePct !== '25.00%') throw new Error('stage pct wrong: ' + totals.stagePct);
    step('editor totals (10x100 +25% = $1,250, ganancia $250)');

    await page.evaluate(() => {
      const input = document.querySelector('[data-s="0"][data-i="0"][data-field="cost"]');
      input.value = '200';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));
    const newTotal = await page.evaluate(() => document.querySelector('#g-price').textContent);
    if (newTotal !== '$2,500.00') throw new Error('live recalc wrong: ' + newTotal);
    step('live recalculation on cost edit');

    await page.evaluate(() => {
      const pct = document.querySelector('[data-s="0"][data-field="profit_pct"]');
      pct.value = '40';
      pct.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));
    const pctTotal = await page.evaluate(() => document.querySelector('#g-price').textContent);
    if (pctTotal !== '$2,800.00') throw new Error('profit% change wrong: ' + pctTotal);
    step('per-stage profit % change (40% -> $2,800)');

    await page.evaluate(() => EditorView.save());
    await new Promise((r) => setTimeout(r, 800));
    await page.click('[data-act="back"]');
    await page.waitForSelector('.projects-grid, .empty');
    step('saved and returned to dashboard');

    const pdfOk = await page.evaluate(() => {
      const data = { project: { project_name: 'Prueba', client_name: 'Cli', currency: '$' }, stages: [{ name: 'S', profit_pct: 25, items: [{ description: 'X', qty: 2, unit: 'lft', cost: 50 }] }] };
      const doc = PdfExport.build(data, { company_name: 'Empresa' });
      return typeof doc.output === 'function';
    });
    if (!pdfOk) throw new Error('pdf build failed');
    step('PDF generation (client-side, no profit fields)');

    const pdfNoProfit = await page.evaluate(() => {
      const pagesContain = (doc, text) => {
        const hex = Array.from(text).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
        const all = doc.internal.pages.filter(Boolean).flat().join(' ');
        return all.includes('(' + text + ')') || all.includes(hex);
      };
      const data = { project: { project_name: 'Prueba', client_name: 'Cli', currency: '$' }, stages: [{ name: 'S', profit_pct: 25, items: [{ description: 'X', qty: 2, unit: 'lft', cost: 50 }] }] };
      const doc = PdfExport.build(data, { company_name: 'Empresa' });
      return {
        hasPrecio: pagesContain(doc, 'Precio'),
        hasUnidad: pagesContain(doc, 'Unidad'),
        noGanancia: !pagesContain(doc, 'ganancia') && !pagesContain(doc, 'Ganancia'),
        noCosto: !pagesContain(doc, 'Costo') && !pagesContain(doc, 'costo'),
      };
    });
    if (!pdfNoProfit.hasPrecio || !pdfNoProfit.hasUnidad || !pdfNoProfit.noGanancia || !pdfNoProfit.noCosto) {
      throw new Error('pdf leaks profit info: ' + JSON.stringify(pdfNoProfit));
    }
    step('PDF does not contain profit/cost info');

    await page.goto(BASE + '/#/dashboard', { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-act=example]');
    const exampleRes = await page.evaluate(async () => {
      const res = await fetch('/sample/Construccion Estimado2.csv');
      const text = await res.text();
      const payload = CsvImport.parseCsv(text);
      return { stages: payload.stages.length, items: payload.stages.reduce((a, s) => a + s.items.length, 0), hasExcluded: payload.stages.some((s) => s.excluded) };
    });
    if (!exampleRes.stages || !exampleRes.items) throw new Error('csv parse empty');
    if (!exampleRes.hasExcluded) throw new Error('ebanisteria should be excluded');
    step('CSV example import parse (' + exampleRes.stages + ' etapas, ' + exampleRes.items + ' ítems, excluida ok)');

    const exampleTotal = await page.evaluate(async () => {
      const res = await fetch('/sample/Construccion Estimado2.csv');
      const payload = CsvImport.parseCsv(await res.text());
      let price = 0, cost = 0;
      for (const s of payload.stages) {
        if (s.excluded) continue;
        for (const it of s.items) { cost += it.qty * it.cost; price += it.qty * it.cost * (1 + s.profit_pct / 100); }
      }
      return { cost: Math.round(cost), price: Math.round(price) };
    });
    console.log('    (imported total: costo $' + exampleTotal.cost + ', precio $' + exampleTotal.price + ' — archivo: $147,396 / $177,245)');
    step('CSV example totals computed');

  } catch (err) {
    fail('test', err);
  }

  if (errors.length) {
    console.log('  ⚠ Browser errors:');
    errors.forEach((e) => console.log('    ' + e));
  }
  await browser.close();
})();

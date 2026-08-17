window.CsvImport = (function () {
  const cleanCell = (c) => (c == null ? '' : String(c).trim());

  function parseCsv(text) {
    const rows = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' }).data.map((r) =>
      r.map(cleanCell)
    );
    const stages = [];
    let cur = null;
    let seenHeader = false;

    for (const row of rows) {
      const c0 = row[0] || '', c1 = row[1] || '', c2 = row[2] || '', c3 = row[3] || '', c4 = row[4] || '', c5 = row[5] || '';
      if (!seenHeader) {
        if (c2 && c2.toUpperCase() === 'QTY') { seenHeader = true; }
        continue;
      }
      if (c0 && /^\d/.test(c0)) {
        const name = c0.replace(/\s+/g, ' ').trim();
        const excluded = /not in contract/i.test(name) || /ebanister/i.test(name);
        cur = { name, profit_pct: 0, excluded, note: excluded ? 'NOT IN CONTRACT' : '', items: [], fromCsv: true };
        stages.push(cur);
        continue;
      }
      if (c0 && c0.startsWith('$') && c1) continue;
      if (/total/i.test(c3) || /total/i.test(c0)) continue;
      if (!c1 && !c2 && !c4 && !c5) continue;

      const hasPrice = c4 !== '' || c5 !== '';

      if (c1 && !c2 && !hasPrice) {
        if (cur) {
          cur.items.push({ description: c1, qty: 0, unit: '', cost: 0 });
        }
        continue;
      }
      if (!c1) continue;

      let qty = c2 ? parseFloat(c2.replace(/,/g, '')) : 0;
      if (!Number.isFinite(qty)) qty = 0;
      let unit = c3;
      if (c2 === '' && hasPrice) { qty = 1; unit = unit || 'ls'; }
      let cost = c4 ? parseFloat(c4.replace(/[$,]/g, '')) : 0;
      if (!Number.isFinite(cost)) cost = 0;
      let price = c5 ? parseFloat(c5.replace(/[$,]/g, '')) : NaN;

      if (!cur || !cur.fromCsv) {
        cur = { name: 'Costos Generales', profit_pct: 0, excluded: false, note: '', items: [], fromCsv: true };
        stages.push(cur);
      }
      cur.items.push({ description: c1, qty, unit, cost, _price: Number.isFinite(price) ? price : null });
    }

    for (const s of stages) {
      s.items = s.items.filter((it) => it.description !== '');
      let sc = 0, sp = 0;
      for (const it of s.items) {
        sc += it.qty * it.cost;
        if (it._price != null) sp += it.qty * it._price;
      }
      if (sc > 0 && sp > 0) {
        s.profit_pct = Math.round(((sp / sc) - 1) * 10000) / 100;
      }
      if (s.profit_pct < 0) s.profit_pct = 0;
      if (s.profit_pct > 1000) s.profit_pct = 1000;
      for (const it of s.items) delete it._price;
    }

    let tc = 0, tp = 0;
    for (const s of stages) {
      if (s.excluded) continue;
      for (const it of s.items) tc += it.qty * it.cost;
    }
    let defaultPct = 25;
    if (tc > 0) {
      const filePrice = estimateFilePrice(stages);
      if (filePrice > 0) defaultPct = Math.round(((filePrice / tc) - 1) * 10000) / 100;
      if (defaultPct < 0) defaultPct = 0;
    }

    return {
      client_name: '',
      project_name: '',
      currency: '$',
      default_profit_pct: defaultPct,
      stages,
    };
  }

  function estimateFilePrice(stages) {
    let total = 0;
    for (const s of stages) {
      if (s.excluded) continue;
      for (const it of s.items) {
        total += it.qty * (it.cost * (1 + s.profit_pct / 100));
      }
    }
    return total;
  }

  function normalizeJson(data) {
    const p = data && data.project ? data.project : data || {};
    const stages = (data && data.stages) || p.stages || [];
    return {
      client_name: p.client_name || '',
      project_name: p.project_name || '',
      phone: p.phone || '',
      email: p.email || '',
      address: p.address || '',
      date: p.date || '',
      currency: p.currency || '$',
      notes: p.notes || '',
      default_profit_pct: Number(p.default_profit_pct) || 25,
      stages: stages.map((s) => ({
        name: s.name || 'Etapa',
        profit_pct: Number(s.profit_pct) || 0,
        excluded: !!s.excluded,
        note: s.note || '',
        items: (s.items || []).map((it) => ({
          description: it.description || '',
          qty: Number(it.qty) || 0,
          unit: it.unit || '',
          cost: Number(it.cost) || 0,
        })),
      })),
    };
  }

  async function upload(file) {
    const text = await file.text();
    const isJson = /\.json$/i.test(file.name);
    const payload = isJson ? normalizeJson(JSON.parse(text)) : parseCsv(text);
    const saved = await API.post('/api/projects/import', payload);
    return saved;
  }

  return { parseCsv, normalizeJson, upload };
})();

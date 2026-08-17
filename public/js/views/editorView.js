window.EditorView = {
  container: null,
  id: null,
  meta: null,
  stages: [],
  settings: {},
  dirty: false,

  async mount(container, id) {
    this.container = container;
    this.id = Number(id);
    this.dirty = false;
    container.innerHTML = '<div class="spinner"></div>';
    try {
      const [data, s] = await Promise.all([
        API.get('/api/projects/' + this.id),
        API.get('/api/settings').catch(() => ({ settings: {} })),
      ]);
      this.meta = data.project;
      this.stages = data.stages || [];
      this.settings = s.settings || {};
      this.render();
    } catch (err) {
      container.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
    }
  },

  metaPayload() {
    return {
      client_name: this.meta.client_name,
      project_name: this.meta.project_name,
      phone: this.meta.phone,
      email: this.meta.email,
      address: this.meta.address,
      date: this.meta.date,
      currency: this.meta.currency || '$',
      notes: this.meta.notes,
      default_profit_pct: Number(this.meta.default_profit_pct) || 25,
    };
  },

  render() {
    const m = this.meta;
    const stagesHtml = this.stages.map((s, si) => this.stageHtml(si)).join('');
    const currencyInput = `<input type="text" style="width:70px" data-meta="currency" value="${App.escAttr(m.currency || '$')}">`;

    this.container.innerHTML = `
      <div class="container" style="max-width:1100px">
        <div class="editor-topbar">
          <button class="btn btn-secondary btn-sm" data-act="back">← Mis estimados</button>
          <span class="save-state saved" id="save-state">Guardado</span>
          <span class="spacer"></span>
          <button class="btn btn-secondary btn-sm" data-act="export">JSON</button>
          <button class="btn btn-wa btn-sm" data-act="wa" title="Enviar resumen por WhatsApp">WhatsApp</button>
          <button class="btn btn-secondary btn-sm" data-act="share" title="Compartir PDF">Compartir</button>
          <button class="btn btn-primary btn-sm" data-act="pdf">Descargar PDF</button>
          <button class="btn btn-success btn-sm" data-act="save">Guardar</button>
        </div>

        <div class="panel">
          <h2>Datos del estimado</h2>
          <div class="form-grid">
            <div class="field"><label>Cliente</label><input data-meta="client_name" value="${App.escAttr(m.client_name)}"></div>
            <div class="field"><label>Proyecto</label><input data-meta="project_name" value="${App.escAttr(m.project_name)}"></div>
            <div class="field"><label>Teléfono</label><input data-meta="phone" value="${App.escAttr(m.phone)}"></div>
            <div class="field"><label>Email</label><input data-meta="email" value="${App.escAttr(m.email)}"></div>
            <div class="field"><label>Dirección</label><input data-meta="address" value="${App.escAttr(m.address)}"></div>
            <div class="field"><label>Fecha</label><input data-meta="date" value="${App.escAttr(m.date)}"></div>
            <div class="field"><label>Moneda</label>${currencyInput}</div>
            <div class="field"><label>% ganancia por defecto (etapas nuevas)</label><input type="number" step="0.1" data-meta="default_profit_pct" value="${m.default_profit_pct != null ? m.default_profit_pct : 25}"></div>
            <div class="field" style="grid-column:1/-1"><label>Notas / condiciones</label><textarea data-meta="notes">${App.esc(m.notes)}</textarea></div>
          </div>
        </div>

        <div class="panel">
          <h2>Etapas e ítems</h2>
          <p class="small muted mb">La ganancia de cada etapa solo se muestra en la app, nunca en el PDF enviado al cliente.</p>
          <div id="stages">${stagesHtml}</div>
          <button class="btn btn-secondary" data-act="stage-add">+ Agregar etapa</button>
        </div>

        <div class="panel">
          <h2>Totales</h2>
          <div class="totals-panel">
            <div class="t-item"><div class="t-label">Costo total</div><div class="t-value" id="g-cost"></div></div>
            <div class="t-item total"><div class="t-label">Precio del estimado</div><div class="t-value" id="g-price"></div></div>
            <div class="t-item profit"><div class="t-label">Ganancia</div><div class="t-value" id="g-profit"></div></div>
            <div class="t-item profit"><div class="t-label">% Ganancia</div><div class="t-value" id="g-profitpct"></div></div>
          </div>
        </div>
      </div>`;

    this.bind();
    this.updateTotals();
  },

  stageHtml(si) {
    const s = this.stages[si];
    const items = s.items.map((it, ii) => this.itemHtml(si, ii)).join('');
    return `
      <div class="stage-card ${s.excluded ? 'excluded' : ''}" id="stage-${si}">
        <div class="stage-head">
          <input class="st-name" data-s="${si}" data-field="name" value="${App.escAttr(s.name)}" placeholder="Nombre de la etapa">
          <span class="badge-profit">Ganancia:</span>
          <input class="st-pct" type="number" step="0.1" data-s="${si}" data-field="profit_pct" value="${s.profit_pct != null ? s.profit_pct : 0}">
          <span>%</span>
          ${s.excluded ? '<span class="badge-excluded">FUERA DEL CONTRATO</span>' : ''}
          <input class="st-note" data-s="${si}" data-field="note" value="${App.escAttr(s.note)}" placeholder="Nota de la etapa (opcional)">
          <label class="check-wrap"><input type="checkbox" data-s="${si}" data-field="excluded" ${s.excluded ? 'checked' : ''}> Excluir del total</label>
          <div class="st-actions">
            <button class="icon-btn" data-act="stage-up" data-s="${si}" title="Subir etapa">↑</button>
            <button class="icon-btn" data-act="stage-down" data-s="${si}" title="Bajar etapa">↓</button>
            <button class="icon-btn danger" data-act="stage-del" data-s="${si}" title="Eliminar etapa">✕</button>
          </div>
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width:74px">Cant.</th>
              <th style="width:84px">Unidad</th>
              <th>Descripción</th>
              <th style="width:120px">Costo unit.</th>
              <th style="width:120px">Precio</th>
              <th style="width:96px"></th>
            </tr>
          </thead>
          <tbody>
            ${items}
            <tr class="add-row-row"><td colspan="6"><button class="btn btn-secondary btn-sm" data-act="item-add" data-s="${si}">+ Agregar ítem</button></td></tr>
          </tbody>
        </table>
        <div class="stage-foot">
          <span class="st-total-item">Costo: <b id="stage-cost-${si}"></b></span>
          <span class="st-total-item">Precio: <b id="stage-price-${si}"></b></span>
          <span class="st-total-item">Ganancia: <b id="stage-profit-${si}" style="color:var(--success)"></b></span>
          <span class="st-total-item">%: <b id="stage-profitpct-${si}" style="color:var(--success)"></b></span>
          <span class="spacer"></span>
          <button class="btn btn-secondary btn-sm" data-act="stage-dup" data-s="${si}">Duplicar etapa</button>
        </div>
      </div>`;
  },

  itemHtml(si, ii) {
    const it = this.stages[si].items[ii];
    return `
      <tr id="item-${si}-${ii}">
        <td><input class="num-input" type="text" inputmode="decimal" data-s="${si}" data-i="${ii}" data-field="qty" value="${it.qty || ''}" placeholder="0"></td>
        <td><input data-s="${si}" data-i="${ii}" data-field="unit" value="${App.escAttr(it.unit)}" placeholder="lft, sqft..."></td>
        <td class="cell-desc"><input data-s="${si}" data-i="${ii}" data-field="description" value="${App.escAttr(it.description)}" placeholder="Descripción del ítem..."></td>
        <td><input class="num-input" type="text" inputmode="decimal" data-s="${si}" data-i="${ii}" data-field="cost" value="${it.cost || ''}" placeholder="0.00"></td>
        <td class="price-cell" id="price-${si}-${ii}"></td>
        <td><div class="row-actions">
          <button class="icon-btn" data-act="item-up" data-s="${si}" data-i="${ii}" title="Subir">↑</button>
          <button class="icon-btn" data-act="item-down" data-s="${si}" data-i="${ii}" title="Bajar">↓</button>
          <button class="icon-btn" data-act="item-dup" data-s="${si}" data-i="${ii}" title="Duplicar">⧉</button>
          <button class="icon-btn danger" data-act="item-del" data-s="${si}" data-i="${ii}" title="Eliminar">✕</button>
        </div></td>
      </tr>`;
  },

  bind() {
    const root = this.container;

    root.querySelector('[data-act=back]').addEventListener('click', () => this.leave());
    root.querySelector('[data-act=save]').addEventListener('click', () => this.save());
    root.querySelector('[data-act=pdf]').addEventListener('click', () => this.downloadPdf());
    root.querySelector('[data-act=share]').addEventListener('click', () => this.sharePdf());
    root.querySelector('[data-act=wa]').addEventListener('click', () => this.whatsapp());
    root.querySelector('[data-act=export]').addEventListener('click', () => this.exportJson());

    root.querySelectorAll('[data-meta]').forEach((el) => {
      el.addEventListener('input', () => {
        const field = el.dataset.meta;
        const v = field === 'notes' || field === 'client_name' || field === 'project_name'
          ? el.value
          : field === 'currency'
            ? (el.value || '$')
            : el.value;
        this.meta[field] = field === 'default_profit_pct' ? Number(el.value) : v;
        this.markDirty();
      });
    });

    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.meta) return;
      const s = el.dataset.s;
      if (s === undefined) return;
      const item = this.stages[s];
      const field = el.dataset.field;
      if (el.dataset.i === undefined) {
        if (field === 'excluded') return;
        item[field] = field === 'profit_pct' ? Number(el.value) : el.value;
        if (field === 'profit_pct' || field === 'name') this.updateTotals();
        this.markDirty();
        return;
      }
      const it = item.items[Number(el.dataset.i)];
      if (field === 'qty' || field === 'cost') {
        it[field] = Money.num(el.value);
        this.updateTotals();
      } else {
        it[field] = el.value;
      }
      this.markDirty();
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.type === 'checkbox' && el.dataset.field === 'excluded') {
        const s = Number(el.dataset.s);
        this.stages[s].excluded = el.checked;
        this.updateTotals();
        this.markDirty();
        this.recomputePctBadge(s);
        return;
      }
      if (el.dataset.field === 'qty' || el.dataset.field === 'cost') {
        const it = this.stages[Number(el.dataset.s)].items[Number(el.dataset.i)];
        if (el.value !== '') el.value = String(Math.round(it[el.dataset.field] * 100) / 100);
      }
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const s = Number(btn.dataset.s);
      const i = Number(btn.dataset.i);
      if (act === 'item-add') { this.addItem(s); return; }
      if (act === 'item-del') { this.delItem(s, i); return; }
      if (act === 'item-up') { this.moveItem(s, i, -1); return; }
      if (act === 'item-down') { this.moveItem(s, i, 1); return; }
      if (act === 'item-dup') { this.dupItem(s, i); return; }
      if (act === 'stage-add') { this.addStage(); return; }
      if (act === 'stage-del') { this.delStage(s); return; }
      if (act === 'stage-up') { this.moveStage(s, -1); return; }
      if (act === 'stage-down') { this.moveStage(s, 1); return; }
      if (act === 'stage-dup') { this.dupStage(s); return; }
    });

    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });
  },

  recomputePctBadge(s) {
    const card = this.container.querySelector('#stage-' + s);
    if (card) card.classList.toggle('excluded', !!this.stages[s].excluded);
  },

  stageCost(s) {
    let c = 0;
    for (const it of this.stages[s].items) c += it.qty * it.cost;
    return c;
  },
  stagePrice(s) {
    const st = this.stages[s];
    let p = 0;
    for (const it of st.items) p += it.qty * it.cost * (1 + st.profit_pct / 100);
    return p;
  },

  updateTotals() {
    const cur = this.meta.currency || '$';
    let totalCost = 0, totalPrice = 0;
    for (let si = 0; si < this.stages.length; si++) {
      const cost = this.stageCost(si);
      const price = this.stagePrice(si);
      const profit = price - cost;
      const pct = cost > 0 ? (profit / cost) * 100 : 0;
      const set = (id, v) => {
        const el = this.container.querySelector('#' + id);
        if (el) el.textContent = v;
      };
      set('stage-cost-' + si, Money.fmt(cost, cur));
      set('stage-price-' + si, Money.fmt(price, cur));
      set('stage-profit-' + si, Money.fmt(profit, cur));
      set('stage-profitpct-' + si, Money.pct(pct));
      if (!this.stages[si].excluded) {
        totalCost += cost;
        totalPrice += price;
      }
      for (let ii = 0; ii < this.stages[si].items.length; ii++) {
        const it = this.stages[si].items[ii];
        const unitPrice = it.cost * (1 + this.stages[si].profit_pct / 100);
        const priceEl = this.container.querySelector('#price-' + si + '-' + ii);
        if (priceEl) priceEl.textContent = Money.fmt(it.qty * unitPrice, cur);
      }
    }
    const gProfit = totalPrice - totalCost;
    const gPct = totalCost > 0 ? (gProfit / totalCost) * 100 : 0;
    this.container.querySelector('#g-cost').textContent = Money.fmt(totalCost, cur);
    this.container.querySelector('#g-price').textContent = Money.fmt(totalPrice, cur);
    this.container.querySelector('#g-profit').textContent = Money.fmt(gProfit, cur);
    this.container.querySelector('#g-profitpct').textContent = Money.pct(gPct);
  },

  markDirty() {
    this.dirty = true;
    const st = this.container.querySelector('#save-state');
    if (st) { st.textContent = 'Sin guardar'; st.className = 'save-state dirty'; }
  },

  setSaveState(text, cls) {
    const st = this.container.querySelector('#save-state');
    if (st) { st.textContent = text; st.className = 'save-state ' + (cls || 'saved'); }
  },

  async save() {
    if (!this.dirty) { App.toast('Sin cambios'); return; }
    this.setSaveState('Guardando...', 'saving');
    const btn = this.container.querySelector('[data-act=save]');
    if (btn) btn.disabled = true;
    try {
      const payload = { ...this.metaPayload(), stages: this.stages };
      const res = await API.put('/api/projects/' + this.id, payload);
      this.meta = res.project;
      this.stages = res.stages;
      this.dirty = false;
      this.setSaveState('Guardado ✓');
      App.toast('Estimado guardado');
    } catch (err) {
      this.setSaveState('Error al guardar', 'dirty');
      alert(err.message);
    }
    if (btn) btn.disabled = false;
  },

  addItem(s) {
    this.stages[s].items.push({ description: '', qty: 0, unit: '', cost: 0 });
    this.markDirty();
    this.render();
  },
  delItem(s, i) {
    this.stages[s].items.splice(i, 1);
    this.markDirty();
    this.render();
  },
  moveItem(s, i, dir) {
    const items = this.stages[s].items;
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
    this.markDirty();
    this.render();
  },
  dupItem(s, i) {
    const src = this.stages[s].items[i];
    this.stages[s].items.splice(i + 1, 0, { ...src });
    this.markDirty();
    this.render();
  },
  addStage() {
    const def = Number(this.meta.default_profit_pct) || 25;
    this.stages.push({ name: 'Etapa ' + (this.stages.length + 1), profit_pct: def, excluded: false, note: '', items: [{ description: '', qty: 0, unit: '', cost: 0 }] });
    this.markDirty();
    this.render();
  },
  delStage(s) {
    this.stages.splice(s, 1);
    this.markDirty();
    this.render();
  },
  moveStage(s, dir) {
    const j = s + dir;
    if (j < 0 || j >= this.stages.length) return;
    const tmp = this.stages[s];
    this.stages[s] = this.stages[j];
    this.stages[j] = tmp;
    this.markDirty();
    this.render();
  },
  dupStage(s) {
    const src = this.stages[s];
    this.stages.splice(s + 1, 0, {
      name: src.name + ' (copia)',
      profit_pct: src.profit_pct,
      excluded: src.excluded,
      note: src.note,
      items: src.items.map((it) => ({ ...it })),
    });
    this.markDirty();
    this.render();
  },

  dataForPdf() {
    return { project: this.metaPayload(), stages: this.stages };
  },

  downloadPdf() {
    try {
      const doc = PdfExport.build(this.dataForPdf(), this.settings);
      Share.downloadDoc(doc, PdfExport.filename(this.dataForPdf()));
    } catch (err) {
      alert('No se pudo generar el PDF: ' + err.message);
    }
  },

  async sharePdf() {
    try {
      const doc = PdfExport.build(this.dataForPdf(), this.settings);
      const fname = PdfExport.filename(this.dataForPdf());
      const shared = await Share.shareDoc(doc, fname, Share.summaryText(this.dataForPdf()));
      if (!shared) Share.downloadDoc(doc, fname);
    } catch (err) {
      alert('No se pudo generar el PDF: ' + err.message);
    }
  },

  whatsapp() {
    Share.openWhatsApp(Share.summaryText(this.dataForPdf()));
  },

  exportJson() {
    const blob = new Blob([JSON.stringify(this.dataForPdf(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'estimado-' + this.id + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  leave() {
    if (this.dirty && !confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
    App.goto('dashboard');
  }
};

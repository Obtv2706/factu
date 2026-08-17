window.DashboardView = {
  mount(container) {
    this.container = container;
    this.render();
  },

  async render() {
    const c = this.container;
    const user = App.user;
    c.innerHTML = '<div class="spinner"></div>';

    let projects = [];
    let settings = null;
    try {
      const [p, s] = await Promise.all([
        API.get('/api/projects'),
        user.role === 'admin' ? API.get('/api/settings').catch(() => null) : Promise.resolve(null),
      ]);
      projects = p.projects || [];
      settings = s ? s.settings : null;
    } catch (err) {
      c.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
      return;
    }

    c.innerHTML = `
      <div class="container">
        <h1 class="page-title">Mis Estimados</h1>
        <p class="page-sub">Crea, edita y comparte estimados de construcción.</p>

        <div class="banner">
          <span>⚠️ En Render (plan gratuito) los datos se borran al reiniciar el servicio. Guarda respaldos con frecuencia.</span>
          <span class="actions">
            ${user.role === 'admin' ? '<button class="btn btn-secondary btn-sm" data-act="backup">Descargar respaldo</button>' : ''}
            ${user.role === 'admin' ? '<button class="btn btn-secondary btn-sm" data-act="restore">Restaurar respaldo</button>' : ''}
          </span>
        </div>

        <div class="toolbar">
          <button class="btn btn-primary" data-act="new">+ Nuevo estimado</button>
          <button class="btn btn-secondary" data-act="import">Importar archivo (CSV/JSON)</button>
          <button class="btn btn-secondary" data-act="example">Cargar ejemplo</button>
          <input id="file-input" type="file" accept=".csv,.json" class="hidden">
        </div>

        <div id="projects-area"></div>
      </div>`;

    c.querySelector('[data-act=new]').addEventListener('click', () => this.newProject());
    c.querySelector('[data-act=import]').addEventListener('click', () => c.querySelector('#file-input').click());
    c.querySelector('[data-act=example]').addEventListener('click', () => this.loadExample());
    c.querySelector('[data-act=backup]').addEventListener('click', () => this.downloadBackup());
    c.querySelector('[data-act=restore]').addEventListener('click', () => this.restoreBackup());
    c.querySelector('#file-input').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) this.importFile(f);
      e.target.value = '';
    });

    const area = c.querySelector('#projects-area');
    if (!projects.length) {
      area.innerHTML = `
        <div class="empty">
          <h3>No tienes estimados todavía</h3>
          <p>Empieza con "Nuevo estimado" o importa tu archivo de ejemplo.</p>
        </div>`;
      return;
    }

    area.innerHTML = `
      <div class="projects-grid">
        ${projects.map((p) => this.card(p)).join('')}
      </div>`;

    area.querySelectorAll('[data-act=open]').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); App.goto('project/' + b.dataset.id); })
    );
    area.querySelectorAll('[data-act=export]').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); this.exportProject(Number(b.dataset.id)); })
    );
    area.querySelectorAll('[data-act=del]').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); this.deleteProject(Number(b.dataset.id)); })
    );
    area.querySelectorAll('.project-card').forEach((card) =>
      card.addEventListener('click', () => App.goto('project/' + card.dataset.id))
    );
  },

  card(p) {
    const stages = p.stages_count;
    return `
      <div class="project-card" data-id="${p.id}">
        <h3>${App.esc(p.project_name || 'Sin nombre')}</h3>
        <div class="client">${App.esc(p.client_name || '')}</div>
        <div class="total">${Money.fmt(p.total_price, p.currency)}</div>
        <div class="meta">${p.date ? App.esc(p.date) : ''}${stages ? ' · ' + stages + ' etapas' : ''}</div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" data-act="open" data-id="${p.id}">Abrir</button>
          <button class="btn btn-secondary btn-sm" data-act="export" data-id="${p.id}" title="Exportar JSON">JSON</button>
          <button class="btn btn-danger btn-sm" data-act="del" data-id="${p.id}">Eliminar</button>
        </div>
      </div>`;
  },

  async newProject() {
    const settings = App.settingsCache || {};
    const defaultPct = settings.default_profit_pct != null ? settings.default_profit_pct : 25;
    try {
      const res = await API.post('/api/projects', {
        client_name: '', project_name: 'Nuevo estimado', currency: '$',
        default_profit_pct: defaultPct,
        stages: [{ name: 'Etapa 1', profit_pct: defaultPct, excluded: false, note: '', items: [{ description: '', qty: 0, unit: '', cost: 0 }] }],
      });
      App.goto('project/' + res.project.id);
    } catch (err) {
      alert(err.message);
    }
  },

  async importFile(file) {
    try {
      const saved = await CsvImport.upload(file);
      App.toast('Estimado importado');
      App.goto('project/' + saved.project.id);
    } catch (err) {
      alert('No se pudo importar: ' + err.message);
    }
  },

  async loadExample() {
    try {
      const res = await fetch('/sample/Construccion Estimado2.csv');
      const text = await res.text();
      const payload = CsvImport.parseCsv(text);
      payload.client_name = 'Res. Eduardo Nuñez';
      const saved = await API.post('/api/projects/import', payload);
      App.toast('Ejemplo importado');
      App.goto('project/' + saved.project.id);
    } catch (err) {
      alert('No se pudo cargar el ejemplo: ' + err.message);
    }
  },

  async deleteProject(id) {
    const name = prompt('Para eliminar escribe "ELIMINAR":');
    if (name !== 'ELIMINAR') return;
    try {
      await API.del('/api/projects/' + id);
      App.toast('Estimado eliminado');
      this.render();
    } catch (err) {
      alert(err.message);
    }
  },

  async exportProject(id) {
    try {
      const data = await API.get('/api/projects/' + id + '/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'estimado-' + id + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(err.message);
    }
  },

  async downloadBackup() {
    try {
      const data = await API.get('/api/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'factu-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      App.toast('Respaldo descargado');
    } catch (err) {
      alert(err.message);
    }
  },

  async restoreBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      if (!confirm('Esto REEMPLAZARÁ todos los datos actuales con el contenido del respaldo. ¿Continuar?')) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        await API.post('/api/backup/restore', data);
        App.toast('Respaldo restaurado');
        this.render();
      } catch (err) {
        alert('No se pudo restaurar: ' + err.message);
      }
    };
    input.click();
  }
};

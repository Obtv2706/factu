window.AdminView = {
  mount(container) {
    this.container = container;
    this.render();
  },

  async render() {
    const c = this.container;
    c.innerHTML = '<div class="spinner"></div>';
    let users = [];
    let settings = {};
    try {
      const [u, s] = await Promise.all([API.get('/api/users'), API.get('/api/settings')]);
      users = u.users || [];
      settings = s.settings || {};
    } catch (err) {
      c.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
      return;
    }

    c.innerHTML = `
      <div class="container">
        <h1 class="page-title">Administración</h1>
        <p class="page-sub">Usuarios y datos de la empresa para el PDF.</p>
        <div id="admin-error"></div>

        <div class="panel">
          <h2>Nuevo usuario</h2>
          <form id="user-form" class="form-grid">
            <div class="field"><label>Nombre</label><input id="u-name" required></div>
            <div class="field"><label>Email</label><input id="u-email" type="email" required></div>
            <div class="field"><label>Contraseña (mín. 6)</label><input id="u-pass" type="text" required></div>
            <div class="field"><label>Rol</label>
              <select id="u-role">
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div class="field" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Crear usuario</button></div>
          </form>
        </div>

        <div class="panel">
          <h2>Usuarios</h2>
          <table class="table" id="users-table"></table>
        </div>

        <div class="panel">
          <h2>Datos de la empresa (aparecen en el PDF)</h2>
          <form id="settings-form" class="form-grid">
            <div class="field"><label>Nombre / Empresa</label><input id="s-name" value="${App.escAttr(settings.company_name || '')}"></div>
            <div class="field"><label>Teléfono</label><input id="s-phone" value="${App.escAttr(settings.company_phone || '')}"></div>
            <div class="field"><label>Email</label><input id="s-email" type="email" value="${App.escAttr(settings.company_email || '')}"></div>
            <div class="field"><label>Dirección</label><input id="s-address" value="${App.escAttr(settings.company_address || '')}"></div>
            <div class="field"><label>URL del logo (opcional)</label><input id="s-logo" value="${App.escAttr(settings.logo_url || '')}"></div>
            <div class="field"><label>% de ganancia por defecto</label><input id="s-pct" type="number" step="0.1" value="${settings.default_profit_pct != null ? settings.default_profit_pct : 25}"></div>
            <div class="field" style="grid-column:1/-1"><label>Nota al pie del PDF</label><textarea id="s-footer">${App.esc(settings.footer_note || '')}</textarea></div>
            <div class="field" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">Guardar datos</button></div>
          </form>
        </div>
      </div>`;

    const errBox = c.querySelector('#admin-error');

    c.querySelector('#user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      try {
        await API.post('/api/users', {
          name: c.querySelector('#u-name').value.trim(),
          email: c.querySelector('#u-email').value.trim(),
          password: c.querySelector('#u-pass').value,
          role: c.querySelector('#u-role').value,
        });
        App.toast('Usuario creado');
        this.render();
      } catch (err) {
        errBox.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
      }
    });

    c.querySelector('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      try {
        await API.put('/api/settings', {
          company_name: c.querySelector('#s-name').value,
          company_phone: c.querySelector('#s-phone').value,
          company_email: c.querySelector('#s-email').value,
          company_address: c.querySelector('#s-address').value,
          logo_url: c.querySelector('#s-logo').value,
          default_profit_pct: Number(c.querySelector('#s-pct').value) || 25,
          footer_note: c.querySelector('#s-footer').value,
        });
        App.toast('Datos guardados');
      } catch (err) {
        errBox.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
      }
    });

    const tbody = c.querySelector('#users-table');
    const rows = users
      .map(
        (u) => `
        <tr>
          <td>${App.esc(u.name)}</td>
          <td>${App.esc(u.email)}</td>
          <td>${u.role === 'admin' ? 'Admin' : 'Editor'}</td>
          <td>${u.active ? '<span style="color:var(--success);font-weight:700">Activo</span>' : '<span style="color:var(--danger);font-weight:700">Inactivo</span>'}</td>
          <td class="num">
            <button class="btn btn-secondary btn-sm" data-act="reset" data-id="${u.id}">Cambiar contraseña</button>
            <button class="btn btn-secondary btn-sm" data-act="toggle" data-id="${u.id}">${u.active ? 'Desactivar' : 'Activar'}</button>
          </td>
        </tr>`
      )
      .join('');
    tbody.innerHTML =
      '<thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody>';

    tbody.querySelectorAll('[data-act=reset]').forEach((b) =>
      b.addEventListener('click', async () => {
        const pwd = prompt('Nueva contraseña para ' + b.dataset.id + ':');
        if (!pwd) return;
        try {
          await API.post('/api/users/' + b.dataset.id + '/reset-password', { password: pwd });
          App.toast('Contraseña actualizada');
        } catch (err) {
          alert(err.message);
        }
      })
    );
    tbody.querySelectorAll('[data-act=toggle]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await API.post('/api/users/' + b.dataset.id + '/toggle', {});
          this.render();
        } catch (err) {
          alert(err.message);
        }
      })
    );
  }
};

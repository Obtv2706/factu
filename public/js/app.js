window.App = {
  user: null,
  settingsCache: null,

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  escAttr(s) {
    return this.esc(s);
  },

  setUser(u) {
    this.user = u;
  },

  initTheme() {
    const saved = localStorage.getItem('factu-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
  },

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('factu-theme', isDark ? 'dark' : 'light');
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = isDark ? '☀' : '☾';
  },

  goto(route) {
    location.hash = '#/' + route;
  },

  route() {
    const hash = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    const view = parts[0] || 'dashboard';
    const app = document.getElementById('app');

    if (EditorView.dirty && view !== 'project') {
      if (!confirm('Tienes cambios sin guardar en el estimado. ¿Salir de todos modos?')) {
        location.hash = '#/project/' + EditorView.id;
        return;
      }
      EditorView.dirty = false;
    }

    if (!this.user) {
      if (view === 'login') {
        app.innerHTML = '';
        AuthView.mount(app);
        return;
      }
      this.goto('login');
      return;
    }

    if (view === 'login') { this.goto('dashboard'); return; }

    if (view === 'admin' && this.user.role !== 'admin') {
      this.toast('No autorizado');
      this.goto('dashboard');
      return;
    }

    const viewEl = this.renderHeader(view === 'admin' ? 'admin' : 'dashboard');
    viewEl.innerHTML = '';

    if (view === 'project' && parts[1]) {
      EditorView.mount(viewEl, parts[1]);
      return;
    }
    if (view === 'admin') {
      AdminView.mount(viewEl);
      return;
    }
    DashboardView.mount(viewEl);
  },

  renderHeader(active) {
    const app = document.getElementById('app');
    const nav = `
      <div class="navlink ${active === 'dashboard' ? 'active' : ''}" data-nav="dashboard">Mis estimados</div>
      ${this.user.role === 'admin' ? `<div class="navlink ${active === 'admin' ? 'active' : ''}" data-nav="admin">Administración</div>` : ''}`;
    const html = `
      <header class="topbar">
        <span class="brand" data-nav="dashboard">Factu</span>
        <nav class="topnav">${nav}</nav>
        <div class="userbox">
          <button class="theme-toggle" data-act="theme" title="Cambiar tema">${document.documentElement.classList.contains('dark') ? '☀' : '☾'}</button>
          <span class="uname">${this.esc(this.user.name)}</span>
          <button class="btn btn-secondary btn-sm" data-act="logout">Salir</button>
        </div>
      </header>
      <div id="view"></div>`;
    app.innerHTML = html;
    const view = app.querySelector('#view');
    app.querySelectorAll('[data-nav]').forEach((el) =>
      el.addEventListener('click', () => this.goto(el.dataset.nav))
    );
    app.querySelector('[data-act=logout]').addEventListener('click', async () => {
      try { await API.post('/api/auth/logout', {}); } catch (e) {}
      this.user = null;
      this.goto('login');
    });
    const themeBtn = app.querySelector('[data-act=theme]');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());
    return view;
  },

  toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  },

  async boot() {
    this.initTheme();
    window.addEventListener('hashchange', () => this.route());    try {
      const me = await API.get('/api/auth/me');
      this.user = me.user;
    } catch (e) {
      this.user = null;
    }
    this.route();
  }
};

document.addEventListener('DOMContentLoaded', () => App.boot());

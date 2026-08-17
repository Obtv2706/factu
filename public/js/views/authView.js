window.AuthView = {
  mount(container) {
    container.innerHTML = `
      <div class="auth-card">
        <span class="brand">Factu</span>
        <div class="sub">Estimados de construcción</div>
        <div id="auth-error"></div>
        <form id="login-form" class="login-form">
          <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" type="email" autocomplete="username" required placeholder="tu@email.com">
          </div>
          <div class="field">
            <label for="login-pass">Contraseña</label>
            <input id="login-pass" type="password" autocomplete="current-password" required placeholder="••••••••">
          </div>
          <button class="btn btn-primary btn-block" type="submit">Entrar</button>
        </form>
      </div>`;

    const errBox = container.querySelector('#auth-error');
    container.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = container.querySelector('#login-email').value.trim();
      const password = container.querySelector('#login-pass').value;
      const btn = container.querySelector('button[type=submit]');
      btn.disabled = true;
      errBox.innerHTML = '';
      try {
        const res = await API.post('/api/auth/login', { email, password });
        App.setUser(res.user);
        App.goto('dashboard');
      } catch (err) {
        errBox.innerHTML = '<div class="error-box">' + App.esc(err.message) + '</div>';
        btn.disabled = false;
      }
    });
  }
};

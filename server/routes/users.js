'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const router = express.Router();

router.use(auth.requireAuth, auth.requireAdmin);

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY id')
    .all()
    .map((u) => ({ ...u, active: !!u.active }));
  res.json({ users });
});

router.post('/', (req, res) => {
  const { name, email, password, role } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!name || !cleanEmail || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (auth.findByEmail(cleanEmail)) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }
  const roleValue = role === 'admin' ? 'admin' : 'editor';
  const info = db
    .prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(cleanEmail, String(name).trim(), auth.hashPassword(password), roleValue);
  const user = db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: { ...user, active: !!user.active } });
});

router.post('/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), id);
  res.json({ ok: true });
});

router.post('/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });

  if (user.active) {
    const activeAdmins = db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1")
      .get().c;
    if (user.role === 'admin' && activeAdmins <= 1) {
      return res.status(400).json({ error: 'Debe existir al menos un administrador activo' });
    }
  }

  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, id);
  res.json({ ok: true });
});

module.exports = router;

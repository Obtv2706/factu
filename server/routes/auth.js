'use strict';

const express = require('express');
const auth = require('../auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = auth.login(email, password);
  if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

  req.session.user = { id: user.id, role: user.role };
  res.json({ user });
});

router.post('/logout', (req, res) => {
  delete req.session.user;
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

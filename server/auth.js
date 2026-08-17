'use strict';

const bcrypt = require('bcryptjs');
const db = require('./db');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: !!user.active,
  };
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function login(email, password) {
  const user = findByEmail(email);
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return serializeUser(user);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const user = findById(req.session.user.id);
  if (!user || !user.active) {
    delete req.session.user;
    return res.status(401).json({ error: 'Sesion invalida' });
  }
  req.user = serializeUser(user);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Requiere permisos de administrador' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, serializeUser, findByEmail, findById, login, requireAuth, requireAdmin };

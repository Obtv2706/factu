'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { getFullProject } = require('./projects');
const router = express.Router();

router.use(auth.requireAuth, auth.requireAdmin);

function buildBackup() {
  const users = db.prepare('SELECT id, email, name, password_hash, role, active, created_at FROM users').all();
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const projects = db.prepare('SELECT id FROM projects ORDER BY id').all().map((p) => getFullProject(p.id));
  return { app: 'factu-estimados', version: 1, exported_at: new Date().toISOString(), settings, users, projects };
}

router.get('/', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="factu-respaldo.json"');
  res.json(buildBackup());
});

router.post('/restore', (req, res) => {
  const b = req.body || {};
  if (b.app !== 'factu-estimados' || !Array.isArray(b.users) || !Array.isArray(b.projects)) {
    return res.status(400).json({ error: 'Archivo de respaldo inválido' });
  }

  const insertUser = db.prepare(
    'INSERT INTO users (id, email, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, user_id, client_name, project_name, phone, email, address, date, currency, notes, default_profit_pct, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertStage = db.prepare(
    'INSERT INTO stages (id, project_id, name, profit_pct, excluded, note, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO items (id, stage_id, description, qty, unit, cost, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    db.exec('DELETE FROM items; DELETE FROM stages; DELETE FROM projects; DELETE FROM users;');
    if (b.settings && b.settings.id === 1) {
      db.prepare(
        `UPDATE settings SET company_name=?, company_phone=?, company_email=?, company_address=?, logo_url=?, default_profit_pct=?, footer_note=? WHERE id = 1`
      ).run(
        b.settings.company_name || '', b.settings.company_phone || '', b.settings.company_email || '',
        b.settings.company_address || '', b.settings.logo_url || '',
        Number(b.settings.default_profit_pct) || 25, b.settings.footer_note || ''
      );
    }
    for (const u of b.users) {
      insertUser.run(u.id, u.email, u.name, u.password_hash, u.role || 'editor', u.active ? 1 : 0, u.created_at);
    }
    for (const p of b.projects) {
      const proj = p.project || p;
      insertProject.run(
        proj.id, proj.user_id, proj.client_name, proj.project_name, proj.phone, proj.email,
        proj.address, proj.date, proj.currency, proj.notes, proj.default_profit_pct, proj.created_at, proj.updated_at
      );
      for (const s of p.stages || []) {
        const stageId = insertStage.run(
          s.id, proj.id, s.name, s.profit_pct, s.excluded ? 1 : 0, s.note || '', s.position
        ).lastInsertRowid;
        for (const it of s.items || []) {
          insertItem.run(
            it.id, stageId, it.description || '', Number(it.qty) || 0, it.unit || '',
            Number(it.cost) || 0, it.position
          );
        }
      }
    }
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;

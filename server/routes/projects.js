'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const router = express.Router();

router.use(auth.requireAuth);

function projectTotals(projectId) {
  return db
    .prepare(
      `SELECT
         COALESCE(SUM(i.qty * i.cost), 0) AS total_cost,
         COALESCE(SUM(i.qty * i.cost * (1 + s.profit_pct / 100.0)), 0) AS total_price
       FROM items i JOIN stages s ON i.stage_id = s.id
       WHERE s.project_id = ? AND s.excluded = 0`
    )
    .get(projectId);
}

function stageTotals(stageId) {
  return db
    .prepare(
      `SELECT
         COALESCE(SUM(qty * cost), 0) AS cost,
         COALESCE(SUM(qty * cost), 0) AS raw_cost
       FROM items WHERE stage_id = ?`
    )
    .get(stageId);
}

function getFullProject(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const stages = db.prepare('SELECT * FROM stages WHERE project_id = ? ORDER BY position, id').all(projectId);
  for (const s of stages) {
    s.items = db.prepare('SELECT * FROM items WHERE stage_id = ? ORDER BY position, id').all(s.id);
    s.excluded = !!s.excluded;
    s.cost = 0;
    s.price = 0;
    for (const it of s.items) {
      const lineCost = it.qty * it.cost;
      s.cost += lineCost;
      s.price += lineCost * (1 + s.profit_pct / 100);
    }
  }
  const t = projectTotals(projectId);
  return {
    project: {
      ...project,
      total_cost: t.total_cost,
      total_price: t.total_price,
      profit: t.total_price - t.total_cost,
      profit_pct: t.total_cost > 0 ? ((t.total_price - t.total_cost) / t.total_cost) * 100 : 0,
    },
    stages,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
         (SELECT COALESCE(SUM(i.qty * i.cost), 0) FROM items i JOIN stages s ON i.stage_id = s.id
            WHERE s.project_id = p.id AND s.excluded = 0) AS total_cost,
         (SELECT COALESCE(SUM(i.qty * i.cost * (1 + s.profit_pct / 100.0)), 0) FROM items i JOIN stages s ON i.stage_id = s.id
            WHERE s.project_id = p.id AND s.excluded = 0) AS total_price,
         (SELECT COUNT(*) FROM stages WHERE project_id = p.id) AS stages_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all(req.user.id)
    .map((p) => ({
      ...p,
      total_price: Math.round(p.total_price * 100) / 100,
      total_cost: Math.round(p.total_cost * 100) / 100,
      profit: Math.round((p.total_price - p.total_cost) * 100) / 100,
      profit_pct:
        p.total_cost > 0 ? Math.round(((p.total_price - p.total_cost) / p.total_cost) * 10000) / 100 : 0,
    }));
  res.json({ projects: rows });
});

function sanitizeProject(body) {
  const b = body || {};
  return {
    client_name: String(b.client_name || '').trim(),
    project_name: String(b.project_name || '').trim(),
    phone: String(b.phone || '').trim(),
    email: String(b.email || '').trim(),
    address: String(b.address || '').trim(),
    date: String(b.date || '').trim(),
    currency: String(b.currency || '$').trim() || '$',
    notes: String(b.notes || ''),
    default_profit_pct: clampPct(b.default_profit_pct),
  };
}

function clampPct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 25;
  return Math.max(-90, Math.min(1000, n));
}

function sanitizeStages(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.map((s, si) => ({
    name: String(s.name || 'Etapa').trim(),
    profit_pct: clampPct(s.profit_pct),
    excluded: s.excluded ? 1 : 0,
    note: String(s.note || ''),
    position: si,
    items: Array.isArray(s.items)
      ? s.items.map((it, ii) => ({
          description: String(it.description || '').trim(),
          qty: Number(it.qty) || 0,
          unit: String(it.unit || '').trim(),
          cost: Number(it.cost) || 0,
          position: ii,
        }))
      : [],
  }));
}

function insertProject(userId, meta, stages) {
  const insertProject = db.prepare(
    `INSERT INTO projects (user_id, client_name, project_name, phone, email, address, date, currency, notes, default_profit_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertStage = db.prepare(
    `INSERT INTO stages (project_id, name, profit_pct, excluded, note, position) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO items (stage_id, description, qty, unit, cost, position) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const touch = db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?');

  const tx = db.transaction(() => {
    const info = insertProject.run(
      userId,
      meta.client_name,
      meta.project_name,
      meta.phone,
      meta.email,
      meta.address,
      meta.date,
      meta.currency,
      meta.notes,
      meta.default_profit_pct
    );
    const projectId = info.lastInsertRowid;
    for (const s of stages) {
      const sinfo = insertStage.run(projectId, s.name, s.profit_pct, s.excluded, s.note, s.position);
      const stageId = sinfo.lastInsertRowid;
      for (const it of s.items) {
        insertItem.run(stageId, it.description, it.qty, it.unit, it.cost, it.position);
      }
    }
    return projectId;
  });
  const projectId = tx();
  touch.run(projectId);
  return projectId;
}

function replaceProject(projectId, meta, stages) {
  const update = db.prepare(
    `UPDATE projects SET client_name=?, project_name=?, phone=?, email=?, address=?, date=?, currency=?, notes=?, default_profit_pct=?, updated_at = datetime('now')
     WHERE id = ?`
  );
  const insertStage = db.prepare(
    `INSERT INTO stages (project_id, name, profit_pct, excluded, note, position) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO items (stage_id, description, qty, unit, cost, position) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    update.run(
      meta.client_name, meta.project_name, meta.phone, meta.email, meta.address, meta.date,
      meta.currency, meta.notes, meta.default_profit_pct, projectId
    );
    db.prepare('DELETE FROM stages WHERE project_id = ?').run(projectId);
    for (const s of stages) {
      const sinfo = insertStage.run(projectId, s.name, s.profit_pct, s.excluded, s.note, s.position);
      const stageId = sinfo.lastInsertRowid;
      for (const it of s.items) {
        insertItem.run(stageId, it.description, it.qty, it.unit, it.cost, it.position);
      }
    }
  });
  tx();
}

function ownerProject(res, userId, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Proyecto no encontrado' });
    return null;
  }
  if (project.user_id !== userId) {
    res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    return null;
  }
  return project;
}

router.post('/', (req, res) => {
  const meta = sanitizeProject(req.body);
  const stages = sanitizeStages(req.body && req.body.stages);
  const projectId = insertProject(req.user.id, meta, stages);
  res.status(201).json(getFullProject(projectId));
});

router.post('/import', (req, res) => {
  const meta = sanitizeProject(req.body);
  const stages = sanitizeStages(req.body && req.body.stages);
  if (!stages.length) return res.status(400).json({ error: 'El estimado no contiene etapas' });
  const projectId = insertProject(req.user.id, meta, stages);
  res.status(201).json(getFullProject(projectId));
});

router.get('/:id', (req, res) => {
  const project = ownerProject(res, req.user.id, Number(req.params.id));
  if (!project) return;
  res.json(getFullProject(project.id));
});

router.put('/:id', (req, res) => {
  const project = ownerProject(res, req.user.id, Number(req.params.id));
  if (!project) return;
  const meta = sanitizeProject(req.body);
  const stages = sanitizeStages(req.body && req.body.stages);
  replaceProject(project.id, meta, stages);
  res.json(getFullProject(project.id));
});

router.delete('/:id', (req, res) => {
  const project = ownerProject(res, req.user.id, Number(req.params.id));
  if (!project) return;
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  res.json({ ok: true });
});

router.get('/:id/export', (req, res) => {
  const project = ownerProject(res, req.user.id, Number(req.params.id));
  if (!project) return;
  const data = getFullProject(project.id);
  res.setHeader('Content-Disposition', `attachment; filename="estimado-${project.id}.json"`);
  res.json(data);
});

module.exports = router;
module.exports.stageTotals = stageTotals;
module.exports.getFullProject = getFullProject;
module.exports.projectTotals = projectTotals;

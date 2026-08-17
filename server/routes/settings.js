'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const router = express.Router();

router.use(auth.requireAuth);

router.get('/', (req, res) => {
  const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json({ settings: s });
});

router.put('/', auth.requireAdmin, (req, res) => {
  const b = req.body || {};
  const clampPct = (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return 25;
    return Math.max(-90, Math.min(1000, n));
  };
  db.prepare(
    `UPDATE settings SET company_name=?, company_phone=?, company_email=?, company_address=?, logo_url=?, default_profit_pct=?, footer_note=? WHERE id = 1`
  ).run(
    String(b.company_name || '').trim(),
    String(b.company_phone || '').trim(),
    String(b.company_email || '').trim(),
    String(b.company_address || '').trim(),
    String(b.logo_url || '').trim(),
    clampPct(b.default_profit_pct),
    String(b.footer_note || '')
  );
  const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json({ settings: s });
});

module.exports = router;

'use strict';

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

function createServer(opts = {}) {
  const host = opts.host || process.env.HOST || '0.0.0.0';
  const port = opts.port !== undefined ? opts.port : Number(process.env.PORT) || 3100;

  if (opts.dataDir) process.env.DATA_DIR = opts.dataDir;

  require('./db');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));

  app.use(
    cookieSession({
      name: 'factu_session',
      keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    })
  );

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/backup', require('./routes/backup'));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const actualPort = server.address().port;
      resolve({
        app,
        server,
        port: actualPort,
        close: () => new Promise((res) => server.close(res)),
      });
    });
    server.on('error', reject);
  });
}

module.exports = { createServer };

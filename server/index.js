'use strict';

const { createServer } = require('./app');

createServer({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT) || 3100 })
  .then(({ port }) => {
    console.log(`[server] Factu Estimados en http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('[server] Error al iniciar:', err);
    process.exit(1);
  });

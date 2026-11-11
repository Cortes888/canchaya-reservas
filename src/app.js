const path = require('path');
const express = require('express');
const { manejarErrores } = require('./utils/errores');
const R = require('./reglas/reservas');
const { getDb } = require('./db');

function crearApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // para revisar que el despliegue está conectado
  app.get('/api/salud', async (req, res) => {
    try {
      await getDb().command({ ping: 1 });
      res.json({ estado: 'ok', baseDatos: 'conectada' });
    } catch {
      res.status(503).json({ estado: 'error', baseDatos: 'desconectada' });
    }
  });

  app.get('/api/config', (req, res) => {
    res.json({ superficies: R.SUPERFICIES, metodosPago: R.METODOS_PAGO, estados: R.ESTADOS, reglas: R.REGLAS });
  });

  app.use('/api/sedes', require('./routes/sedes'));
  app.use('/api/canchas', require('./routes/canchas'));
  app.use('/api/clientes', require('./routes/clientes'));
  app.use('/api/reservas', require('./routes/reservas'));
  app.use('/api/agenda', require('./routes/agenda'));
  app.use('/api/reportes', require('./routes/reportes'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  // archivos de la interfaz
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };

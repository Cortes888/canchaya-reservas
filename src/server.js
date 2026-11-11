require('dotenv').config();
const { conectar, cerrar } = require('./db');
const { crearApp } = require('./app');

const PUERTO = process.env.PORT || 3000;

async function iniciar() {
  try {
    await conectar();
  } catch (err) {
    console.error('No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }
  const servidor = crearApp().listen(PUERTO, () => {
    console.log(`Servidor escuchando en http://localhost:${PUERTO}`);
  });

  const apagar = async () => {
    servidor.close();
    await cerrar();
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

iniciar();

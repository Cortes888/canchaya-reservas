// Carga los datos de prueba en Atlas (borra los que haya)
require('dotenv').config();
const { ObjectId } = require('mongodb');
const { conectar, cerrar } = require('../src/db');
const { generarDatos } = require('./datos-semilla');

async function main() {
  const db = await conectar();
  const datos = generarDatos(new Date(), () => new ObjectId());

  for (const nombre of ['reservas', 'canchas', 'clientes', 'sedes', 'contadores']) {
    await db.collection(nombre).deleteMany({});
  }
  await db.collection('sedes').insertMany(datos.sedes);
  await db.collection('canchas').insertMany(datos.canchas);
  await db.collection('clientes').insertMany(datos.clientes);
  await db.collection('reservas').insertMany(datos.reservas);
  await db.collection('contadores').insertOne({ _id: 'reservas', valor: datos.contador });

  console.log(
    `Datos cargados: ${datos.sedes.length} sedes, ${datos.canchas.length} canchas, ` +
      `${datos.clientes.length} clientes, ${datos.reservas.length} reservas.`
  );
}

main()
  .catch((err) => {
    console.error('Error cargando datos:', err.message);
    process.exitCode = 1;
  })
  .finally(cerrar);

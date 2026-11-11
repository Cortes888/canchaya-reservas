// Conexión a MongoDB Atlas (la URI viene del .env)
const { MongoClient } = require('mongodb');

let cliente = null;
let db = null;

// Validadores $jsonSchema de cada colección
const VALIDADORES = {
  sedes: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'ciudad', 'direccion', 'horario', 'activa'],
      properties: {
        nombre: { bsonType: 'string' },
        ciudad: { bsonType: 'string' },
        direccion: { bsonType: 'string' },
        horario: {
          bsonType: 'object',
          required: ['apertura', 'cierre'],
          properties: {
            apertura: { bsonType: 'number', minimum: 0, maximum: 23 },
            cierre: { bsonType: 'number', minimum: 1, maximum: 24 },
          },
        },
        activa: { bsonType: 'bool' },
      },
    },
  },
  canchas: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sedeId', 'nombre', 'tarifas', 'activa'],
      properties: {
        sedeId: { bsonType: 'objectId' },
        nombre: { bsonType: 'string' },
        superficie: { bsonType: 'string' },
        techada: { bsonType: 'bool' },
        tarifas: {
          bsonType: 'object',
          required: ['valle', 'pico'],
          properties: {
            valle: { bsonType: 'number', minimum: 1 },
            pico: { bsonType: 'number', minimum: 1 },
          },
        },
        activa: { bsonType: 'bool' },
      },
    },
  },
  clientes: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'documento', 'email', 'telefono'],
      properties: {
        nombre: { bsonType: 'string' },
        documento: { bsonType: 'string' },
        email: { bsonType: 'string' },
        telefono: { bsonType: 'string' },
        equipo: { bsonType: 'string' },
      },
    },
  },
  reservas: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['codigo', 'canchaId', 'clienteId', 'sedeId', 'fecha', 'horaInicio', 'horaFin', 'franjas', 'detalle', 'estado', 'activa', 'total', 'pagos'],
      properties: {
        codigo: { bsonType: 'string', pattern: '^R-\\d{5,}$' },
        detalle: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['hora', 'tarifa', 'valor'],
            properties: {
              hora: { bsonType: 'number' },
              tarifa: { enum: ['valle', 'pico'] },
              valor: { bsonType: 'number', minimum: 0 },
            },
          },
        },
        canchaId: { bsonType: 'objectId' },
        clienteId: { bsonType: 'objectId' },
        sedeId: { bsonType: 'objectId' },
        fecha: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        horaInicio: { bsonType: 'number', minimum: 0, maximum: 23 },
        horaFin: { bsonType: 'number', minimum: 1, maximum: 24 },
        franjas: { bsonType: 'array', items: { bsonType: 'number' } },
        estado: { enum: ['pendiente', 'confirmada', 'cancelada', 'completada'] },
        activa: { bsonType: 'bool' },
        total: { bsonType: 'number', minimum: 0 },
        pagos: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['monto', 'metodo', 'fecha'],
            properties: {
              monto: { bsonType: 'number', minimum: 0 },
              metodo: { bsonType: 'string' },
              fecha: { bsonType: 'date' },
            },
          },
        },
      },
    },
  },
};

async function aplicarValidadores(baseDatos) {
  const existentes = (await baseDatos.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  for (const [nombre, validator] of Object.entries(VALIDADORES)) {
    try {
      if (existentes.includes(nombre)) {
        await baseDatos.command({ collMod: nombre, validator });
      } else {
        await baseDatos.createCollection(nombre, { validator });
      }
    } catch (err) {
      // si el usuario no tiene permiso de collMod se sigue sin validador
      console.warn(`No se pudo aplicar el validador de "${nombre}": ${err.message}`);
    }
  }
}

async function crearIndices(baseDatos) {
  await baseDatos.collection('sedes').createIndex({ nombre: 1 }, { unique: true });
  await baseDatos.collection('canchas').createIndex({ sedeId: 1, nombre: 1 }, { unique: true });
  await baseDatos.collection('clientes').createIndex({ documento: 1 }, { unique: true });
  await baseDatos.collection('clientes').createIndex({ email: 1 }, { unique: true });

  // no permite dos reservas activas en la misma cancha, fecha y hora
  await baseDatos.collection('reservas').createIndex(
    { canchaId: 1, fecha: 1, franjas: 1 },
    { unique: true, partialFilterExpression: { activa: true }, name: 'franja_unica_por_cancha' }
  );
  await baseDatos.collection('reservas').createIndex(
    { codigo: 1 },
    { unique: true, partialFilterExpression: { codigo: { $exists: true } }, name: 'codigo_unico' }
  );
  await baseDatos.collection('reservas').createIndex({ clienteId: 1, fecha: 1 });
  await baseDatos.collection('reservas').createIndex({ sedeId: 1, fecha: 1 });
  await baseDatos.collection('reservas').createIndex({ estado: 1 });
}

async function conectar() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Falta la variable de entorno MONGODB_URI. Revise el archivo .env.');
  }
  cliente = new MongoClient(uri);
  await cliente.connect();
  db = cliente.db(process.env.DB_NAME || 'reservas_canchas');
  await aplicarValidadores(db);
  await crearIndices(db);
  console.log(`Conectado a MongoDB Atlas, base de datos "${db.databaseName}".`);
  return db;
}

function getDb() {
  if (!db) throw new Error('La base de datos no está conectada.');
  return db;
}

const coleccion = (nombre) => getDb().collection(nombre);

// consecutivo para el código de la reserva (R-00001)
async function siguienteCodigo() {
  const contador = await coleccion('contadores').findOneAndUpdate(
    { _id: 'reservas' },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return contador.valor;
}

async function cerrar() {
  if (cliente) await cliente.close();
  cliente = null;
  db = null;
}

module.exports = { conectar, getDb, coleccion, cerrar, siguienteCodigo };

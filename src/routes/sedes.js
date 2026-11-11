// Rutas de sedes
const express = require('express');
const { coleccion } = require('../db');
const { asyncHandler, errorNoEncontrado, errorConflicto, errorValidacion } = require('../utils/errores');
const v = require('../utils/validaciones');
const { hoyBogota } = require('../utils/tiempo');

const router = express.Router();

function leerSede(body) {
  const apertura = v.numero(body.apertura ?? body.horario?.apertura, 'apertura', { min: 0, max: 23, entero: true });
  const cierre = v.numero(body.cierre ?? body.horario?.cierre, 'cierre', { min: 1, max: 24, entero: true });
  if (cierre <= apertura) throw errorValidacion('La hora de cierre debe ser mayor que la de apertura.');
  return {
    nombre: v.texto(body.nombre, 'nombre', { min: 3, max: 80 }),
    ciudad: v.texto(body.ciudad, 'ciudad', { min: 3, max: 60 }),
    barrio: v.texto(body.barrio, 'barrio', { requerido: false, max: 60 }),
    direccion: v.texto(body.direccion, 'dirección', { min: 5, max: 120 }),
    telefono: v.texto(body.telefono, 'teléfono', { requerido: false, max: 20 }),
    horario: { apertura, cierre },
    activa: body.activa === undefined ? true : v.booleano(body.activa, 'activa'),
  };
}

// GET /api/sedes?buscar=&ciudad=&activa=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filtro = {};
    if (req.query.buscar) filtro.nombre = v.contiene(req.query.buscar);
    if (req.query.ciudad) filtro.ciudad = v.contiene(req.query.ciudad);
    if (req.query.activa !== undefined && req.query.activa !== '') {
      filtro.activa = v.booleano(req.query.activa, 'activa');
    }
    const sedes = await coleccion('sedes')
      .aggregate([
        { $match: filtro },
        { $lookup: { from: 'canchas', localField: '_id', foreignField: 'sedeId', as: 'canchas' } },
        { $addFields: { totalCanchas: { $size: '$canchas' } } },
        { $project: { canchas: 0 } },
        { $sort: { nombre: 1 } },
      ])
      .toArray();
    res.json(sedes);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sede = await coleccion('sedes').findOne({ _id: v.aObjectId(req.params.id) });
    if (!sede) throw errorNoEncontrado('Sede no encontrada.');
    res.json(sede);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const sede = { ...leerSede(req.body), creadaEn: new Date() };
    const { insertedId } = await coleccion('sedes').insertOne(sede);
    res.status(201).json({ _id: insertedId, ...sede });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const datos = leerSede(req.body);
    const actual = await coleccion('sedes').findOne({ _id });
    if (!actual) throw errorNoEncontrado('Sede no encontrada.');

    // no reducir el horario si quedan reservas futuras por fuera
    const { apertura, cierre } = datos.horario;
    const afectadas = await coleccion('reservas').countDocuments({
      sedeId: _id,
      activa: true,
      fecha: { $gte: hoyBogota() },
      $or: [{ horaInicio: { $lt: apertura } }, { horaFin: { $gt: cierre } }],
    });
    if (afectadas > 0) {
      throw errorConflicto(
        `El nuevo horario deja por fuera ${afectadas} reserva(s) futura(s). Cancélelas o reprográmelas primero.`
      );
    }

    await coleccion('sedes').updateOne({ _id }, { $set: { ...datos, actualizadaEn: new Date() } });
    res.json(await coleccion('sedes').findOne({ _id }));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const canchas = await coleccion('canchas').countDocuments({ sedeId: _id });
    if (canchas > 0) {
      throw errorConflicto(
        `La sede tiene ${canchas} cancha(s). Elimínelas primero o desactive la sede para conservar el historial.`
      );
    }
    const { deletedCount } = await coleccion('sedes').deleteOne({ _id });
    if (!deletedCount) throw errorNoEncontrado('Sede no encontrada.');
    res.json({ mensaje: 'Sede eliminada.' });
  })
);

module.exports = router;

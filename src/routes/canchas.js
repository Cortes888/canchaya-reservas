// Rutas de canchas
const express = require('express');
const { coleccion } = require('../db');
const { asyncHandler, errorNoEncontrado, errorConflicto } = require('../utils/errores');
const v = require('../utils/validaciones');
const { SUPERFICIES, validarTarifas, tipoTarifa } = require('../reglas/reservas');
const { momentoInicio } = require('../utils/tiempo');

const router = express.Router();

function leerCancha(body) {
  const tarifaNum = (valor, campo) => v.numero(valor, campo, { min: 10000, max: 1000000, entero: true });
  const tarifas = {
    valle: tarifaNum(body.tarifaValle ?? body.tarifas?.valle, 'tarifa valle'),
    pico: tarifaNum(body.tarifaPico ?? body.tarifas?.pico, 'tarifa pico'),
  };
  validarTarifas(tarifas.valle, tarifas.pico);
  return {
    sedeId: v.aObjectId(body.sedeId, 'sede'),
    nombre: v.texto(body.nombre, 'nombre', { min: 2, max: 60 }),
    superficie: v.opcion(body.superficie || SUPERFICIES[0], 'superficie', SUPERFICIES),
    techada: body.techada === undefined ? false : v.booleano(body.techada, 'techada'),
    tarifas,
    activa: body.activa === undefined ? true : v.booleano(body.activa, 'activa'),
  };
}

async function exigirSede(sedeId) {
  const sede = await coleccion('sedes').findOne({ _id: sedeId });
  if (!sede) throw errorNoEncontrado('La sede seleccionada no existe.');
  return sede;
}

// GET /api/canchas?sedeId=&techada=&buscar=&activa=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filtro = {};
    const q = req.query;
    if (q.sedeId) filtro.sedeId = v.aObjectId(q.sedeId, 'sede');
    if (q.buscar) filtro.nombre = v.contiene(q.buscar);
    if (q.techada !== undefined && q.techada !== '') filtro.techada = v.booleano(q.techada, 'techada');
    if (q.activa !== undefined && q.activa !== '') filtro.activa = v.booleano(q.activa, 'activa');

    const canchas = await coleccion('canchas')
      .aggregate([
        { $match: filtro },
        { $lookup: { from: 'sedes', localField: 'sedeId', foreignField: '_id', as: 'sede' } },
        { $unwind: '$sede' },
        {
          $project: {
            nombre: 1,
            superficie: 1,
            techada: 1,
            tarifas: 1,
            activa: 1,
            sedeId: 1,
            sedeNombre: '$sede.nombre',
            barrio: '$sede.barrio',
          },
        },
        { $sort: { sedeNombre: 1, nombre: 1 } },
      ])
      .toArray();
    res.json(canchas);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cancha = await coleccion('canchas').findOne({ _id: v.aObjectId(req.params.id) });
    if (!cancha) throw errorNoEncontrado('Cancha no encontrada.');
    res.json(cancha);
  })
);

// GET /api/canchas/:id/disponibilidad?fecha=2026-11-20
router.get(
  '/:id/disponibilidad',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const fecha = v.fecha(req.query.fecha);
    const cancha = await coleccion('canchas').findOne({ _id });
    if (!cancha) throw errorNoEncontrado('Cancha no encontrada.');
    const sede = await exigirSede(cancha.sedeId);

    const reservas = await coleccion('reservas')
      .find({ canchaId: _id, fecha, activa: true }, { projection: { franjas: 1 } })
      .toArray();
    const ocupadas = new Set(reservas.flatMap((r) => r.franjas));
    const ahora = new Date();

    const horas = [];
    for (let h = sede.horario.apertura; h < sede.horario.cierre; h++) {
      const pasada = momentoInicio(fecha, h) <= ahora;
      const tarifa = tipoTarifa(fecha, h);
      horas.push({
        hora: h,
        libre: !ocupadas.has(h) && !pasada,
        ocupada: ocupadas.has(h),
        pasada,
        tarifa,
        valor: cancha.tarifas[tarifa],
      });
    }
    res.json({ cancha: cancha.nombre, sede: sede.nombre, fecha, tarifas: cancha.tarifas, horas });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const cancha = leerCancha(req.body);
    await exigirSede(cancha.sedeId);
    cancha.creadaEn = new Date();
    const { insertedId } = await coleccion('canchas').insertOne(cancha);
    res.status(201).json({ _id: insertedId, ...cancha });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const datos = leerCancha(req.body);
    const actual = await coleccion('canchas').findOne({ _id });
    if (!actual) throw errorNoEncontrado('Cancha no encontrada.');
    await exigirSede(datos.sedeId);

    if (!actual.sedeId.equals(datos.sedeId)) {
      const reservas = await coleccion('reservas').countDocuments({ canchaId: _id });
      if (reservas > 0) {
        throw errorConflicto('La cancha ya tiene reservas registradas; no se puede cambiar de sede.');
      }
    }
    await coleccion('canchas').updateOne({ _id }, { $set: { ...datos, actualizadaEn: new Date() } });
    res.json(await coleccion('canchas').findOne({ _id }));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reservas = await coleccion('reservas').countDocuments({ canchaId: _id });
    if (reservas > 0) {
      throw errorConflicto(
        `La cancha tiene ${reservas} reserva(s) en su historial. Desactívela en lugar de eliminarla.`
      );
    }
    const { deletedCount } = await coleccion('canchas').deleteOne({ _id });
    if (!deletedCount) throw errorNoEncontrado('Cancha no encontrada.');
    res.json({ mensaje: 'Cancha eliminada.' });
  })
);

module.exports = router;

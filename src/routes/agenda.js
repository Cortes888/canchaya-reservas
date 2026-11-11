// Agenda del día de una sede
const express = require('express');
const { coleccion } = require('../db');
const { asyncHandler, errorNoEncontrado } = require('../utils/errores');
const v = require('../utils/validaciones');
const { tipoTarifa } = require('../reglas/reservas');

const router = express.Router();

// GET /api/agenda?fecha=2026-11-20&sedeId=...
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const fecha = v.fecha(req.query.fecha);
    const sedeId = v.aObjectId(req.query.sedeId, 'sede');
    const sede = await coleccion('sedes').findOne({ _id: sedeId });
    if (!sede) throw errorNoEncontrado('Sede no encontrada.');

    const canchas = await coleccion('canchas')
      .find({ sedeId }, { projection: { nombre: 1, techada: 1, activa: 1, tarifas: 1 } })
      .toArray();
    canchas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

    const reservas = await coleccion('reservas')
      .aggregate([
        { $match: { sedeId, fecha, activa: true } },
        { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
        { $unwind: '$cliente' },
        {
          $project: {
            codigo: 1,
            canchaId: 1,
            horaInicio: 1,
            horaFin: 1,
            duracionHoras: 1,
            estado: 1,
            total: 1,
            pagado: { $sum: '$pagos.monto' },
            cliente: { nombre: '$cliente.nombre', equipo: '$cliente.equipo', telefono: '$cliente.telefono' },
          },
        },
        { $sort: { horaInicio: 1 } },
      ])
      .toArray();

    const horas = [];
    for (let h = sede.horario.apertura; h < sede.horario.cierre; h++) {
      horas.push({ hora: h, tarifa: tipoTarifa(fecha, h) });
    }

    res.json({
      fecha,
      sede: { _id: sede._id, nombre: sede.nombre, horario: sede.horario, activa: sede.activa },
      canchas,
      horas,
      reservas,
    });
  })
);

module.exports = router;

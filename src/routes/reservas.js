// Rutas de reservas
const express = require('express');
const { ObjectId } = require('mongodb');
const { coleccion, siguienteCodigo } = require('../db');
const { asyncHandler, errorNoEncontrado, errorConflicto, errorValidacion } = require('../utils/errores');
const v = require('../utils/validaciones');
const { hoyBogota } = require('../utils/tiempo');
const R = require('../reglas/reservas');

const router = express.Router();


// une la reserva con cliente, cancha y sede
function pipelineDetalle(filtro, filtroPosterior = null, limite = 300, orden = { fecha: -1, horaInicio: -1 }) {
  const pipeline = [{ $match: filtro }];
  // si no se busca por cliente, se limita antes de los $lookup
  if (!filtroPosterior) pipeline.push({ $sort: orden }, { $limit: limite });
  pipeline.push(
    { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: 'cliente' } },
    { $unwind: '$cliente' },
    { $lookup: { from: 'canchas', localField: 'canchaId', foreignField: '_id', as: 'cancha' } },
    { $unwind: '$cancha' },
    { $lookup: { from: 'sedes', localField: 'sedeId', foreignField: '_id', as: 'sede' } },
    { $unwind: '$sede' }
  );
  if (filtroPosterior) pipeline.push({ $match: filtroPosterior });
  pipeline.push(
    {
      $project: {
        codigo: 1,
        fecha: 1,
        horaInicio: 1,
        horaFin: 1,
        duracionHoras: 1,
        estado: 1,
        detalle: 1,
        total: 1,
        pagos: 1,
        notas: 1,
        cancelacion: 1,
        creadaEn: 1,
        pagado: { $sum: '$pagos.monto' },
        saldo: { $subtract: ['$total', { $sum: '$pagos.monto' }] },
        clienteId: 1,
        canchaId: 1,
        sedeId: 1,
        cliente: {
          nombre: '$cliente.nombre',
          documento: '$cliente.documento',
          telefono: '$cliente.telefono',
          equipo: '$cliente.equipo',
        },
        cancha: { nombre: '$cancha.nombre', techada: '$cancha.techada' },
        sede: { nombre: '$sede.nombre', barrio: '$sede.barrio' },
      },
    },
    { $sort: orden },
    { $limit: limite }
  );
  return pipeline;
}

async function buscarDetalle(_id) {
  const [reserva] = await coleccion('reservas').aggregate(pipelineDetalle({ _id }, null, 1)).toArray();
  return reserva || null;
}

async function exigirReserva(_id) {
  const reserva = await coleccion('reservas').findOne({ _id });
  if (!reserva) throw errorNoEncontrado('Reserva no encontrada.');
  return reserva;
}

async function verificarCruces({ canchaId, clienteId, fecha, franjas, excluirId = null }) {
  const base = { fecha, activa: true, franjas: { $in: franjas } };
  if (excluirId) base._id = { $ne: excluirId };

  const choqueCancha = await coleccion('reservas').findOne({ ...base, canchaId });
  if (choqueCancha) {
    throw errorConflicto(
      `La cancha ya está reservada de ${choqueCancha.horaInicio}:00 a ${choqueCancha.horaFin}:00 ese día (${choqueCancha.codigo}).`
    );
  }
  const choqueCliente = await coleccion('reservas').findOne({ ...base, clienteId });
  if (choqueCliente) {
    throw errorConflicto(`El cliente ya tiene otra reserva que se cruza con ese horario (${choqueCliente.codigo}).`);
  }
}

function leerHorario(body) {
  return {
    fecha: v.fecha(body.fecha),
    horaInicio: v.numero(body.horaInicio, 'hora de inicio', { min: 0, max: 23, entero: true }),
    duracionHoras: v.numero(body.duracionHoras, 'duración', {
      min: R.REGLAS.DURACION_MIN,
      max: R.REGLAS.DURACION_MAX,
      entero: true,
    }),
  };
}


// GET /api/reservas?desde=&hasta=&sedeId=&canchaId=&clienteId=&estado=&buscar=&orden=asc
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query;
    const filtro = {};
    if (q.desde || q.hasta) {
      filtro.fecha = {};
      if (q.desde) filtro.fecha.$gte = v.fecha(q.desde, 'desde');
      if (q.hasta) filtro.fecha.$lte = v.fecha(q.hasta, 'hasta');
    }
    if (q.sedeId) filtro.sedeId = v.aObjectId(q.sedeId, 'sede');
    if (q.canchaId) filtro.canchaId = v.aObjectId(q.canchaId, 'cancha');
    if (q.clienteId) filtro.clienteId = v.aObjectId(q.clienteId, 'cliente');
    if (q.estado) filtro.estado = v.opcion(q.estado, 'estado', R.ESTADOS);

    // la búsqueda por cliente va después del $lookup
    let filtroPosterior = null;
    if (q.buscar) {
      const patron = v.contiene(q.buscar);
      filtroPosterior = {
        $or: [{ codigo: patron }, { 'cliente.nombre': patron }, { 'cliente.documento': patron }, { 'cliente.equipo': patron }],
      };
    }
    const orden = q.orden === 'asc' ? { fecha: 1, horaInicio: 1 } : { fecha: -1, horaInicio: -1 };
    const reservas = await coleccion('reservas').aggregate(pipelineDetalle(filtro, filtroPosterior, 300, orden)).toArray();
    res.json(reservas);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const reserva = await buscarDetalle(v.aObjectId(req.params.id));
    if (!reserva) throw errorNoEncontrado('Reserva no encontrada.');
    res.json(reserva);
  })
);

// POST /api/reservas  { canchaId, clienteId, fecha, horaInicio, duracionHoras, notas }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const canchaId = v.aObjectId(req.body.canchaId, 'cancha');
    const clienteId = v.aObjectId(req.body.clienteId, 'cliente');
    const horario = leerHorario(req.body);
    const notas = v.texto(req.body.notas, 'notas', { requerido: false, max: 200 });

    const [cancha, cliente] = await Promise.all([
      coleccion('canchas').findOne({ _id: canchaId }),
      coleccion('clientes').findOne({ _id: clienteId }),
    ]);
    if (!cancha) throw errorNoEncontrado('La cancha no existe.');
    if (!cliente) throw errorNoEncontrado('El cliente no existe.');
    if (!cancha.activa) throw errorValidacion('La cancha está desactivada y no recibe reservas.');

    const sede = await coleccion('sedes').findOne({ _id: cancha.sedeId });
    if (!sede || !sede.activa) throw errorValidacion('La sede de esta cancha no está activa.');

    const { horaFin, franjas } = R.validarHorarioReserva(horario, sede);

    const pendientes = await coleccion('reservas').countDocuments({
      clienteId,
      estado: 'pendiente',
      fecha: { $gte: hoyBogota() },
    });
    if (pendientes >= R.REGLAS.MAX_PENDIENTES_POR_CLIENTE) {
      throw errorConflicto(
        `El cliente ya tiene ${pendientes} reservas sin pagar completas. Debe pagar alguna antes de reservar otra.`
      );
    }

    await verificarCruces({ canchaId, clienteId, fecha: horario.fecha, franjas });

    const detalle = R.calcularDetalle(horario.fecha, horario.horaInicio, horario.duracionHoras, cancha.tarifas);
    const reserva = {
      codigo: R.formatoCodigo(await siguienteCodigo()),
      canchaId,
      clienteId,
      sedeId: cancha.sedeId,
      fecha: horario.fecha,
      horaInicio: horario.horaInicio,
      horaFin,
      duracionHoras: horario.duracionHoras,
      franjas,
      detalle,
      total: R.calcularTotal(detalle),
      estado: 'pendiente',
      activa: true,
      pagos: [],
      notas,
      creadaEn: new Date(),
    };
    const { insertedId } = await coleccion('reservas').insertOne(reserva);
    res.status(201).json(await buscarDetalle(insertedId));
  })
);

// PUT /api/reservas/:id (reprogramar)
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const actual = await exigirReserva(_id);
    R.validarCambioReserva(actual, new Date(), 'reprogramar');

    const horario = leerHorario(req.body);
    const notas = v.texto(req.body.notas, 'notas', { requerido: false, max: 200 });
    const [sede, cancha] = await Promise.all([
      coleccion('sedes').findOne({ _id: actual.sedeId }),
      coleccion('canchas').findOne({ _id: actual.canchaId }),
    ]);
    if (!sede || !sede.activa) throw errorValidacion('La sede de esta reserva no está activa.');
    if (!cancha || !cancha.activa) throw errorValidacion('La cancha de esta reserva no está activa.');

    const { horaFin, franjas } = R.validarHorarioReserva(horario, sede);
    await verificarCruces({
      canchaId: actual.canchaId,
      clienteId: actual.clienteId,
      fecha: horario.fecha,
      franjas,
      excluirId: _id,
    });

    const detalle = R.calcularDetalle(horario.fecha, horario.horaInicio, horario.duracionHoras, cancha.tarifas);
    const total = R.calcularTotal(detalle);
    const pagado = R.totalPagado(actual);
    if (pagado > total) {
      throw errorValidacion(
        `El cliente ya pagó $${pagado.toLocaleString('es-CO')}, más que el nuevo total ($${total.toLocaleString('es-CO')}).`
      );
    }

    await coleccion('reservas').updateOne(
      { _id },
      {
        $set: {
          fecha: horario.fecha,
          horaInicio: horario.horaInicio,
          horaFin,
          duracionHoras: horario.duracionHoras,
          franjas,
          detalle,
          total,
          estado: R.estadoSegunPagos(total, pagado),
          notas,
          actualizadaEn: new Date(),
        },
      }
    );
    res.json(await buscarDetalle(_id));
  })
);

// POST /api/reservas/:id/pagos  { monto, metodo }
router.post(
  '/:id/pagos',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reserva = await exigirReserva(_id);
    const monto = v.numero(req.body.monto, 'monto', { min: 1, entero: true });
    const metodo = req.body.metodo;
    const saldoRestante = R.validarPago(reserva, monto, metodo);

    const pago = { _id: new ObjectId(), monto, metodo, fecha: new Date() };
    const nuevoEstado = saldoRestante === 0 ? 'confirmada' : 'pendiente';

    const { modifiedCount } = await coleccion('reservas').updateOne(
      { _id, estado: 'pendiente' },
      { $push: { pagos: pago }, $set: { estado: nuevoEstado } }
    );
    if (!modifiedCount) throw errorConflicto('La reserva cambió mientras se registraba el pago. Intente de nuevo.');
    res.status(201).json(await buscarDetalle(_id));
  })
);

// POST /api/reservas/:id/cancelar  { motivo }
router.post(
  '/:id/cancelar',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reserva = await exigirReserva(_id);
    const ahora = new Date();
    R.validarCambioReserva(reserva, ahora, 'cancelar');
    const motivo = v.texto(req.body.motivo, 'motivo', { requerido: false, max: 200 });
    const reembolso = R.calcularReembolso(reserva, ahora);

    await coleccion('reservas').updateOne(
      { _id },
      {
        $set: {
          estado: 'cancelada',
          activa: false,
          cancelacion: { fecha: ahora, motivo, reembolso, retenido: R.totalPagado(reserva) - reembolso },
        },
      }
    );
    res.json(await buscarDetalle(_id));
  })
);

// POST /api/reservas/:id/completar
router.post(
  '/:id/completar',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reserva = await exigirReserva(_id);
    R.validarCompletar(reserva, new Date());
    await coleccion('reservas').updateOne({ _id }, { $set: { estado: 'completada' } });
    res.json(await buscarDetalle(_id));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reserva = await exigirReserva(_id);
    R.validarEliminacion(reserva);
    await coleccion('reservas').deleteOne({ _id });
    res.json({ mensaje: 'Reserva eliminada.' });
  })
);

module.exports = router;

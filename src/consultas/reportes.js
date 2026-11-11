// Pipelines de los reportes

const { tipoTarifa } = require('../reglas/reservas');
const { sumarDias } = require('../utils/tiempo');

const ZONA = 'America/Bogota';

// filtro por fechas y sede
function matchBase({ desde, hasta, sedeId } = {}, extra = {}) {
  const filtro = { ...extra };
  if (desde || hasta) {
    filtro.fecha = {};
    if (desde) filtro.fecha.$gte = desde;
    if (hasta) filtro.fecha.$lte = hasta;
  }
  if (sedeId) filtro.sedeId = sedeId;
  return filtro;
}

const NO_CANCELADAS = { estado: { $ne: 'cancelada' } };

// lo pagado menos lo reembolsado
const INGRESO_RESERVA = { $subtract: [{ $sum: '$pagos.monto' }, { $ifNull: ['$cancelacion.reembolso', 0] }] };

// Indicadores generales
function resumen(filtros) {
  return [
    { $match: matchBase(filtros) },
    {
      $group: {
        _id: null,
        totalReservas: { $sum: 1 },
        canceladas: { $sum: { $cond: [{ $eq: ['$estado', 'cancelada'] }, 1, 0] } },
        pendientes: { $sum: { $cond: [{ $eq: ['$estado', 'pendiente'] }, 1, 0] } },
        confirmadas: { $sum: { $cond: [{ $eq: ['$estado', 'confirmada'] }, 1, 0] } },
        completadas: { $sum: { $cond: [{ $eq: ['$estado', 'completada'] }, 1, 0] } },
        horasVendidas: { $sum: { $cond: [{ $ne: ['$estado', 'cancelada'] }, '$duracionHoras', 0] } },
        ingresos: { $sum: INGRESO_RESERVA },
        abonosRetenidos: { $sum: { $ifNull: ['$cancelacion.retenido', 0] } },
        porCobrar: {
          $sum: {
            $cond: [{ $eq: ['$estado', 'pendiente'] }, { $subtract: ['$total', { $sum: '$pagos.monto' }] }, 0],
          },
        },
        // $avg ignora los null
        valorPromedio: { $avg: { $cond: [{ $ne: ['$estado', 'cancelada'] }, '$total', null] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalReservas: 1,
        canceladas: 1,
        pendientes: 1,
        confirmadas: 1,
        completadas: 1,
        horasVendidas: 1,
        ingresos: 1,
        abonosRetenidos: 1,
        porCobrar: 1,
        valorPromedio: { $round: [{ $ifNull: ['$valorPromedio', 0] }, 0] },
        tasaCancelacion: {
          $cond: [
            { $eq: ['$totalReservas', 0] },
            0,
            { $round: [{ $multiply: [{ $divide: ['$canceladas', '$totalReservas'] }, 100] }, 1] },
          ],
        },
      },
    },
  ];
}

// Horas pico
function horasPico(filtros) {
  return [
    { $match: matchBase(filtros, NO_CANCELADAS) },
    { $unwind: '$franjas' },
    { $group: { _id: '$franjas', reservas: { $sum: 1 } } },
    { $project: { _id: 0, hora: '$_id', reservas: 1 } },
    { $sort: { hora: 1 } },
  ];
}

// Canchas más reservadas
function canchasTop(filtros, limite = 5) {
  return [
    { $match: matchBase(filtros, NO_CANCELADAS) },
    {
      $group: {
        _id: '$canchaId',
        reservas: { $sum: 1 },
        horas: { $sum: '$duracionHoras' },
        recaudado: { $sum: { $sum: '$pagos.monto' } },
      },
    },
    { $sort: { reservas: -1, horas: -1 } },
    { $limit: limite },
    { $lookup: { from: 'canchas', localField: '_id', foreignField: '_id', as: 'cancha' } },
    { $unwind: '$cancha' },
    { $lookup: { from: 'sedes', localField: 'cancha.sedeId', foreignField: '_id', as: 'sede' } },
    { $unwind: '$sede' },
    {
      $project: {
        _id: 0,
        canchaId: '$_id',
        cancha: '$cancha.nombre',
        sede: '$sede.nombre',
        reservas: 1,
        horas: 1,
        recaudado: 1,
      },
    },
  ];
}

// Ingresos por sede y mes (por fecha del pago)
function ingresosSedeMes({ desde, hasta, sedeId } = {}) {
  const filtroPago = {};
  if (desde) filtroPago.$gte = new Date(`${desde}T00:00:00-05:00`);
  if (hasta) filtroPago.$lt = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + 86400000);

  const pipeline = [
    {
      $match: matchBase({ sedeId }, { $or: [{ estado: { $ne: 'cancelada' } }, { 'cancelacion.reembolso': 0 }] }),
    },
    { $unwind: '$pagos' },
  ];
  if (desde || hasta) pipeline.push({ $match: { 'pagos.fecha': filtroPago } });
  pipeline.push(
    {
      $group: {
        _id: {
          sedeId: '$sedeId',
          mes: { $dateToString: { format: '%Y-%m', date: '$pagos.fecha', timezone: ZONA } },
        },
        ingresos: { $sum: '$pagos.monto' },
        pagos: { $sum: 1 },
      },
    },
    { $lookup: { from: 'sedes', localField: '_id.sedeId', foreignField: '_id', as: 'sede' } },
    { $unwind: '$sede' },
    { $project: { _id: 0, sede: '$sede.nombre', mes: '$_id.mes', ingresos: 1, pagos: 1 } },
    { $sort: { mes: 1, sede: 1 } }
  );
  return pipeline;
}

// Clientes frecuentes
function clientesFrecuentes(filtros, limite = 10) {
  return [
    { $match: matchBase(filtros, NO_CANCELADAS) },
    {
      $group: {
        _id: '$clienteId',
        reservas: { $sum: 1 },
        horas: { $sum: '$duracionHoras' },
        gastado: { $sum: { $sum: '$pagos.monto' } },
        ultimaReserva: { $max: '$fecha' },
      },
    },
    { $sort: { reservas: -1, gastado: -1 } },
    { $limit: limite },
    { $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'cliente' } },
    { $unwind: '$cliente' },
    {
      $project: {
        _id: 0,
        clienteId: '$_id',
        nombre: '$cliente.nombre',
        documento: '$cliente.documento',
        equipo: '$cliente.equipo',
        reservas: 1,
        horas: 1,
        gastado: 1,
        ultimaReserva: 1,
      },
    },
  ];
}

// Reservas por día de la semana (1 = domingo)
function porDiaSemana(filtros) {
  return [
    { $match: matchBase(filtros, NO_CANCELADAS) },
    {
      $group: {
        _id: { $dayOfWeek: { $dateFromString: { dateString: '$fecha' } } },
        reservas: { $sum: 1 },
        horas: { $sum: '$duracionHoras' },
        recaudado: { $sum: { $sum: '$pagos.monto' } },
      },
    },
    { $project: { _id: 0, dia: '$_id', reservas: 1, horas: 1, recaudado: 1 } },
    { $sort: { dia: 1 } },
  ];
}

// Horas vendidas por sede y tarifa (para la ocupación)
function horasVendidasPorTarifa(filtros) {
  return [
    { $match: matchBase(filtros, NO_CANCELADAS) },
    { $unwind: '$detalle' },
    { $group: { _id: { sedeId: '$sedeId', tarifa: '$detalle.tarifa' }, horas: { $sum: 1 } } },
  ];
}

// horas disponibles de una sede en el rango
function capacidadSede(horario, canchas, desde, hasta) {
  const capacidad = { valle: 0, pico: 0 };
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    for (let h = horario.apertura; h < horario.cierre; h++) {
      capacidad[tipoTarifa(fecha, h)] += canchas;
    }
  }
  return capacidad;
}

module.exports = {
  matchBase,
  resumen,
  horasPico,
  canchasTop,
  ingresosSedeMes,
  clientesFrecuentes,
  porDiaSemana,
  horasVendidasPorTarifa,
  capacidadSede,
};

// Rutas de reportes (los pipelines están en consultas/reportes.js)
const express = require('express');
const { coleccion } = require('../db');
const { asyncHandler, errorValidacion } = require('../utils/errores');
const v = require('../utils/validaciones');
const { hoyBogota, sumarDias } = require('../utils/tiempo');
const P = require('../consultas/reportes');

const router = express.Router();

// ?desde=&hasta=&sedeId=
function leerFiltros(q) {
  const filtros = {};
  if (q.desde) filtros.desde = v.fecha(q.desde, 'desde');
  if (q.hasta) filtros.hasta = v.fecha(q.hasta, 'hasta');
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    throw errorValidacion('La fecha "desde" no puede ser posterior a "hasta".');
  }
  if (q.sedeId) filtros.sedeId = v.aObjectId(q.sedeId, 'sede');
  return filtros;
}

const limite = (q, porDefecto) =>
  q.limite ? v.numero(q.limite, 'límite', { min: 1, max: 50, entero: true }) : porDefecto;

const ejecutar = (pipeline) => coleccion('reservas').aggregate(pipeline).toArray();

const VACIO = {
  totalReservas: 0,
  canceladas: 0,
  pendientes: 0,
  confirmadas: 0,
  completadas: 0,
  horasVendidas: 0,
  ingresos: 0,
  abonosRetenidos: 0,
  porCobrar: 0,
  valorPromedio: 0,
  tasaCancelacion: 0,
};

router.get(
  '/resumen',
  asyncHandler(async (req, res) => {
    const [r] = await ejecutar(P.resumen(leerFiltros(req.query)));
    res.json(r || VACIO);
  })
);

router.get(
  '/horas-pico',
  asyncHandler(async (req, res) => res.json(await ejecutar(P.horasPico(leerFiltros(req.query)))))
);

router.get(
  '/canchas-top',
  asyncHandler(async (req, res) =>
    res.json(await ejecutar(P.canchasTop(leerFiltros(req.query), limite(req.query, 5))))
  )
);

router.get(
  '/ingresos-sede-mes',
  asyncHandler(async (req, res) => res.json(await ejecutar(P.ingresosSedeMes(leerFiltros(req.query)))))
);

router.get(
  '/clientes-frecuentes',
  asyncHandler(async (req, res) =>
    res.json(await ejecutar(P.clientesFrecuentes(leerFiltros(req.query), limite(req.query, 10))))
  )
);

router.get(
  '/dias-semana',
  asyncHandler(async (req, res) => res.json(await ejecutar(P.porDiaSemana(leerFiltros(req.query)))))
);

// ocupación = horas vendidas / horas disponibles (por defecto últimos 30 días)
router.get(
  '/ocupacion',
  asyncHandler(async (req, res) => {
    const filtros = leerFiltros(req.query);
    const hoy = hoyBogota();
    if (!filtros.hasta) filtros.hasta = filtros.desde && filtros.desde > hoy ? filtros.desde : hoy;
    if (!filtros.desde) filtros.desde = sumarDias(filtros.hasta, -29);
    if (sumarDias(filtros.desde, 366) < filtros.hasta) {
      throw errorValidacion('El rango para calcular la ocupación no puede superar un año.');
    }

    const vendidas = await ejecutar(P.horasVendidasPorTarifa(filtros));
    const filtroSedes = filtros.sedeId ? { _id: filtros.sedeId } : {};
    const sedes = await coleccion('sedes').find(filtroSedes).toArray();

    const resultado = [];
    for (const sede of sedes) {
      const canchas = await coleccion('canchas').countDocuments({ sedeId: sede._id, activa: true });
      if (!canchas) continue;
      const capacidad = P.capacidadSede(sede.horario, canchas, filtros.desde, filtros.hasta);
      const horas = (tarifa) =>
        vendidas.find((x) => x._id.sedeId.equals(sede._id) && x._id.tarifa === tarifa)?.horas || 0;
      const porcentaje = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
      const valle = horas('valle');
      const pico = horas('pico');
      resultado.push({
        sede: sede.nombre,
        canchas,
        horasVendidas: valle + pico,
        horasDisponibles: capacidad.valle + capacidad.pico,
        ocupacion: porcentaje(valle + pico, capacidad.valle + capacidad.pico),
        ocupacionPico: porcentaje(pico, capacidad.pico),
        ocupacionValle: porcentaje(valle, capacidad.valle),
      });
    }
    resultado.sort((a, b) => b.ocupacion - a.ocupacion);
    res.json({ desde: filtros.desde, hasta: filtros.hasta, sedes: resultado });
  })
);

module.exports = router;

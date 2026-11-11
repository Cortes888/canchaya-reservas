// Reglas de negocio de las reservas
const { ErrorApp } = require('../utils/errores');
const { esFechaValida, momentoInicio, horasEntre, hoyBogota, sumarDias } = require('../utils/tiempo');

const REGLAS = {
  DURACION_MIN: 1, // horas
  DURACION_MAX: 2,
  HORAS_MIN_CAMBIO: 2, // para cancelar o reprogramar
  HORAS_REEMBOLSO: 24,
  DIAS_MAX_ANTICIPACION: 60,
  MAX_PENDIENTES_POR_CLIENTE: 3,
  HORA_INICIO_PICO: 17, // lunes a viernes
};

const ESTADOS = ['pendiente', 'confirmada', 'cancelada', 'completada'];
const ESTADOS_ACTIVOS = ['pendiente', 'confirmada'];
const METODOS_PAGO = ['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'];
const SUPERFICIES = ['Grama sintética', 'Grama sintética premium'];

const falla = (msg) => new ErrorApp(400, msg);

// 0 = domingo, 6 = sábado
function diaSemana(fecha) {
  return new Date(`${fecha}T12:00:00-05:00`).getUTCDay();
}

function esFinDeSemana(fecha) {
  const d = diaSemana(fecha);
  return d === 0 || d === 6;
}

// pico: fin de semana o desde las 17:00
function tipoTarifa(fecha, hora) {
  return esFinDeSemana(fecha) || hora >= REGLAS.HORA_INICIO_PICO ? 'pico' : 'valle';
}

// 18:00 a 20:00 -> [18, 19]
function calcularFranjas(horaInicio, duracionHoras) {
  return Array.from({ length: duracionHoras }, (_, i) => horaInicio + i);
}

// precio de cada hora según la tarifa
function calcularDetalle(fecha, horaInicio, duracionHoras, tarifas) {
  return calcularFranjas(horaInicio, duracionHoras).map((hora) => {
    const tarifa = tipoTarifa(fecha, hora);
    return { hora, tarifa, valor: tarifas[tarifa] };
  });
}

const calcularTotal = (detalle) => detalle.reduce((suma, d) => suma + d.valor, 0);

function totalPagado(reserva) {
  return (reserva.pagos || []).reduce((suma, p) => suma + p.monto, 0);
}

function validarTarifas(valle, pico) {
  if (pico < valle) throw falla('La tarifa pico no puede ser menor que la tarifa valle.');
}

function validarHorarioReserva({ fecha, horaInicio, duracionHoras }, sede, ahora = new Date()) {
  if (!esFechaValida(fecha)) throw falla('La fecha debe tener formato AAAA-MM-DD.');
  if (!Number.isInteger(horaInicio) || horaInicio < 0 || horaInicio > 23) {
    throw falla('La hora de inicio debe ser un número entero entre 0 y 23.');
  }
  if (
    !Number.isInteger(duracionHoras) ||
    duracionHoras < REGLAS.DURACION_MIN ||
    duracionHoras > REGLAS.DURACION_MAX
  ) {
    throw falla(`La duración debe ser de ${REGLAS.DURACION_MIN} a ${REGLAS.DURACION_MAX} horas.`);
  }

  const { apertura, cierre } = sede.horario;
  const horaFin = horaInicio + duracionHoras;
  if (horaInicio < apertura || horaFin > cierre) {
    throw falla(
      `La sede ${sede.nombre} atiende de ${apertura}:00 a ${cierre}:00. ` +
        `La reserva (${horaInicio}:00 a ${horaFin}:00) está fuera de ese horario.`
    );
  }

  if (momentoInicio(fecha, horaInicio) <= ahora) {
    throw falla('No se puede reservar en una fecha u hora que ya pasó.');
  }

  const limite = sumarDias(hoyBogota(ahora), REGLAS.DIAS_MAX_ANTICIPACION);
  if (fecha > limite) {
    throw falla(`Solo se puede reservar con máximo ${REGLAS.DIAS_MAX_ANTICIPACION} días de anticipación.`);
  }

  return { horaFin, franjas: calcularFranjas(horaInicio, duracionHoras) };
}

const horasParaInicio = (reserva, ahora) => horasEntre(ahora, momentoInicio(reserva.fecha, reserva.horaInicio));

function validarCambioReserva(reserva, ahora = new Date(), accion = 'cancelar') {
  if (!ESTADOS_ACTIVOS.includes(reserva.estado)) {
    throw falla(`No se puede ${accion} una reserva en estado "${reserva.estado}".`);
  }
  if (horasParaInicio(reserva, ahora) < REGLAS.HORAS_MIN_CAMBIO) {
    throw falla(`Solo se puede ${accion} con al menos ${REGLAS.HORAS_MIN_CAMBIO} horas de anticipación.`);
  }
}

// con menos de 24 h no se devuelve el abono
function calcularReembolso(reserva, ahora = new Date()) {
  return horasParaInicio(reserva, ahora) >= REGLAS.HORAS_REEMBOLSO ? totalPagado(reserva) : 0;
}

function validarPago(reserva, monto, metodo) {
  if (reserva.estado !== 'pendiente') {
    throw falla(`Solo se registran pagos en reservas pendientes (estado actual: ${reserva.estado}).`);
  }
  if (!METODOS_PAGO.includes(metodo)) {
    throw falla(`El método de pago debe ser uno de: ${METODOS_PAGO.join(', ')}.`);
  }
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    throw falla('El monto debe ser mayor que cero.');
  }
  const saldo = reserva.total - totalPagado(reserva);
  if (monto > saldo) {
    throw falla(`El pago supera el saldo pendiente ($${saldo.toLocaleString('es-CO')}).`);
  }
  return saldo - monto;
}

function estadoSegunPagos(total, pagado) {
  return pagado >= total ? 'confirmada' : 'pendiente';
}

function validarCompletar(reserva, ahora = new Date()) {
  if (reserva.estado !== 'confirmada') {
    throw falla('Solo se pueden completar reservas confirmadas (pagadas).');
  }
  if (momentoInicio(reserva.fecha, reserva.horaFin) > ahora) {
    throw falla('La reserva todavía no ha terminado.');
  }
}

// solo se borran pendientes sin pagos, lo demás es historial
function validarEliminacion(reserva) {
  if (reserva.estado === 'pendiente' && totalPagado(reserva) === 0) return;
  throw falla('Solo se pueden eliminar reservas pendientes sin pagos. Las demás se conservan como historial.');
}

function formatoCodigo(numero) {
  return `R-${String(numero).padStart(5, '0')}`;
}

module.exports = {
  REGLAS,
  ESTADOS,
  ESTADOS_ACTIVOS,
  METODOS_PAGO,
  SUPERFICIES,
  diaSemana,
  esFinDeSemana,
  tipoTarifa,
  calcularFranjas,
  calcularDetalle,
  calcularTotal,
  totalPagado,
  validarTarifas,
  validarHorarioReserva,
  validarCambioReserva,
  calcularReembolso,
  validarPago,
  estadoSegunPagos,
  validarCompletar,
  validarEliminacion,
  formatoCodigo,
};

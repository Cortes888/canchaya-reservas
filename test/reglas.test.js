// Pruebas de las reglas de negocio
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/reglas/reservas');
const { esFechaValida, momentoInicio, hoyBogota, sumarDias } = require('../src/utils/tiempo');

// domingo 8 nov 2026, 9:00 a. m.
const AHORA = new Date('2026-11-08T09:00:00-05:00');
const SEDE = { nombre: 'Sede Prueba', horario: { apertura: 7, cierre: 23 } };
const TARIFAS = { valle: 90000, pico: 130000 };

test('tiempo: fechas válidas e inválidas', () => {
  assert.equal(esFechaValida('2026-11-20'), true);
  assert.equal(esFechaValida('2026-02-30'), false);
  assert.equal(esFechaValida('20-11-2026'), false);
  assert.equal(hoyBogota(new Date('2026-11-09T03:00:00Z')), '2026-11-08'); // 10 p. m. del 8 en Colombia
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
  assert.equal(momentoInicio('2026-11-20', 24).getTime(), new Date('2026-11-21T05:00:00Z').getTime());
});

test('tarifa valle o pico según día y hora', () => {
  assert.equal(R.diaSemana('2026-11-09'), 1); // lunes
  assert.equal(R.tipoTarifa('2026-11-10', 16), 'valle'); // martes 4 p. m.
  assert.equal(R.tipoTarifa('2026-11-10', 17), 'pico'); // martes 5 p. m.
  assert.equal(R.tipoTarifa('2026-11-14', 9), 'pico'); // sábado
  assert.equal(R.tipoTarifa('2026-11-15', 9), 'pico'); // domingo
});

test('detalle y total cruzando de valle a pico', () => {
  const detalle = R.calcularDetalle('2026-11-10', 16, 2, TARIFAS);
  assert.deepEqual(detalle, [
    { hora: 16, tarifa: 'valle', valor: 90000 },
    { hora: 17, tarifa: 'pico', valor: 130000 },
  ]);
  assert.equal(R.calcularTotal(detalle), 220000);
  assert.deepEqual(R.calcularFranjas(18, 2), [18, 19]);
  assert.throws(() => R.validarTarifas(100000, 90000), /pico/);
  assert.equal(R.formatoCodigo(42), 'R-00042');
});

test('reserva válida dentro del horario', () => {
  const r = R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 19, duracionHoras: 2 }, SEDE, AHORA);
  assert.deepEqual(r, { horaFin: 21, franjas: [19, 20] });
});

test('rechaza reservas fuera del horario o con duración inválida', () => {
  assert.throws(() => R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 6, duracionHoras: 1 }, SEDE, AHORA), /atiende/);
  assert.throws(() => R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 22, duracionHoras: 2 }, SEDE, AHORA), /atiende/);
  assert.doesNotThrow(() => R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 22, duracionHoras: 1 }, SEDE, AHORA));
  assert.throws(() => R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 10, duracionHoras: 3 }, SEDE, AHORA), /duración/);
  assert.throws(() => R.validarHorarioReserva({ fecha: '2026-11-10', horaInicio: 10.5, duracionHoras: 1 }, SEDE, AHORA), /hora de inicio/);
});

test('rechaza fechas pasadas y demasiada anticipación', () => {
  assert.throws(() => R.validarHorarioReserva({ fecha: '2026-11-08', horaInicio: 9, duracionHoras: 1 }, SEDE, AHORA), /ya pasó/);
  assert.doesNotThrow(() => R.validarHorarioReserva({ fecha: '2026-11-08', horaInicio: 10, duracionHoras: 1 }, SEDE, AHORA));
  assert.doesNotThrow(() => R.validarHorarioReserva({ fecha: '2027-01-07', horaInicio: 10, duracionHoras: 1 }, SEDE, AHORA));
  assert.throws(() => R.validarHorarioReserva({ fecha: '2027-01-08', horaInicio: 10, duracionHoras: 1 }, SEDE, AHORA), /60 días/);
});

test('cancelar con mínimo 2 horas; reembolso solo con 24 horas', () => {
  const pagada = { fecha: '2026-11-09', estado: 'confirmada', pagos: [{ monto: 65000 }] };
  assert.doesNotThrow(() => R.validarCambioReserva({ ...pagada, fecha: '2026-11-08', horaInicio: 11 }, AHORA)); // 2 h exactas
  assert.throws(() => R.validarCambioReserva({ ...pagada, fecha: '2026-11-08', horaInicio: 10 }, AHORA), /2 horas/);
  assert.throws(() => R.validarCambioReserva({ ...pagada, horaInicio: 20, estado: 'cancelada' }, AHORA), /estado/);
  assert.equal(R.calcularReembolso({ ...pagada, horaInicio: 9 }, AHORA), 65000); // 24 h exactas
  assert.equal(R.calcularReembolso({ ...pagada, horaInicio: 8 }, AHORA), 0); // 23 h: se retiene el abono
});

test('pagos: no superan el saldo y confirman al completar', () => {
  const reserva = { estado: 'pendiente', total: 130000, pagos: [{ monto: 65000 }] };
  assert.equal(R.totalPagado(reserva), 65000);
  assert.equal(R.validarPago(reserva, 65000, 'nequi'), 0);
  assert.equal(R.validarPago(reserva, 5000, 'daviplata'), 60000);
  assert.throws(() => R.validarPago(reserva, 65001, 'efectivo'), /saldo/);
  assert.throws(() => R.validarPago(reserva, 0, 'efectivo'), /mayor que cero/);
  assert.throws(() => R.validarPago(reserva, 1000, 'bitcoin'), /método/);
  assert.throws(() => R.validarPago({ ...reserva, estado: 'confirmada' }, 1000, 'efectivo'), /pendientes/);
  assert.equal(R.estadoSegunPagos(130000, 130000), 'confirmada');
  assert.equal(R.estadoSegunPagos(130000, 129999), 'pendiente');
});

test('completar solo reservas pagadas que ya terminaron', () => {
  const r = { estado: 'confirmada', fecha: '2026-11-08', horaInicio: 7, horaFin: 9 };
  assert.doesNotThrow(() => R.validarCompletar(r, AHORA));
  assert.throws(() => R.validarCompletar({ ...r, horaFin: 10 }, AHORA), /no ha terminado/);
  assert.throws(() => R.validarCompletar({ ...r, estado: 'pendiente' }, AHORA), /confirmadas/);
});

test('eliminación solo de pendientes sin pagos', () => {
  assert.doesNotThrow(() => R.validarEliminacion({ estado: 'pendiente', pagos: [] }));
  assert.throws(() => R.validarEliminacion({ estado: 'pendiente', pagos: [{ monto: 5 }] }), /historial/);
  assert.throws(() => R.validarEliminacion({ estado: 'cancelada', pagos: [] }), /historial/);
  assert.throws(() => R.validarEliminacion({ estado: 'confirmada', pagos: [] }), /historial/);
});

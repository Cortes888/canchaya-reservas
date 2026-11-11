// Revisa que los datos de prueba cumplan las reglas
const test = require('node:test');
const assert = require('node:assert/strict');
const { generarDatos } = require('../scripts/datos-semilla');
const R = require('../src/reglas/reservas');
const { momentoInicio, hoyBogota } = require('../src/utils/tiempo');

const AHORA = new Date('2026-11-10T16:00:00-05:00');
let n = 0;
const datos = generarDatos(AHORA, () => `id${++n}`);
const suma = (r) => r.pagos.reduce((s, p) => s + p.monto, 0);

test('cantidades razonables', () => {
  assert.equal(datos.sedes.length, 3);
  assert.equal(datos.canchas.length, 10);
  assert.ok(datos.clientes.length >= 40);
  assert.ok(datos.reservas.length > 1500, `solo ${datos.reservas.length} reservas`);
  assert.equal(datos.contador, datos.reservas.length);
});

test('documentos, emails y códigos únicos', () => {
  assert.equal(new Set(datos.clientes.map((c) => c.documento)).size, datos.clientes.length);
  assert.equal(new Set(datos.clientes.map((c) => c.email)).size, datos.clientes.length);
  assert.equal(new Set(datos.reservas.map((r) => r.codigo)).size, datos.reservas.length);
  datos.clientes.forEach((c) => assert.match(c.telefono, /^3\d{2} \d{3} \d{4}$/));
});

test('ninguna cancha ni cliente tiene reservas activas cruzadas', () => {
  const vistos = new Set();
  for (const r of datos.reservas.filter((x) => x.activa)) {
    for (const h of r.franjas) {
      for (const clave of [`c${r.canchaId}|${r.fecha}|${h}`, `p${r.clienteId}|${r.fecha}|${h}`]) {
        assert.ok(!vistos.has(clave), `cruce en ${clave}`);
        vistos.add(clave);
      }
    }
  }
});

test('cada reserva es coherente con su sede, tarifas, estado y pagos', () => {
  const sedes = new Map(datos.sedes.map((s) => [s._id, s]));
  const canchas = new Map(datos.canchas.map((c) => [c._id, c]));
  const pendientes = new Map();
  const hoy = hoyBogota(AHORA);
  for (const r of datos.reservas) {
    const cancha = canchas.get(r.canchaId);
    const sede = sedes.get(r.sedeId);
    assert.equal(cancha.sedeId, r.sedeId);
    assert.ok(r.horaInicio >= sede.horario.apertura && r.horaFin <= sede.horario.cierre);
    assert.ok(r.duracionHoras >= 1 && r.duracionHoras <= R.REGLAS.DURACION_MAX);
    assert.deepEqual(r.detalle, R.calcularDetalle(r.fecha, r.horaInicio, r.duracionHoras, cancha.tarifas));
    assert.equal(r.total, R.calcularTotal(r.detalle));
    assert.equal(r.activa, r.estado !== 'cancelada');
    assert.ok(r.creadaEn <= AHORA, 'reserva creada en el futuro');
    const pagado = suma(r);
    assert.ok(pagado <= r.total);
    r.pagos.forEach((p) => {
      assert.ok(Number.isInteger(p.monto) && p.monto > 0);
      assert.ok(p.fecha <= AHORA && p.fecha >= r.creadaEn, 'fecha de pago fuera de rango');
      assert.ok(R.METODOS_PAGO.includes(p.metodo));
    });
    const inicio = momentoInicio(r.fecha, r.horaInicio);
    if (r.estado === 'confirmada' || r.estado === 'completada') assert.equal(pagado, r.total);
    if (r.estado === 'completada') assert.ok(r.fecha < hoy);
    if (r.estado === 'pendiente') {
      assert.ok(pagado < r.total);
      assert.ok(inicio > AHORA);
      pendientes.set(r.clienteId, (pendientes.get(r.clienteId) || 0) + 1);
    }
    if (r.estado === 'cancelada') {
      const c = r.cancelacion;
      const anticipacion = (inicio - c.fecha) / 3600000;
      assert.ok(anticipacion >= R.REGLAS.HORAS_MIN_CAMBIO);
      assert.equal(c.reembolso + c.retenido, pagado);
      assert.equal(c.reembolso, anticipacion >= R.REGLAS.HORAS_REEMBOLSO ? pagado : 0);
    }
  }
  for (const [, cantidad] of pendientes) assert.ok(cantidad <= R.REGLAS.MAX_PENDIENTES_POR_CLIENTE);
});

test('los códigos siguen el orden de creación', () => {
  const ordenadas = [...datos.reservas].sort((a, b) => a.codigo.localeCompare(b.codigo));
  for (let i = 1; i < ordenadas.length; i++) assert.ok(ordenadas[i - 1].creadaEn <= ordenadas[i].creadaEn);
});

test('patrones realistas: más demanda en pico, todos los estados presentes', () => {
  const horas = datos.reservas.filter((r) => r.activa).flatMap((r) => r.detalle);
  const pico = horas.filter((h) => h.tarifa === 'pico').length;
  assert.ok(pico > horas.length * 0.6, 'la mayoría de horas vendidas debería ser pico');
  const estados = new Set(datos.reservas.map((r) => r.estado));
  R.ESTADOS.forEach((e) => assert.ok(estados.has(e), `falta ${e}`));
  assert.ok(datos.reservas.some((r) => r.cancelacion && r.cancelacion.retenido > 0));
  assert.ok(datos.reservas.some((r) => r.cancelacion && r.cancelacion.reembolso > 0));
});

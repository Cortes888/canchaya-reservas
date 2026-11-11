// Genera los datos de prueba (seed.js los inserta)
const R = require('../src/reglas/reservas');
const { momentoInicio, hoyBogota, sumarDias } = require('../src/utils/tiempo');

const DIAS_ATRAS = 120;
const DIAS_ADELANTE = 21;
const HORA = 3600000;

// aleatorio con semilla fija para que los datos salgan siempre iguales
function crearAzar(semilla = 20261110) {
  let s = semilla >>> 0;
  const azar = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  azar.entero = (min, max) => min + Math.floor(azar() * (max - min + 1));
  azar.elegir = (lista) => lista[Math.floor(azar() * lista.length)];
  azar.ponderado = (pares) => {
    const total = pares.reduce((s2, [, p]) => s2 + p, 0);
    let r = azar() * total;
    for (const [valor, peso] of pares) {
      r -= peso;
      if (r < 0) return valor;
    }
    return pares[pares.length - 1][0];
  };
  return azar;
}

const SEDES = [
  { nombre: 'Sede Laureles', barrio: 'Laureles', ciudad: 'Medellín', direccion: 'Carrera 76 # 33A-20', telefono: '604 444 1020', horario: { apertura: 7, cierre: 23 } },
  { nombre: 'Sede Belén', barrio: 'Belén La Palma', ciudad: 'Medellín', direccion: 'Calle 30A # 82-15', telefono: '604 342 7781', horario: { apertura: 7, cierre: 23 } },
  { nombre: 'Sede Envigado', barrio: 'Zúñiga', ciudad: 'Envigado', direccion: 'Carrera 43A # 38 Sur-40', telefono: '604 270 8899', horario: { apertura: 8, cierre: 22 } },
];

// [sede, nombre, superficie, techada, tarifa valle, tarifa pico]
const CANCHAS = [
  [0, 'Cancha 1', 'Grama sintética', false, 90000, 130000],
  [0, 'Cancha 2', 'Grama sintética', false, 90000, 130000],
  [0, 'Cancha 3', 'Grama sintética premium', true, 100000, 145000],
  [0, 'Cancha 4', 'Grama sintética premium', false, 95000, 135000],
  [1, 'Cancha 1', 'Grama sintética', false, 80000, 120000],
  [1, 'Cancha 2', 'Grama sintética', false, 80000, 120000],
  [1, 'Cancha 3', 'Grama sintética premium', true, 90000, 130000],
  [2, 'Cancha 1', 'Grama sintética', false, 85000, 125000],
  [2, 'Cancha 2', 'Grama sintética', false, 85000, 125000],
  [2, 'Cancha 3', 'Grama sintética premium', true, 95000, 135000],
];

// [nombre, equipo]; los primeros 20 son los equipos fijos
const CLIENTES = [
  ['Mateo Gómez Restrepo', 'Los Parceros FC'],
  ['Juan Pablo Ospina Vélez', 'Atlético La 70'],
  ['Sebastián Montoya Arango', 'Sporting Laureles'],
  ['Andrés Felipe Castaño Ríos', 'Contabilidad FC'],
  ['Carlos Mario Zapata Henao', 'Veteranos de Belén'],
  ['Santiago Quintero Muñoz', 'Real Estrella'],
  ['Daniel Esteban Cardona López', 'Los Galácticos'],
  ['Alejandro Jaramillo Mejía', 'Deportivo Sistemas'],
  ['Valentina Restrepo Correa', 'Las Imparables'],
  ['Jhon Fredy Marín Agudelo', 'Club Amigos del Martes'],
  ['Julián David Álvarez Posada', 'Inter de Zúñiga'],
  ['Camilo Andrés Vargas Toro', 'La Banda del 10'],
  ['Felipe Echeverri Gil', 'Ingenieros FC'],
  ['Luisa Fernanda Arboleda Hoyos', 'Las Panteras'],
  ['Esteban Patiño Duque', 'Combinado Envigado'],
  ['Ricardo Alonso Betancur Ruiz', 'Los Tíos FC'],
  ['Tomás Uribe Salazar', 'Fénix FC'],
  ['Simón Gallego Pineda', 'Pibes del Barrio'],
  ['Mariana Ochoa Londoño', 'Fútbol Mixto Belén'],
  ['Kevin Alexis Rendón Usuga', 'Los Cracks'],
  ['Juan Camilo Sierra Bedoya', ''],
  ['David Santiago Mesa Rojas', 'Oficina Central FC'],
  ['Laura Sofía Hincapié Giraldo', ''],
  ['Óscar Iván Tobón Franco', 'Taller Mecánico FC'],
  ['Nicolás Holguín Cano', ''],
  ['Brayan Stiven Mazo Lopera', 'Los del Parque'],
  ['Manuela Builes Escobar', ''],
  ['Wilmar Alexis Gaviria Cuartas', 'Transportes Aburrá'],
  ['Cristian Camilo Arango Vélez', ''],
  ['Jorge Iván Peláez Molina', 'Amigos de la U'],
  ['Isabella Morales Tamayo', ''],
  ['Juan Esteban Ramírez Zuluaga', 'Fiebre Amarilla'],
  ['Hernán Darío Valencia Osorio', ''],
  ['Diego Alejandro Taborda Ruiz', 'Barrio Fátima FC'],
  ['Sara Catalina Durango Pérez', ''],
  ['Mauricio Londoño Villa', 'Ex Alumnos FC'],
  ['Miguel Ángel Suárez Grisales', ''],
  ['Paula Andrea Ceballos Mira', ''],
  ['Yeison Alberto Cardona Úsuga', 'Los Pelaos'],
  ['Juliana Castrillón Alzate', ''],
  ['Emmanuel Torres Bustamante', ''],
  ['Johan Sebastián Correa Monsalve', 'Racing La América'],
  ['Natalia Vélez Ocampo', ''],
  ['Fernando José Pino Arenas', ''],
  ['Samuel Cuervo Rincón', 'Turbo FC'],
  ['Andrés Mauricio Herrera Acosta', ''],
];

// [cliente, sede, cancha, día (0 = domingo), hora, duración]
const FIJOS = [
  [0, 0, 0, 1, 20, 1],
  [1, 0, 1, 2, 19, 1],
  [2, 0, 2, 2, 20, 2],
  [3, 0, 3, 3, 18, 1],
  [4, 1, 0, 3, 19, 1],
  [5, 1, 1, 4, 20, 1],
  [6, 0, 0, 4, 21, 1],
  [7, 0, 2, 5, 19, 2],
  [8, 1, 2, 1, 19, 1],
  [9, 0, 1, 2, 21, 1],
  [10, 2, 0, 2, 19, 1],
  [11, 2, 1, 4, 20, 1],
  [12, 2, 2, 3, 20, 1],
  [13, 1, 2, 5, 18, 1],
  [14, 2, 0, 6, 9, 2],
  [15, 0, 3, 6, 8, 2],
  [16, 1, 0, 0, 10, 1],
  [17, 0, 0, 0, 16, 1],
  [18, 1, 1, 6, 15, 1],
  [19, 0, 1, 5, 21, 1],
];

// probabilidad de reserva por hora
const DEMANDA_ENTRE_SEMANA = { 7: 0.05, 8: 0.05, 9: 0.04, 10: 0.04, 11: 0.05, 12: 0.12, 13: 0.06, 14: 0.04, 15: 0.05, 16: 0.12, 17: 0.35, 18: 0.72, 19: 0.86, 20: 0.86, 21: 0.6, 22: 0.18 };
const DEMANDA_FIN_DE_SEMANA = { 8: 0.35, 9: 0.55, 10: 0.58, 11: 0.45, 12: 0.25, 13: 0.2, 14: 0.28, 15: 0.48, 16: 0.52, 17: 0.48, 18: 0.42, 19: 0.32, 20: 0.22, 21: 0.12 };

const NOMBRES_EXTRA = ['Alejandro', 'Andrés', 'Camilo', 'Carlos', 'Cristian', 'Daniel', 'David', 'Diego', 'Esteban', 'Felipe', 'Jhon', 'Jorge', 'José', 'Juan', 'Julián', 'Kevin', 'Luis', 'Manuel', 'Mateo', 'Miguel', 'Nicolás', 'Óscar', 'Pablo', 'Santiago', 'Sebastián', 'Simón', 'Steven', 'Tomás', 'Valentina', 'Laura', 'Daniela', 'María José', 'Sara', 'Juliana'];
const APELLIDOS = ['Agudelo', 'Álvarez', 'Arango', 'Betancur', 'Cano', 'Cardona', 'Castaño', 'Correa', 'Duque', 'Echeverri', 'Gallego', 'García', 'Giraldo', 'Gómez', 'González', 'Henao', 'Hoyos', 'Jaramillo', 'López', 'Londoño', 'Marín', 'Mejía', 'Montoya', 'Muñoz', 'Ochoa', 'Osorio', 'Ospina', 'Patiño', 'Posada', 'Quintero', 'Ramírez', 'Restrepo', 'Ríos', 'Rojas', 'Salazar', 'Toro', 'Uribe', 'Vélez', 'Zapata'];
const EQUIPOS_EXTRA = ['Los Amigos FC', 'Deportivo Rosales', 'La Pecosa FC', 'Rayo Antioqueño', 'Los Viernes FC', 'Unión Florida', 'Juventud 33', 'Atlético Cristo Rey', 'Equipo Ventas', 'Equipo Logística', 'Los Compadres', 'Furia Verde', 'Los Primos FC', 'Club La 80', 'Galaxia FC', 'Estudiantes UdeA', 'Los Imbatibles', 'Halcones FC'];
const TOTAL_CLIENTES = 350;
const HABITUALES = 60;

const NOTAS = ['', '', '', '', '', '', 'Piden petos', 'Cumpleaños de un integrante', 'Torneo de la empresa', 'Llegan 10 minutos antes', 'Traen balón propio'];
const MOTIVOS = ['Lluvia', 'Lluvia', 'No completaron el equipo', 'No completaron el equipo', 'Cambio de planes', 'Partido aplazado', ''];
const PREFIJOS = ['300', '301', '304', '310', '311', '312', '313', '314', '315', '316', '317', '318', '320', '321', '322'];
const DOMINIOS = ['gmail.com', 'gmail.com', 'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'];

function sinTildes(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function generarDatos(ahora = new Date(), nuevoId) {
  const azar = crearAzar();
  const hoy = hoyBogota(ahora);

  const sedes = SEDES.map((s) => ({ _id: nuevoId(), ...s, activa: true, creadaEn: new Date(ahora.getTime() - 400 * 24 * HORA) }));

  const canchas = CANCHAS.map(([i, nombre, superficie, techada, valle, pico]) => ({
    _id: nuevoId(),
    sedeId: sedes[i]._id,
    nombre,
    superficie,
    techada,
    tarifas: { valle, pico },
    activa: true,
    creadaEn: sedes[i].creadaEn,
  }));
  const canchasDeSede = (i) => canchas.filter((c) => c.sedeId === sedes[i]._id);

  const lista = [...CLIENTES];
  const usados = new Set(lista.map(([n]) => n));
  let equipoExtra = 0;
  while (lista.length < TOTAL_CLIENTES) {
    const nombre = `${azar.elegir(NOMBRES_EXTRA)} ${azar.elegir(APELLIDOS)} ${azar.elegir(APELLIDOS)}`;
    if (usados.has(nombre)) continue;
    usados.add(nombre);
    const equipo = azar() < 0.15 && equipoExtra < EQUIPOS_EXTRA.length ? EQUIPOS_EXTRA[equipoExtra++] : '';
    lista.push([nombre, equipo]);
  }
  const documentos = new Set();
  const clientes = lista.map(([nombre, equipo], i) => {
    const partes = sinTildes(nombre).toLowerCase().split(' ');
    const usuario = `${partes[0]}.${partes[partes.length - 2]}${i + 1}`;
    const largo = azar() < 0.7;
    let documento;
    do {
      documento = largo ? String(1000000000 + azar.entero(17000000, 52999999)) : String(azar.entero(70000000, 98999999));
    } while (documentos.has(documento));
    documentos.add(documento);
    const tel = `${azar.elegir(PREFIJOS)} ${azar.entero(100, 999)} ${String(azar.entero(0, 9999)).padStart(4, '0')}`;
    return {
      _id: nuevoId(),
      nombre,
      documento,
      email: `${usuario}@${azar.elegir(DOMINIOS)}`,
      telefono: tel,
      ciudad: azar.ponderado([['Medellín', 7], ['Envigado', 2], ['Itagüí', 1], ['Sabaneta', 1], ['Bello', 1]]),
      equipo,
      fechaRegistro: new Date(ahora.getTime() - (DIAS_ATRAS + 30 + azar.entero(0, 300) - i) * 24 * HORA),
    };
  });

  const ocupado = new Set();
  const pendientes = new Map();
  const borradores = [];

  // devuelve false si se cruza con otra reserva
  function crear({ cancha, cliente, fecha, horaInicio, duracionHoras, fijo }) {
    const sede = sedes.find((s) => s._id === cancha.sedeId);
    const horaFin = horaInicio + duracionHoras;
    if (horaInicio < sede.horario.apertura || horaFin > sede.horario.cierre) return false;
    const franjas = R.calcularFranjas(horaInicio, duracionHoras);
    const claves = franjas.flatMap((h) => [`${cancha._id}|${fecha}|${h}`, `${cliente._id}|${fecha}|${h}`]);
    if (claves.some((c) => ocupado.has(c))) return false;

    const inicio = momentoInicio(fecha, horaInicio);
    const fin = momentoInicio(fecha, horaFin);
    const detalle = R.calcularDetalle(fecha, horaInicio, duracionHoras, cancha.tarifas);
    const total = R.calcularTotal(detalle);
    const abono = Math.round(total / 2 / 1000) * 1000;
    let creadaEn = new Date(Math.min(inicio.getTime() - (fijo ? azar.entero(3, 7) * 24 : azar.entero(3, 120)) * HORA, ahora.getTime() - azar.entero(10, 600) * 60000));
    // evitar reservas creadas de madrugada
    const horaLocal = (creadaEn.getUTCHours() + 19) % 24;
    if (horaLocal < 7 || horaLocal >= 23) creadaEn = new Date(creadaEn.getTime() - (((horaLocal + 24 - 20) % 24) * HORA));
    const pagoOnline = () => azar.ponderado([['nequi', 5], ['daviplata', 2], ['transferencia', 3]]);
    const pagoPresencial = () => azar.ponderado([['efectivo', 6], ['tarjeta', 3], ['nequi', 2]]);
    const fechaPago = (t) => new Date(Math.min(Math.max(t, creadaEn.getTime() + 60000), ahora.getTime() - 60000));
    const abonoEn = () => fechaPago(creadaEn.getTime() + azar.entero(5, 50) * 60000);
    const llegadaEn = () => fechaPago(inicio.getTime() - azar.entero(2, 25) * 60000);

    let estado;
    let pagos = [];
    let cancelacion;
    const r = azar();
    const cancelar = r < (fijo ? 0.06 : 0.09);

    if (cancelar && creadaEn.getTime() < ahora.getTime() - HORA) {
      estado = 'cancelada';
      if (azar() < 0.6) pagos = [{ monto: abono, metodo: pagoOnline(), fecha: abonoEn() }];
      const horasAntes = azar.ponderado([[3, 3], [6, 2], [12, 2], [30, 3], [50, 2], [80, 1]]);
      const fechaCancel = new Date(
        Math.min(Math.max(inicio.getTime() - horasAntes * HORA, (pagos[0]?.fecha || creadaEn).getTime() + 60000), ahora.getTime() - 60000)
      );
      const anticipacion = (inicio.getTime() - fechaCancel.getTime()) / HORA;
      if (anticipacion < R.REGLAS.HORAS_MIN_CAMBIO) return false;
      const pagado = pagos.reduce((s2, p) => s2 + p.monto, 0);
      const reembolso = anticipacion >= R.REGLAS.HORAS_REEMBOLSO ? pagado : 0;
      cancelacion = { fecha: fechaCancel, motivo: azar.elegir(MOTIVOS), reembolso, retenido: pagado - reembolso };
    } else if (fin <= ahora) {
      // ya se jugó
      pagos = azar() < 0.65
        ? [{ monto: abono, metodo: pagoOnline(), fecha: abonoEn() }, { monto: total - abono, metodo: pagoPresencial(), fecha: llegadaEn() }]
        : [{ monto: total, metodo: pagoPresencial(), fecha: llegadaEn() }];
      estado = fecha < hoy ? 'completada' : 'confirmada';
    } else if (inicio <= ahora) {
      pagos = [{ monto: total, metodo: pagoPresencial(), fecha: llegadaEn() }];
      estado = 'confirmada';
    } else {
      // futuras
      const enPendiente = pendientes.get(cliente._id) || 0;
      const tipo = azar.ponderado([['pagada', 4], ['abono', 5], ['sinPago', 1]]);
      if (tipo === 'pagada' || enPendiente >= R.REGLAS.MAX_PENDIENTES_POR_CLIENTE) {
        estado = 'confirmada';
        pagos = [{ monto: total, metodo: pagoOnline(), fecha: abonoEn() }];
      } else {
        estado = 'pendiente';
        if (tipo === 'abono') pagos = [{ monto: abono, metodo: pagoOnline(), fecha: abonoEn() }];
        pendientes.set(cliente._id, enPendiente + 1);
      }
    }

    const activa = estado !== 'cancelada';
    if (activa) claves.forEach((c) => ocupado.add(c));
    const reserva = {
      _id: nuevoId(),
      canchaId: cancha._id,
      clienteId: cliente._id,
      sedeId: cancha.sedeId,
      fecha,
      horaInicio,
      horaFin,
      duracionHoras,
      franjas,
      detalle,
      total,
      estado,
      activa,
      pagos: pagos.map((p) => ({ _id: nuevoId(), ...p })),
      notas: azar.elegir(NOTAS),
      creadaEn,
    };
    if (cancelacion) reserva.cancelacion = cancelacion;
    borradores.push(reserva);
    return true;
  }

  const dias = [];
  for (let d = -DIAS_ATRAS; d <= DIAS_ADELANTE; d++) dias.push(sumarDias(hoy, d));

  // equipos fijos
  for (const fecha of dias) {
    const dia = R.diaSemana(fecha);
    for (const [ci, si, k, d, hora, dur] of FIJOS) {
      if (d !== dia || azar() < 0.1) continue;
      crear({ cancha: canchasDeSede(si)[k], cliente: clientes[ci], fecha, horaInicio: hora, duracionHoras: dur, fijo: true });
    }
  }

  // reservas ocasionales
  const ocasionales = clientes.slice(FIJOS.length);
  dias.forEach((fecha, idx) => {
    const finDeSemana = R.esFinDeSemana(fecha);
    const crecimiento = 0.85 + 0.25 * (idx / dias.length);
    const diasAdelante = idx - DIAS_ATRAS;
    const factorFuturo = diasAdelante <= 0 ? 1 : Math.max(0.08, 1 - diasAdelante / 14);
    const tabla = finDeSemana ? DEMANDA_FIN_DE_SEMANA : DEMANDA_ENTRE_SEMANA;
    for (const cancha of canchas) {
      for (let h = 0; h < 24; h++) {
        const probabilidad = (tabla[h] || 0) * crecimiento * factorFuturo;
        if (azar() >= probabilidad) continue;
        const tipoCliente = azar.ponderado([['fijo', 12], ['habitual', 30], ['ocasional', 58]]);
        const cliente =
          tipoCliente === 'fijo' ? azar.elegir(clientes.slice(0, FIJOS.length))
            : tipoCliente === 'habitual' ? azar.elegir(ocasionales.slice(0, HABITUALES))
              : azar.elegir(ocasionales.slice(HABITUALES));
        const duracionHoras = azar() < 0.18 ? 2 : 1;
        if (crear({ cancha, cliente, fecha, horaInicio: h, duracionHoras, fijo: false }) && duracionHoras === 2) h++;
      }
    }
  });

  // códigos en orden de creación
  borradores.sort((a, b) => a.creadaEn - b.creadaEn);
  borradores.forEach((r, i) => {
    r.codigo = R.formatoCodigo(i + 1);
  });
  const reservas = borradores.map(({ _id, codigo, ...resto }) => ({ _id, codigo, ...resto }));

  return { sedes, canchas, clientes, reservas, contador: reservas.length };
}

module.exports = { generarDatos, crearAzar };

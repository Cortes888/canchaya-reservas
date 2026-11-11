// Interfaz: todas las acciones llaman a la API con fetch
'use strict';

// Utilidades
const $ = (selector, contexto = document) => contexto.querySelector(selector);
const $$ = (selector, contexto = document) => [...contexto.querySelectorAll(selector)];

const estado = { config: null, sedes: [], sedesPorId: new Map(), reservas: new Map(), canchas: new Map(), clientes: new Map() };

async function api(ruta, { metodo = 'GET', datos } = {}) {
  const opciones = { method: metodo, headers: {} };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, opciones);
  } catch {
    throw new Error('No hay conexión con el servidor.');
  }
  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) throw new Error((cuerpo && cuerpo.error) || `Error ${respuesta.status}`);
  return cuerpo;
}

// escapar HTML
const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const formatoDinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const dinero = (n) => formatoDinero.format(n || 0);
const numero = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
const hora = (h) => `${String(h).padStart(2, '0')}:00`;
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');

const NOMBRE_ESTADO = { pendiente: 'Pendiente de pago', confirmada: 'Pagada', completada: 'Jugada', cancelada: 'Cancelada' };
const NOMBRE_METODO = { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const DIAS = ['', 'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function fechaLarga(texto) {
  if (!texto) return '';
  const [a, m, d] = texto.split('-').map(Number);
  return capitalizar(new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }));
}

function fechaCorta(texto) {
  if (!texto) return '';
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function nombreMes(texto) {
  const [a, m] = texto.split('-').map(Number);
  return capitalizar(new Date(a, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));
}

function horasParaInicio(r) {
  const inicio = new Date(`${r.fecha}T${String(r.horaInicio).padStart(2, '0')}:00:00-05:00`);
  return (inicio.getTime() - Date.now()) / 3600000;
}

const quien = (cliente) => (cliente.equipo ? cliente.equipo : cliente.nombre);

// formulario de filtros -> query string
function parametros(form) {
  const p = new URLSearchParams();
  for (const [clave, valor] of new FormData(form)) {
    if (String(valor).trim() !== '') p.append(clave, String(valor).trim());
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

let temporizadorToast;
function aviso(mensaje, tipo = 'ok') {
  const t = $('#toast');
  t.textContent = mensaje;
  t.className = `visible ${tipo === 'error' ? 'error' : ''}`;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (t.className = ''), 3800);
}

function tabla(columnas, filas, textoVacio = 'No hay registros.') {
  if (!filas.length) return `<div class="vacio">${esc(textoVacio)}</div>`;
  const cabecera = columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.titulo)}</th>`).join('');
  const cuerpo = filas
    .map((f) => `<tr>${columnas.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html(f)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>`;
}

const badge = (est) => `<span class="badge ${esc(est)}">${esc(NOMBRE_ESTADO[est] || est)}</span>`;
const etiqueta = (texto, clase) => `<span class="badge ${clase}">${esc(texto)}</span>`;

function opciones(lista, valorActual, { valor = (x) => x, texto = (x) => x, vacio = null } = {}) {
  const inicial = vacio !== null ? `<option value="">${esc(vacio)}</option>` : '';
  return (
    inicial +
    lista
      .map((x) => {
        const v = String(valor(x));
        return `<option value="${esc(v)}" ${v === String(valorActual ?? '') ? 'selected' : ''}>${esc(texto(x))}</option>`;
      })
      .join('')
  );
}

// ignora respuestas viejas si se hizo otra petición después
const turnos = {};
function nuevoTurno(clave) {
  turnos[clave] = (turnos[clave] || 0) + 1;
  const turno = turnos[clave];
  return () => turnos[clave] === turno;
}

const cargando = (contenedor) => (contenedor.innerHTML = '<div class="vacio">Cargando…</div>');
const mostrarError = (contenedor, err) => (contenedor.innerHTML = `<div class="vacio error-carga">${esc(err.message)}</div>`);

// Modal genérico
let alEnviar = null;

function abrirModal({ titulo, html, textoBoton = 'Guardar', enviar, soloLectura = false, acciones = [] }) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-cuerpo').innerHTML = html;
  $('#modal-error').textContent = '';
  const boton = $('#modal-enviar');
  boton.textContent = textoBoton;
  boton.hidden = soloLectura;
  boton.disabled = false;
  const contenedor = $('#modal-acciones');
  contenedor.innerHTML = '';
  acciones.forEach(({ texto, clase = '', alHacerClic }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${clase}`;
    b.textContent = texto;
    b.addEventListener('click', alHacerClic);
    contenedor.appendChild(b);
  });
  alEnviar = enviar || null;
  if (!$('#modal').open) $('#modal').showModal();
  return $('#modal-cuerpo');
}

function cerrarModal() {
  if ($('#modal').open) $('#modal').close();
  alEnviar = null;
}

function datosModal() {
  const datos = {};
  for (const campo of $$('#modal-cuerpo [name]')) {
    if (campo.type === 'checkbox') datos[campo.name] = campo.checked;
    else datos[campo.name] = campo.value.trim();
  }
  return datos;
}

$('#modal-form').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!alEnviar) return cerrarModal();
  const boton = $('#modal-enviar');
  boton.disabled = true;
  $('#modal-error').textContent = '';
  const envio = alEnviar;
  try {
    const mensaje = await envio(datosModal());
    // si se abrió otro modal no se cierra
    if (alEnviar === envio) cerrarModal();
    if (mensaje) aviso(mensaje);
  } catch (err) {
    $('#modal-error').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});
$('#modal-cuerpo').addEventListener('input', () => ($('#modal-error').textContent = ''));
$('#modal-cuerpo').addEventListener('click', (e) => {
  if (e.target.closest('.hora')) $('#modal-error').textContent = '';
});
$('#modal-cerrar').addEventListener('click', cerrarModal);
$('#modal-cancelar').addEventListener('click', cerrarModal);

// Navegación
const cargadores = {
  agenda: () => cargarAgenda(),
  reservas: () => cargarReservas(),
  clientes: () => cargarClientes(),
  canchas: () => cargarCanchas(),
  sedes: () => cargarSedes(),
  panel: () => cargarPanel(),
};
let vistaActual = 'agenda';

function irA(vista) {
  vistaActual = vista;
  $$('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${vista}`));
  cargadores[vista]();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => irA(t.dataset.vista)));

const refrescar = () => cargadores[vistaActual]();

function conectarFiltros(idForm, cargar, alLimpiar) {
  const form = $(idForm);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cargar();
  });
  form.addEventListener('reset', () =>
    setTimeout(() => {
      if (alLimpiar) alLimpiar();
      cargar();
    })
  );
}

// Listas compartidas
async function cargarListasBase() {
  estado.config = await api('/config');
  await refrescarSedes();
  const { HORA_INICIO_PICO } = estado.config.reglas;
  $('#nota-tarifas').textContent =
    `Tarifa pico: lunes a viernes desde las ${hora(HORA_INICIO_PICO)}, y todo el día sábados y domingos. El resto del tiempo aplica tarifa valle.`;
}

async function refrescarSedes() {
  estado.sedes = await api('/sedes');
  estado.sedesPorId = new Map(estado.sedes.map((s) => [s._id, s]));
  $$('.sel-sedes').forEach((sel) => {
    const actual = sel.value;
    const vacio = sel.dataset.todas ?? null;
    const lista = vacio === null ? estado.sedes.filter((s) => s.activa) : estado.sedes;
    sel.innerHTML = opciones(lista, actual, { valor: (s) => s._id, texto: (s) => s.nombre, vacio });
  });
}

// Agenda
const formAgenda = $('#filtros-agenda');

async function cargarAgenda() {
  const vigente = nuevoTurno('agenda');
  const contenedor = $('#agenda');
  if (!formAgenda.fecha.value) formAgenda.fecha.value = hoy();
  if (!formAgenda.sedeId.value) {
    contenedor.innerHTML = '<div class="vacio">Registre una sede activa para ver la agenda.</div>';
    $('#agenda-resumen').textContent = '';
    return;
  }
  cargando(contenedor);
  try {
    const datos = await api(`/agenda${parametros(formAgenda)}`);
    if (!vigente()) return;
    pintarAgenda(datos);
  } catch (err) {
    if (vigente()) mostrarError(contenedor, err);
  }
}

function pintarAgenda({ fecha, canchas, horas, reservas }) {
  const contenedor = $('#agenda');
  const activas = canchas.filter((c) => c.activa);
  const ocupadas = reservas.reduce((s, r) => s + r.duracionHoras, 0);
  const sinPagar = reservas.filter((r) => r.estado === 'pendiente').length;
  const capacidad = activas.length * horas.length;
  $('#agenda-resumen').textContent =
    `${fechaLarga(fecha)} · ${ocupadas} de ${capacidad} horas reservadas` +
    (capacidad ? ` (${Math.round((ocupadas / capacidad) * 100)}%)` : '') +
    ` · ${reservas.length} reservas · ${sinPagar} pendientes de pago`;

  if (!canchas.length) {
    contenedor.innerHTML = '<div class="vacio">Esta sede todavía no tiene canchas.</div>';
    return;
  }

  const ahora = Date.now();
  const empezo = (h) => new Date(`${fecha}T${String(h).padStart(2, '0')}:00:00-05:00`).getTime() <= ahora;
  const fila = (h) => horas.findIndex((x) => x.hora === h) + 2;
  const celdas = [];

  celdas.push('<div class="ag-esquina" style="grid-row:1;grid-column:1"></div>');
  canchas.forEach((c, i) => {
    celdas.push(`<div class="ag-cancha ${c.activa ? '' : 'inactiva'}" style="grid-row:1;grid-column:${i + 2}">
      <strong>${esc(c.nombre)}</strong>
      <small>${c.techada ? 'Techada · ' : ''}${dinero(c.tarifas.valle)} / ${dinero(c.tarifas.pico)}</small>
      ${c.activa ? '' : '<small class="tag-inactiva">Desactivada</small>'}
    </div>`);
  });

  const ocupado = new Set();
  reservas.forEach((r) => {
    const col = canchas.findIndex((c) => c._id === r.canchaId) + 2;
    for (let h = r.horaInicio; h < r.horaFin; h++) ocupado.add(`${h}|${col}`);
    const pago =
      r.estado === 'pendiente'
        ? r.pagado > 0 ? `Abono ${dinero(r.pagado)}` : 'Sin pago'
        : NOMBRE_ESTADO[r.estado];
    const contenido =
      r.duracionHoras === 1
        ? `<strong>${esc(quien(r.cliente))}</strong>
           <small>${esc(r.codigo)} · <span class="ag-pago">${esc(pago)}</span></small>`
        : `<strong>${esc(quien(r.cliente))}</strong>
           ${r.cliente.equipo ? `<small>${esc(r.cliente.nombre)}</small>` : ''}
           <small>${esc(r.codigo)} · ${hora(r.horaInicio)}–${hora(r.horaFin)}</small>
           <span class="ag-pago">${esc(pago)}</span>`;
    celdas.push(`<button type="button" class="ag-reserva ${esc(r.estado)}" data-id="${esc(r._id)}"
        style="grid-row:${fila(r.horaInicio)} / span ${r.duracionHoras};grid-column:${col}"
        title="${esc(`${r.codigo} · ${r.cliente.nombre} · ${r.cliente.telefono} · ${hora(r.horaInicio)}–${hora(r.horaFin)}`)}">
      ${contenido}
    </button>`);
  });

  horas.forEach(({ hora: h, tarifa }) => {
    const f = fila(h);
    const actual = fecha === hoy() && empezo(h) && !empezo(h + 1);
    celdas.push(`<div class="ag-hora ${tarifa} ${actual ? 'actual' : ''}" style="grid-row:${f};grid-column:1">
      ${hora(h)}<small>${tarifa}</small></div>`);
    canchas.forEach((c, i) => {
      const col = i + 2;
      if (ocupado.has(`${h}|${col}`)) return;
      const clase = `ag-celda ${tarifa}`;
      if (!c.activa || empezo(h)) {
        celdas.push(`<div class="${clase} cerrada" style="grid-row:${f};grid-column:${col}"></div>`);
      } else {
        celdas.push(`<button type="button" class="${clase} libre" data-cancha="${esc(c._id)}" data-hora="${h}"
          style="grid-row:${f};grid-column:${col}" aria-label="Reservar ${esc(c.nombre)} a las ${hora(h)}">
          <span>+ Reservar</span></button>`);
      }
    });
  });

  contenedor.innerHTML = `<div class="agenda" style="grid-template-columns:76px repeat(${canchas.length}, minmax(150px, 1fr));grid-template-rows:56px repeat(${horas.length}, 56px)">${celdas.join('')}</div>`;

  // bajar hasta la hora actual o la primera reserva
  const ahoraH = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const primera = reservas.length ? Math.min(...reservas.map((r) => r.horaInicio)) : horas[0].hora;
  const objetivo = fecha === hoy() ? ahoraH - 1 : primera;
  const indice = Math.max(0, horas.findIndex((x) => x.hora >= objetivo));
  contenedor.scrollTop = indice * 56;
}

$('#agenda').addEventListener('click', async (e) => {
  const libre = e.target.closest('.ag-celda.libre');
  if (libre) {
    abrirNuevaReserva({
      sedeId: formAgenda.sedeId.value,
      canchaId: libre.dataset.cancha,
      fecha: formAgenda.fecha.value,
      horaInicio: Number(libre.dataset.hora),
    });
    return;
  }
  const bloque = e.target.closest('.ag-reserva');
  if (bloque) {
    try {
      modalDetalle(await api(`/reservas/${bloque.dataset.id}`));
    } catch (err) {
      aviso(err.message, 'error');
    }
  }
});

formAgenda.addEventListener('change', cargarAgenda);
formAgenda.addEventListener('submit', (e) => {
  e.preventDefault();
  cargarAgenda();
});
$$('[data-dias]', formAgenda).forEach((b) =>
  b.addEventListener('click', () => {
    formAgenda.fecha.value = sumarDias(formAgenda.fecha.value || hoy(), Number(b.dataset.dias));
    cargarAgenda();
  })
);
$('#agenda-hoy').addEventListener('click', () => {
  formAgenda.fecha.value = hoy();
  cargarAgenda();
});

// Reservas
async function cargarReservas() {
  const vigente = nuevoTurno('reservas');
  const contenedor = $('#tabla-reservas');
  cargando(contenedor);
  const form = $('#filtros-reservas');
  const clienteId = form.clienteId.value;
  const avisoCliente = $('#aviso-cliente');
  if (clienteId) {
    const nombre = estado.clientes.get(clienteId)?.nombre || 'el cliente seleccionado';
    avisoCliente.innerHTML = `Mostrando todas las reservas de <strong>${esc(nombre)}</strong> <button class="btn mini" id="quitar-cliente" type="button">Ver todas</button>`;
    avisoCliente.hidden = false;
  } else {
    avisoCliente.hidden = true;
  }
  try {
    const reservas = await api(`/reservas${parametros(form)}`);
    if (!vigente()) return;
    estado.reservas = new Map(reservas.map((r) => [r._id, r]));
    contenedor.innerHTML = tabla(
      [
        { titulo: 'Código', html: (r) => `<strong>${esc(r.codigo)}</strong>` },
        { titulo: 'Fecha', html: (r) => `${esc(fechaCorta(r.fecha))}<small>${hora(r.horaInicio)} – ${hora(r.horaFin)}</small>` },
        { titulo: 'Cancha', html: (r) => `${esc(r.cancha.nombre)}<small>${esc(r.sede.nombre)}</small>` },
        { titulo: 'Cliente', html: (r) => `${esc(r.cliente.nombre)}<small>${esc(r.cliente.equipo || `CC ${r.cliente.documento}`)}</small>` },
        { titulo: 'Total', num: true, html: (r) => `${dinero(r.total)}<small>Pagado ${dinero(r.pagado)}</small>` },
        { titulo: 'Estado', html: (r) => badge(r.estado) },
        { titulo: 'Acciones', html: accionesReserva },
      ],
      reservas,
      'No hay reservas con esos filtros.'
    );
  } catch (err) {
    if (vigente()) mostrarError(contenedor, err);
  }
}

function accionesReserva(r) {
  const b = (accion, texto, clase = '') =>
    `<button class="btn mini ${clase}" data-accion="${accion}" data-id="${esc(r._id)}">${texto}</button>`;
  const botones = [b('detalle', 'Ver')];
  if (r.estado === 'pendiente') botones.push(b('pagar', 'Pagar'));
  if (r.estado === 'pendiente' || r.estado === 'confirmada') {
    botones.push(b('reprogramar', 'Reprogramar'), b('cancelar', 'Cancelar', 'peligro'));
  }
  if (r.estado === 'confirmada') botones.push(b('completar', 'Completar'));
  if (r.estado === 'pendiente' && r.pagado === 0) botones.push(b('eliminar', 'Eliminar', 'peligro'));
  return `<div class="acciones">${botones.join('')}</div>`;
}

$('#aviso-cliente').addEventListener('click', (e) => {
  if (e.target.id === 'quitar-cliente') {
    const form = $('#filtros-reservas');
    form.clienteId.value = '';
    form.desde.value = hoy();
    form.orden.value = 'asc';
    cargarReservas();
  }
});

conectarFiltros('#filtros-reservas', cargarReservas, () => {
  const form = $('#filtros-reservas');
  form.clienteId.value = '';
  form.desde.value = hoy();
});

$('#tabla-reservas').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const r = estado.reservas.get(boton.dataset.id);
  if (r) ejecutarAccion(boton.dataset.accion, r);
});

function ejecutarAccion(accion, r) {
  const acciones = {
    detalle: () => modalDetalle(r),
    pagar: () => modalPago(r),
    reprogramar: () => modalReprogramar(r),
    cancelar: () => modalCancelar(r),
    completar: () =>
      confirmarYEjecutar(`¿Marcar como jugada la reserva ${r.codigo}?`, `/reservas/${r._id}/completar`, 'POST', 'Reserva marcada como jugada.'),
    eliminar: () =>
      confirmarYEjecutar(`¿Eliminar definitivamente la reserva ${r.codigo}?`, `/reservas/${r._id}`, 'DELETE', 'Reserva eliminada.'),
  };
  acciones[accion]();
}

async function confirmarYEjecutar(pregunta, ruta, metodo, mensaje, recargar = refrescar) {
  if (!confirm(pregunta)) return;
  try {
    await api(ruta, { metodo, datos: metodo === 'POST' ? {} : undefined });
    cerrarModal();
    aviso(mensaje);
    recargar();
  } catch (err) {
    aviso(err.message, 'error');
  }
}

function modalDetalle(r) {
  const detalle = r.detalle
    .map((d) => `<li>${hora(d.hora)} · tarifa ${esc(d.tarifa)} · ${dinero(d.valor)}</li>`)
    .join('');
  const pagos = r.pagos.length
    ? `<ul class="lista-pagos">${r.pagos
        .map((p) => `<li>${dinero(p.monto)} · ${esc(NOMBRE_METODO[p.metodo] || p.metodo)} · ${esc(new Date(p.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }))}</li>`)
        .join('')}</ul>`
    : '<p class="nota">Sin pagos registrados.</p>';
  let cancelacion = '';
  if (r.cancelacion) {
    const c = r.cancelacion;
    cancelacion = `<div class="completo caja-cancelacion"><strong>Cancelada</strong> el ${esc(new Date(c.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }))}
      · Motivo: ${esc(c.motivo || 'sin motivo')}<br>
      Reembolso: ${dinero(c.reembolso)}${c.retenido ? ` · Abono retenido: ${dinero(c.retenido)}` : ''}</div>`;
  }
  const acciones = [];
  const accion = (texto, nombre, clase) => acciones.push({ texto, clase, alHacerClic: () => ejecutarAccion(nombre, r) });
  if (r.estado === 'pendiente') accion('Registrar pago', 'pagar', 'primario');
  if (r.estado === 'pendiente' || r.estado === 'confirmada') {
    accion('Reprogramar', 'reprogramar');
    accion('Cancelar reserva', 'cancelar', 'peligro');
  }
  if (r.estado === 'confirmada') accion('Marcar jugada', 'completar');

  abrirModal({
    titulo: `Reserva ${r.codigo}`,
    soloLectura: true,
    acciones,
    html: `
      <div><strong>${esc(quien(r.cliente))}</strong><br>${r.cliente.equipo ? `${esc(r.cliente.nombre)}<br>` : ''}<small>CC ${esc(r.cliente.documento)} · ${esc(r.cliente.telefono)}</small></div>
      <div><strong>${esc(r.cancha.nombre)}</strong>${r.cancha.techada ? ' (techada)' : ''}<br><small>${esc(r.sede.nombre)} · ${esc(r.sede.barrio || '')}</small></div>
      <div><strong>${esc(fechaLarga(r.fecha))}</strong><br><small>${hora(r.horaInicio)} – ${hora(r.horaFin)} (${r.duracionHoras} h)</small></div>
      <div>${badge(r.estado)}<br><small>Total ${dinero(r.total)} · Pagado ${dinero(r.pagado)}${r.estado === 'cancelada' ? '' : ` · Saldo ${dinero(r.saldo)}`}</small></div>
      <div><strong>Precio por hora</strong><ul class="lista-pagos">${detalle}</ul></div>
      <div><strong>Pagos</strong>${pagos}</div>
      ${r.notas ? `<div class="completo"><strong>Notas:</strong> ${esc(r.notas)}</div>` : ''}
      ${cancelacion}`,
  });
}

function modalPago(r) {
  const metodos = opciones(estado.config.metodosPago, 'nequi', { texto: (m) => NOMBRE_METODO[m] || m });
  const abono = Math.min(r.saldo, Math.round(r.total / 2 / 1000) * 1000);
  const cuerpo = abrirModal({
    titulo: `Registrar pago · ${r.codigo}`,
    textoBoton: 'Registrar pago',
    html: `
      <p class="completo nota">${esc(quien(r.cliente))} · ${esc(r.cancha.nombre)}, ${esc(r.sede.nombre)} · ${esc(fechaCorta(r.fecha))} ${hora(r.horaInicio)}<br>
      Total ${dinero(r.total)} · Pagado ${dinero(r.pagado)} · <strong>Saldo ${dinero(r.saldo)}</strong></p>
      <label>Monto <input name="monto" type="number" min="1" step="1000" max="${r.saldo}" value="${r.saldo}" required></label>
      <label>Método <select name="metodo">${metodos}</select></label>
      <div class="completo acciones">
        ${abono < r.saldo ? `<button type="button" class="btn mini" data-monto="${abono}">Abono 50% (${dinero(abono)})</button>` : ''}
        <button type="button" class="btn mini" data-monto="${r.saldo}">Saldo completo (${dinero(r.saldo)})</button>
      </div>`,
    enviar: async (d) => {
      const monto = Number(d.monto);
      if (!Number.isInteger(monto) || monto <= 0) throw new Error('Ingrese un monto válido.');
      if (monto > r.saldo) throw new Error(`El monto no puede superar el saldo (${dinero(r.saldo)}).`);
      const res = await api(`/reservas/${r._id}/pagos`, { metodo: 'POST', datos: { monto, metodo: d.metodo } });
      refrescar();
      return res.estado === 'confirmada' ? `Pago registrado. ${r.codigo} quedó pagada.` : `Abono registrado. Saldo: ${dinero(res.saldo)}.`;
    },
  });
  $$('[data-monto]', cuerpo).forEach((b) =>
    b.addEventListener('click', () => {
      $('[name=monto]', cuerpo).value = b.dataset.monto;
    })
  );
}

function modalCancelar(r) {
  const { HORAS_REEMBOLSO } = estado.config.reglas;
  const faltan = horasParaInicio(r);
  let politica = '';
  if (r.pagado > 0) {
    politica =
      faltan >= HORAS_REEMBOLSO
        ? `Faltan más de ${HORAS_REEMBOLSO} horas: se devolverán ${dinero(r.pagado)}.`
        : `Faltan menos de ${HORAS_REEMBOLSO} horas: el abono de ${dinero(r.pagado)} <strong>no se devuelve</strong>.`;
  }
  abrirModal({
    titulo: `Cancelar reserva ${r.codigo}`,
    textoBoton: 'Cancelar reserva',
    html: `
      <p class="completo nota">${esc(quien(r.cliente))} · ${esc(r.cancha.nombre)}, ${esc(r.sede.nombre)} · ${esc(fechaCorta(r.fecha))} ${hora(r.horaInicio)}.<br>
      ${politica}</p>
      <label class="completo">Motivo
        <select name="motivo">
          <option value="">Seleccione…</option>
          <option>Lluvia</option>
          <option>No completaron el equipo</option>
          <option>Cambio de planes</option>
          <option>Partido aplazado</option>
          <option>Otro</option>
        </select>
      </label>`,
    enviar: async (d) => {
      const res = await api(`/reservas/${r._id}/cancelar`, { metodo: 'POST', datos: { motivo: d.motivo } });
      refrescar();
      const c = res.cancelacion;
      return c.retenido > 0
        ? `Reserva cancelada. Abono retenido: ${dinero(c.retenido)}.`
        : c.reembolso > 0 ? `Reserva cancelada. Devolver ${dinero(c.reembolso)} al cliente.` : 'Reserva cancelada. El horario quedó libre.';
    },
  });
}

// selector de horas (nueva reserva y reprogramar)
const HTML_SELECTOR = (duracion = 1) => `
  <label>Fecha <input name="fecha" type="date" min="${hoy()}" required></label>
  <label>Duración
    <select name="duracionHoras">${[1, 2].map((d) => `<option value="${d}" ${d === duracion ? 'selected' : ''}>${d} hora${d > 1 ? 's' : ''}</option>`).join('')}</select>
  </label>
  <div class="completo">
    <span class="nota">Hora de inicio · fondo verde = tarifa pico · tachadas = ocupadas</span>
    <div class="horas" id="horas"><p class="nota">Seleccione cancha y fecha para ver las horas libres.</p></div>
    <input type="hidden" name="horaInicio">
  </div>
  <div class="completo resumen-reserva" id="resumen-reserva">Seleccione una hora disponible.</div>`;

function activarSelector(cuerpo, { canchaId, ignorar = null, inicial = null }) {
  const fecha = $('[name=fecha]', cuerpo);
  const duracion = $('[name=duracionHoras]', cuerpo);
  const contenedorHoras = $('#horas', cuerpo);
  const oculto = $('[name=horaInicio]', cuerpo);
  const resumen = $('#resumen-reserva', cuerpo);
  let disponibilidad = null;
  let pendienteInicial = inicial;

  const franja = (h) => disponibilidad.horas.find((x) => x.hora === h);
  const libreDesde = (h) => {
    for (let i = 0; i < Number(duracion.value); i++) {
      const f = franja(h + i);
      if (!f || !f.libre) return false;
    }
    return true;
  };

  function actualizarResumen() {
    if (oculto.value === '' || !disponibilidad) {
      resumen.textContent = 'Seleccione una hora disponible.';
      return;
    }
    const h = Number(oculto.value);
    const d = Number(duracion.value);
    const partes = Array.from({ length: d }, (_, i) => franja(h + i));
    const total = partes.reduce((s, p) => s + p.valor, 0);
    const desglose = partes.map((p) => `${hora(p.hora)} ${p.tarifa} ${dinero(p.valor)}`).join(' + ');
    resumen.innerHTML = `${hora(h)} a ${hora(h + d)} · Total <strong>${dinero(total)}</strong><small>${esc(desglose)} · Abono sugerido ${dinero(Math.round(total / 2 / 1000) * 1000)}</small>`;
  }

  function pintar() {
    if (!disponibilidad) return actualizarResumen();
    if (!disponibilidad.horas.length) {
      contenedorHoras.innerHTML = '<p class="nota">La sede no tiene horario configurado.</p>';
      return actualizarResumen();
    }
    contenedorHoras.innerHTML = disponibilidad.horas
      .map((h) => {
        const elegida = oculto.value !== '' && Number(oculto.value) === h.hora;
        const motivo = h.pasada ? 'Hora pasada' : h.ocupada ? 'Ocupada' : 'No alcanza para la duración';
        const libre = libreDesde(h.hora);
        return `<button type="button" class="hora ${h.tarifa} ${elegida ? 'elegida' : ''}" data-hora="${h.hora}" ${libre ? `title="Tarifa ${h.tarifa}: ${dinero(h.valor)}"` : `disabled title="${motivo}"`}>${hora(h.hora)}</button>`;
      })
      .join('');
    actualizarResumen();
  }

  async function cargar() {
    oculto.value = '';
    disponibilidad = null;
    actualizarResumen();
    const id = canchaId();
    if (!id || !fecha.value) {
      contenedorHoras.innerHTML = '<p class="nota">Seleccione cancha y fecha para ver las horas libres.</p>';
      return;
    }
    contenedorHoras.innerHTML = '<p class="nota">Consultando disponibilidad…</p>';
    try {
      disponibilidad = await api(`/canchas/${id}/disponibilidad?fecha=${encodeURIComponent(fecha.value)}`);
    } catch (err) {
      contenedorHoras.innerHTML = `<p class="nota error-carga">${esc(err.message)}</p>`;
      return;
    }
    // al reprogramar, las horas de la misma reserva cuentan como libres
    if (ignorar && ignorar.fecha === fecha.value) {
      disponibilidad.horas.forEach((h) => {
        if (ignorar.franjas.includes(h.hora) && !h.pasada) {
          h.libre = true;
          h.ocupada = false;
        }
      });
    }
    if (pendienteInicial !== null && libreDesde(pendienteInicial)) oculto.value = String(pendienteInicial);
    pendienteInicial = null;
    pintar();
  }

  contenedorHoras.addEventListener('click', (e) => {
    const b = e.target.closest('.hora');
    if (!b || b.disabled) return;
    oculto.value = b.dataset.hora;
    pintar();
  });
  duracion.addEventListener('change', () => {
    if (disponibilidad && oculto.value !== '' && !libreDesde(Number(oculto.value))) oculto.value = '';
    pintar();
  });
  fecha.addEventListener('change', cargar);
  return { cargar };
}

function leerHorario(d) {
  if (!d.fecha) throw new Error('Seleccione la fecha.');
  if (d.horaInicio === '') throw new Error('Seleccione una hora de inicio disponible.');
  return { fecha: d.fecha, horaInicio: Number(d.horaInicio), duracionHoras: Number(d.duracionHoras) };
}

async function abrirNuevaReserva(prefill = {}) {
  let clientes;
  let canchas;
  try {
    [clientes, canchas] = await Promise.all([api('/clientes'), api('/canchas?activa=true')]);
  } catch (err) {
    return aviso(err.message, 'error');
  }
  const sedesConCanchas = estado.sedes.filter((s) => s.activa && canchas.some((c) => c.sedeId === s._id));
  if (!sedesConCanchas.length) return aviso('No hay sedes activas con canchas activas.', 'error');
  const sedeInicial = prefill.sedeId && sedesConCanchas.some((s) => s._id === prefill.sedeId) ? prefill.sedeId : '';
  const textoCliente = (c) => `${c.nombre}${c.equipo ? ` · ${c.equipo}` : ''} · CC ${c.documento}`;

  const cuerpo = abrirModal({
    titulo: 'Nueva reserva',
    textoBoton: 'Crear reserva',
    html: `
      <div class="completo fila-cliente">
        <label>Cliente
          <input type="search" id="buscar-cliente" placeholder="Buscar por nombre, equipo o documento">
        </label>
        <button type="button" class="btn" id="cliente-nuevo">+ Cliente nuevo</button>
      </div>
      <label class="completo"><select name="clienteId" required>${opciones(clientes, prefill.clienteId, { valor: (c) => c._id, texto: textoCliente, vacio: `Seleccione… (${clientes.length} clientes)` })}</select></label>
      <label>Sede <select id="sel-sede">${opciones(sedesConCanchas, sedeInicial, { valor: (s) => s._id, texto: (s) => s.nombre, vacio: 'Seleccione…' })}</select></label>
      <label>Cancha <select name="canchaId" required><option value="">Seleccione sede…</option></select></label>
      ${HTML_SELECTOR(prefill.duracionHoras || 1)}
      <label class="completo">Notas <input name="notas" maxlength="200" placeholder="Opcional: petos, cumpleaños, torneo…"></label>`,
    enviar: async (d) => {
      if (!d.clienteId) throw new Error('Seleccione el cliente.');
      if (!d.canchaId) throw new Error('Seleccione la cancha.');
      const nueva = await api('/reservas', {
        metodo: 'POST',
        datos: { clienteId: d.clienteId, canchaId: d.canchaId, notas: d.notas, ...leerHorario(d) },
      });
      refrescar();
      return `Reserva ${nueva.codigo} creada por ${dinero(nueva.total)}. Queda pendiente de pago.`;
    },
  });

  const selCliente = $('[name=clienteId]', cuerpo);
  $('#buscar-cliente', cuerpo).addEventListener('input', (e) => {
    const t = e.target.value.trim().toLowerCase();
    const lista = clientes.filter((c) => textoCliente(c).toLowerCase().includes(t));
    const actual = selCliente.value;
    selCliente.innerHTML = opciones(lista, actual, { valor: (c) => c._id, texto: textoCliente, vacio: `Seleccione… (${lista.length} coinciden)` });
    if (lista.length === 1) selCliente.value = lista[0]._id;
  });

  const selSede = $('#sel-sede', cuerpo);
  const selCancha = $('[name=canchaId]', cuerpo);
  const fecha = $('[name=fecha]', cuerpo);
  if (prefill.fecha && prefill.fecha >= hoy()) fecha.value = prefill.fecha;
  const selector = activarSelector(cuerpo, { canchaId: () => selCancha.value, inicial: prefill.horaInicio ?? null });

  const llenarCanchas = (canchaElegida = '') => {
    const lista = canchas.filter((c) => c.sedeId === selSede.value);
    selCancha.innerHTML = opciones(lista, canchaElegida, {
      valor: (c) => c._id,
      texto: (c) => `${c.nombre}${c.techada ? ' (techada)' : ''} · ${dinero(c.tarifas.valle)} / ${dinero(c.tarifas.pico)}`,
      vacio: lista.length ? 'Seleccione…' : 'Sin canchas',
    });
  };
  selSede.addEventListener('change', () => {
    llenarCanchas();
    selector.cargar();
  });
  selCancha.addEventListener('change', () => selector.cargar());
  if (sedeInicial) {
    llenarCanchas(prefill.canchaId);
    selector.cargar();
  }

  $('#cliente-nuevo', cuerpo).addEventListener('click', () => {
    const borrador = {
      sedeId: selSede.value,
      canchaId: selCancha.value,
      fecha: fecha.value,
      horaInicio: $('[name=horaInicio]', cuerpo).value === '' ? prefill.horaInicio ?? null : Number($('[name=horaInicio]', cuerpo).value),
      duracionHoras: Number($('[name=duracionHoras]', cuerpo).value),
    };
    modalCliente(null, (nuevo) => abrirNuevaReserva({ ...borrador, clienteId: nuevo._id }));
  });
}

$('#btn-nueva-reserva').addEventListener('click', () => abrirNuevaReserva());

function modalReprogramar(r) {
  const cuerpo = abrirModal({
    titulo: `Reprogramar ${r.codigo}`,
    textoBoton: 'Guardar cambios',
    html: `
      <p class="completo nota">${esc(quien(r.cliente))} · ${esc(r.cancha.nombre)} (${esc(r.sede.nombre)}).
      Actual: ${esc(fechaCorta(r.fecha))} ${hora(r.horaInicio)}–${hora(r.horaFin)} por ${dinero(r.total)}. El precio se recalcula con la tarifa del nuevo horario.</p>
      ${HTML_SELECTOR(r.duracionHoras)}
      <label class="completo">Notas <input name="notas" maxlength="200" value="${esc(r.notas || '')}"></label>`,
    enviar: async (d) => {
      const res = await api(`/reservas/${r._id}`, { metodo: 'PUT', datos: { notas: d.notas, ...leerHorario(d) } });
      refrescar();
      return `Reserva ${r.codigo} reprogramada. Nuevo total: ${dinero(res.total)}.`;
    },
  });
  $('[name=fecha]', cuerpo).value = r.fecha >= hoy() ? r.fecha : hoy();
  activarSelector(cuerpo, {
    canchaId: () => r.canchaId,
    ignorar: { fecha: r.fecha, franjas: Array.from({ length: r.duracionHoras }, (_, i) => r.horaInicio + i) },
    inicial: r.horaInicio,
  }).cargar();
}

// Clientes
async function cargarClientes() {
  const vigente = nuevoTurno('clientes');
  const contenedor = $('#tabla-clientes');
  cargando(contenedor);
  try {
    const clientes = await api(`/clientes${parametros($('#filtros-clientes'))}`);
    if (!vigente()) return;
    clientes.forEach((c) => estado.clientes.set(c._id, c));
    contenedor.innerHTML = tabla(
      [
        { titulo: 'Cliente', html: (c) => `${esc(c.nombre)}<small>CC ${esc(c.documento)}</small>` },
        { titulo: 'Equipo', html: (c) => (c.equipo ? esc(c.equipo) : '<span class="tenue">—</span>') },
        { titulo: 'Contacto', html: (c) => `${esc(c.telefono)}<small>${esc(c.email)}</small>` },
        { titulo: 'Ciudad', html: (c) => esc(c.ciudad || '—') },
        { titulo: 'Reservas', num: true, html: (c) => numero(c.totalReservas) },
        {
          titulo: 'Acciones',
          html: (c) => `<div class="acciones">
            <button class="btn mini" data-accion="reservar" data-id="${esc(c._id)}">Reservar</button>
            <button class="btn mini" data-accion="reservas" data-id="${esc(c._id)}">Historial</button>
            <button class="btn mini" data-accion="editar" data-id="${esc(c._id)}">Editar</button>
            <button class="btn mini peligro" data-accion="eliminar" data-id="${esc(c._id)}">Eliminar</button></div>`,
        },
      ],
      clientes,
      'No hay clientes con esa búsqueda.'
    );
  } catch (err) {
    if (vigente()) mostrarError(contenedor, err);
  }
}

conectarFiltros('#filtros-clientes', cargarClientes);

function modalCliente(c = null, alGuardar = null) {
  abrirModal({
    titulo: c ? 'Editar cliente' : 'Nuevo cliente',
    textoBoton: alGuardar ? 'Guardar y seguir con la reserva' : 'Guardar',
    html: `
      <label class="completo">Nombre completo <input name="nombre" required maxlength="80" value="${esc(c?.nombre)}"></label>
      <label>Documento (CC) <input name="documento" required inputmode="numeric" maxlength="15" value="${esc(c?.documento)}"></label>
      <label>Celular <input name="telefono" required maxlength="15" placeholder="300 123 4567" value="${esc(c?.telefono)}"></label>
      <label>Email <input name="email" type="email" required maxlength="120" value="${esc(c?.email)}"></label>
      <label>Ciudad <input name="ciudad" maxlength="60" value="${esc(c?.ciudad ?? 'Medellín')}"></label>
      <label class="completo">Equipo <input name="equipo" maxlength="60" placeholder="Opcional: nombre del equipo con el que juega" value="${esc(c?.equipo)}"></label>`,
    enviar: async (d) => {
      const guardado = c
        ? await api(`/clientes/${c._id}`, { metodo: 'PUT', datos: d })
        : await api('/clientes', { metodo: 'POST', datos: d });
      estado.clientes.set(guardado._id, guardado);
      if (alGuardar) {
        await alGuardar(guardado);
        aviso('Cliente registrado. Ahora complete la reserva.');
        return null;
      }
      refrescar();
      return c ? 'Cliente actualizado.' : 'Cliente registrado.';
    },
  });
}

$('#btn-nuevo-cliente').addEventListener('click', () => modalCliente());
$('#tabla-clientes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const c = estado.clientes.get(b.dataset.id);
  if (!c) return;
  if (b.dataset.accion === 'editar') modalCliente(c);
  else if (b.dataset.accion === 'reservar') abrirNuevaReserva({ clienteId: c._id });
  else if (b.dataset.accion === 'reservas') {
    const form = $('#filtros-reservas');
    $$('input, select', form).forEach((campo) => (campo.value = ''));
    form.orden.value = 'desc';
    form.clienteId.value = c._id;
    irA('reservas');
  } else {
    confirmarYEjecutar(`¿Eliminar al cliente "${c.nombre}"?`, `/clientes/${c._id}`, 'DELETE', 'Cliente eliminado.', cargarClientes);
  }
});

// Canchas
async function cargarCanchas() {
  const vigente = nuevoTurno('canchas');
  const contenedor = $('#tabla-canchas');
  cargando(contenedor);
  try {
    const canchas = await api(`/canchas${parametros($('#filtros-canchas'))}`);
    if (!vigente()) return;
    estado.canchas = new Map(canchas.map((c) => [c._id, c]));
    contenedor.innerHTML = tabla(
      [
        { titulo: 'Cancha', html: (c) => `${esc(c.nombre)}<small>${esc(c.superficie || '')}${c.techada ? ' · Techada' : ' · Al aire libre'}</small>` },
        { titulo: 'Sede', html: (c) => `${esc(c.sedeNombre)}<small>${esc(c.barrio || '')}</small>` },
        { titulo: 'Tarifa valle', num: true, html: (c) => dinero(c.tarifas.valle) },
        { titulo: 'Tarifa pico', num: true, html: (c) => dinero(c.tarifas.pico) },
        { titulo: 'Estado', html: (c) => (c.activa ? etiqueta('Activa', 'confirmada') : etiqueta('Desactivada', 'inactiva')) },
        {
          titulo: 'Acciones',
          html: (c) => `<div class="acciones">
            <button class="btn mini" data-accion="editar" data-id="${esc(c._id)}">Editar</button>
            <button class="btn mini peligro" data-accion="eliminar" data-id="${esc(c._id)}">Eliminar</button></div>`,
        },
      ],
      canchas,
      'No hay canchas con esos filtros.'
    );
  } catch (err) {
    if (vigente()) mostrarError(contenedor, err);
  }
}

conectarFiltros('#filtros-canchas', cargarCanchas);

function modalCancha(c = null) {
  if (!estado.sedes.length) return aviso('Primero registre una sede.', 'error');
  abrirModal({
    titulo: c ? 'Editar cancha' : 'Nueva cancha de fútbol 5',
    html: `
      <label>Sede <select name="sedeId" required>${opciones(estado.sedes, c?.sedeId, { valor: (s) => s._id, texto: (s) => s.nombre, vacio: 'Seleccione…' })}</select></label>
      <label>Nombre <input name="nombre" required maxlength="60" placeholder="Cancha 5" value="${esc(c?.nombre)}"></label>
      <label>Superficie <select name="superficie">${opciones(estado.config.superficies, c?.superficie)}</select></label>
      <span></span>
      <label>Tarifa valle (COP/hora) <input name="tarifaValle" type="number" min="10000" step="5000" required value="${esc(c?.tarifas.valle ?? 90000)}"></label>
      <label>Tarifa pico (COP/hora) <input name="tarifaPico" type="number" min="10000" step="5000" required value="${esc(c?.tarifas.pico ?? 130000)}"></label>
      <label class="check"><input type="checkbox" name="techada" ${c?.techada ? 'checked' : ''}> Techada</label>
      <label class="check"><input type="checkbox" name="activa" ${!c || c.activa ? 'checked' : ''}> Activa (recibe reservas)</label>`,
    enviar: async (d) => {
      if (!d.sedeId) throw new Error('Seleccione la sede.');
      const datos = { ...d, tarifaValle: Number(d.tarifaValle), tarifaPico: Number(d.tarifaPico) };
      if (datos.tarifaPico < datos.tarifaValle) throw new Error('La tarifa pico no puede ser menor que la valle.');
      if (c) await api(`/canchas/${c._id}`, { metodo: 'PUT', datos });
      else await api('/canchas', { metodo: 'POST', datos });
      cargarCanchas();
      return c ? 'Cancha actualizada.' : 'Cancha creada.';
    },
  });
}

$('#btn-nueva-cancha').addEventListener('click', () => modalCancha());
$('#tabla-canchas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const c = estado.canchas.get(b.dataset.id);
  if (!c) return;
  if (b.dataset.accion === 'editar') modalCancha(c);
  else confirmarYEjecutar(`¿Eliminar ${c.nombre} de ${c.sedeNombre}?`, `/canchas/${c._id}`, 'DELETE', 'Cancha eliminada.', cargarCanchas);
});

// Sedes
async function cargarSedes() {
  const vigente = nuevoTurno('sedes');
  const contenedor = $('#tabla-sedes');
  cargando(contenedor);
  try {
    const sedes = await api(`/sedes${parametros($('#filtros-sedes'))}`);
    if (!vigente()) return;
    sedes.forEach((s) => estado.sedesPorId.set(s._id, s));
    contenedor.innerHTML = tabla(
      [
        { titulo: 'Sede', html: (s) => `${esc(s.nombre)}<small>${esc(s.direccion)}</small>` },
        { titulo: 'Barrio', html: (s) => `${esc(s.barrio || '—')}<small>${esc(s.ciudad)}</small>` },
        { titulo: 'Horario', html: (s) => `${hora(s.horario.apertura)} – ${hora(s.horario.cierre)}` },
        { titulo: 'Teléfono', html: (s) => esc(s.telefono || '—') },
        { titulo: 'Canchas', num: true, html: (s) => numero(s.totalCanchas) },
        { titulo: 'Estado', html: (s) => (s.activa ? etiqueta('Activa', 'confirmada') : etiqueta('Desactivada', 'inactiva')) },
        {
          titulo: 'Acciones',
          html: (s) => `<div class="acciones">
            <button class="btn mini" data-accion="agenda" data-id="${esc(s._id)}">Agenda</button>
            <button class="btn mini" data-accion="editar" data-id="${esc(s._id)}">Editar</button>
            <button class="btn mini peligro" data-accion="eliminar" data-id="${esc(s._id)}">Eliminar</button></div>`,
        },
      ],
      sedes,
      'No hay sedes con esos filtros.'
    );
  } catch (err) {
    if (vigente()) mostrarError(contenedor, err);
  }
}

conectarFiltros('#filtros-sedes', cargarSedes);

function modalSede(s = null) {
  const horasAbre = Array.from({ length: 24 }, (_, i) => i);
  const horasCierra = Array.from({ length: 24 }, (_, i) => i + 1);
  abrirModal({
    titulo: s ? 'Editar sede' : 'Nueva sede',
    html: `
      <label>Nombre <input name="nombre" required maxlength="80" placeholder="Sede Robledo" value="${esc(s?.nombre)}"></label>
      <label>Teléfono <input name="telefono" maxlength="20" value="${esc(s?.telefono)}"></label>
      <label class="completo">Dirección <input name="direccion" required maxlength="120" value="${esc(s?.direccion)}"></label>
      <label>Barrio <input name="barrio" maxlength="60" value="${esc(s?.barrio)}"></label>
      <label>Ciudad <input name="ciudad" required maxlength="60" value="${esc(s?.ciudad ?? 'Medellín')}"></label>
      <label>Apertura <select name="apertura">${opciones(horasAbre, s?.horario.apertura ?? 7, { texto: hora })}</select></label>
      <label>Cierre <select name="cierre">${opciones(horasCierra, s?.horario.cierre ?? 23, { texto: hora })}</select></label>
      <label class="check completo"><input type="checkbox" name="activa" ${!s || s.activa ? 'checked' : ''}> Activa (sus canchas reciben reservas)</label>`,
    enviar: async (d) => {
      const datos = { ...d, apertura: Number(d.apertura), cierre: Number(d.cierre) };
      if (datos.cierre <= datos.apertura) throw new Error('La hora de cierre debe ser mayor que la de apertura.');
      if (s) await api(`/sedes/${s._id}`, { metodo: 'PUT', datos });
      else await api('/sedes', { metodo: 'POST', datos });
      await refrescarSedes();
      cargarSedes();
      return s ? 'Sede actualizada.' : 'Sede creada.';
    },
  });
}

$('#btn-nueva-sede').addEventListener('click', () => modalSede());
$('#tabla-sedes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const s = estado.sedesPorId.get(b.dataset.id);
  if (!s) return;
  if (b.dataset.accion === 'editar') modalSede(s);
  else if (b.dataset.accion === 'agenda') {
    if (!s.activa) return aviso('La sede está desactivada.', 'error');
    formAgenda.sedeId.value = s._id;
    irA('agenda');
  } else {
    confirmarYEjecutar(`¿Eliminar la sede "${s.nombre}"?`, `/sedes/${s._id}`, 'DELETE', 'Sede eliminada.', async () => {
      await refrescarSedes();
      cargarSedes();
    });
  }
});

// Reportes
async function cargarPanel() {
  const vigente = nuevoTurno('panel');
  const q = parametros($('#filtros-panel'));
  const ids = ['#kpis', '#rep-ocupacion', '#rep-horas', '#rep-dias', '#rep-canchas', '#rep-clientes', '#rep-ingresos'];
  ids.forEach((id) => cargando($(id)));
  try {
    const [resumen, ocupacion, horas, dias, canchas, clientes, ingresos] = await Promise.all([
      api(`/reportes/resumen${q}`),
      api(`/reportes/ocupacion${q}`),
      api(`/reportes/horas-pico${q}`),
      api(`/reportes/dias-semana${q}`),
      api(`/reportes/canchas-top${q}`),
      api(`/reportes/clientes-frecuentes${q}`),
      api(`/reportes/ingresos-sede-mes${q}`),
    ]);
    if (!vigente()) return;
    pintarKpis(resumen);

    $('#nota-ocupacion').textContent = `Horas vendidas sobre horas disponibles, del ${fechaCorta(ocupacion.desde)} al ${fechaCorta(ocupacion.hasta)}${q ? '' : ' (últimos 30 días)'}.`;
    const medidor = (p) => `<div class="medidor"><div class="pista"><div class="relleno" style="width:${Math.min(p, 100)}%"></div></div><span>${p}%</span></div>`;
    $('#rep-ocupacion').innerHTML = tabla(
      [
        { titulo: 'Sede', html: (o) => `${esc(o.sede)}<small>${o.canchas} canchas</small>` },
        { titulo: 'Ocupación general', html: (o) => medidor(o.ocupacion) },
        { titulo: 'En horario pico', html: (o) => medidor(o.ocupacionPico) },
        { titulo: 'En horario valle', html: (o) => medidor(o.ocupacionValle) },
        { titulo: 'Horas vendidas', num: true, html: (o) => `${numero(o.horasVendidas)}<small>de ${numero(o.horasDisponibles)}</small>` },
      ],
      ocupacion.sedes,
      'Sin datos en el período.'
    );

    $('#rep-horas').innerHTML = barras(horas, (h) => hora(h.hora), (h) => h.reservas, (h) => `${numero(h.reservas)} h`);
    const ordenDias = [2, 3, 4, 5, 6, 7, 1];
    const diasOrdenados = ordenDias.map((d) => dias.find((x) => x.dia === d)).filter(Boolean);
    $('#rep-dias').innerHTML = barras(diasOrdenados, (d) => DIAS[d.dia], (d) => d.reservas, (d) => numero(d.reservas), (d) => `${d.horas} h · ${dinero(d.recaudado)}`);

    $('#rep-canchas').innerHTML = tabla(
      [
        { titulo: 'Cancha', html: (c) => `${esc(c.cancha)}<small>${esc(c.sede)}</small>` },
        { titulo: 'Reservas', num: true, html: (c) => numero(c.reservas) },
        { titulo: 'Horas', num: true, html: (c) => numero(c.horas) },
        { titulo: 'Recaudado', num: true, html: (c) => dinero(c.recaudado) },
      ],
      canchas,
      'Sin reservas en el período.'
    );
    $('#rep-clientes').innerHTML = tabla(
      [
        { titulo: 'Cliente', html: (c) => `${esc(c.equipo || c.nombre)}<small>${esc(c.equipo ? c.nombre : `CC ${c.documento || ''}`)}</small>` },
        { titulo: 'Reservas', num: true, html: (c) => numero(c.reservas) },
        { titulo: 'Gastado', num: true, html: (c) => dinero(c.gastado) },
        { titulo: 'Última', html: (c) => esc(fechaCorta(c.ultimaReserva)) },
      ],
      clientes,
      'Sin reservas en el período.'
    );
    $('#rep-ingresos').innerHTML = tabla(
      [
        { titulo: 'Mes', html: (r) => esc(nombreMes(r.mes)) },
        { titulo: 'Sede', html: (r) => esc(r.sede) },
        { titulo: 'Pagos', num: true, html: (r) => numero(r.pagos) },
        { titulo: 'Ingresos', num: true, html: (r) => dinero(r.ingresos) },
      ],
      ingresos,
      'Sin pagos en el período.'
    );
  } catch (err) {
    if (vigente()) ids.forEach((id) => mostrarError($(id), err));
  }
}

conectarFiltros('#filtros-panel', cargarPanel);

function pintarKpis(r) {
  const tarjetas = [
    ['Reservas', numero(r.totalReservas), `${numero(r.canceladas)} canceladas`],
    ['Ingresos', dinero(r.ingresos), `Incluye ${dinero(r.abonosRetenidos)} retenidos`],
    ['Por cobrar', dinero(r.porCobrar), `${numero(r.pendientes)} reservas pendientes`],
    ['Horas vendidas', numero(r.horasVendidas), 'Sin contar canceladas'],
    ['Valor promedio', dinero(r.valorPromedio), 'Por reserva'],
    ['Tasa de cancelación', `${r.tasaCancelacion}%`, 'Del total de reservas'],
  ];
  $('#kpis').innerHTML = tarjetas
    .map(([t, v, s]) => `<div class="kpi"><span>${esc(t)}</span><strong>${esc(v)}</strong><small>${esc(s)}</small></div>`)
    .join('');
}

function barras(datos, etiquetaFn, valor, textoValor, subtitulo = null) {
  if (!datos.length) return '<div class="vacio">Sin datos en el período.</div>';
  const maximo = Math.max(...datos.map(valor), 1);
  return datos
    .map((d) => {
      const ancho = Math.round((valor(d) / maximo) * 100);
      const titulo = subtitulo ? ` title="${esc(subtitulo(d))}"` : '';
      return `<div class="barra"${titulo}><span>${esc(etiquetaFn(d))}</span><div class="pista"><div class="relleno" style="width:${ancho}%"></div></div><span class="valor">${esc(textoValor(d))}</span></div>`;
    })
    .join('');
}

// Inicio
(async function iniciar() {
  $('#hoy-texto').textContent = fechaLarga(hoy());
  $('#filtros-reservas').desde.value = hoy();
  formAgenda.fecha.value = hoy();
  try {
    await cargarListasBase();
  } catch (err) {
    aviso(`No se pudo conectar con la API: ${err.message}`, 'error');
    return;
  }
  cargarAgenda();
})();

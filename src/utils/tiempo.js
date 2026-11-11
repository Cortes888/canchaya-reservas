// Fechas en hora de Colombia (UTC-5)

const ZONA = 'America/Bogota';
const OFFSET = '-05:00';

// AAAA-MM-DD y que la fecha exista
function esFechaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function momentoInicio(fecha, hora) {
  const hh = String(hora).padStart(2, '0');
  return new Date(`${fecha}T${hh}:00:00${OFFSET}`);
}

function hoyBogota(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

function horasEntre(desde, hasta) {
  return (hasta.getTime() - desde.getTime()) / 3600000;
}

module.exports = { ZONA, OFFSET, esFechaValida, momentoInicio, hoyBogota, sumarDias, horasEntre };

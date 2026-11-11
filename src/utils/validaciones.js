// Validaciones de datos de entrada
const { ObjectId } = require('mongodb');
const { errorValidacion } = require('./errores');
const { esFechaValida } = require('./tiempo');

function aObjectId(valor, campo = 'id') {
  if (typeof valor !== 'string' || !ObjectId.isValid(valor) || valor.length !== 24) {
    throw errorValidacion(`El campo ${campo} no es un identificador válido.`);
  }
  return new ObjectId(valor);
}

function texto(valor, campo, { min = 1, max = 100, requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw errorValidacion(`El campo ${campo} es obligatorio.`);
    return '';
  }
  if (typeof valor !== 'string') throw errorValidacion(`El campo ${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (requerido && limpio.length < min) {
    throw errorValidacion(`El campo ${campo} debe tener al menos ${min} caracteres.`);
  }
  if (limpio.length > max) {
    throw errorValidacion(`El campo ${campo} no puede superar ${max} caracteres.`);
  }
  return limpio;
}

function numero(valor, campo, { min = -Infinity, max = Infinity, entero = false } = {}) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw errorValidacion(`El campo ${campo} debe ser un número.`);
  }
  if (entero && !Number.isInteger(n)) {
    throw errorValidacion(`El campo ${campo} debe ser un número entero.`);
  }
  if (n < min || n > max) {
    throw errorValidacion(`El campo ${campo} debe estar entre ${min} y ${max}.`);
  }
  return n;
}

function email(valor) {
  const limpio = texto(valor, 'email', { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw errorValidacion('El email no tiene un formato válido.');
  }
  return limpio;
}

function fecha(valor, campo = 'fecha') {
  if (!esFechaValida(valor)) throw errorValidacion(`El campo ${campo} debe tener formato AAAA-MM-DD.`);
  return valor;
}

function opcion(valor, campo, opciones) {
  if (!opciones.includes(valor)) {
    throw errorValidacion(`El campo ${campo} debe ser uno de: ${opciones.join(', ')}.`);
  }
  return valor;
}

function booleano(valor, campo) {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  throw errorValidacion(`El campo ${campo} debe ser verdadero o falso.`);
}

// escapar el texto antes de usarlo en $regex
function escaparRegex(valor) {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contiene(valor) {
  return { $regex: escaparRegex(String(valor).trim()), $options: 'i' };
}

module.exports = { aObjectId, texto, numero, email, fecha, opcion, booleano, escaparRegex, contiene };

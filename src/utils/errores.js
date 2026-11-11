// error con código HTTP
class ErrorApp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const errorValidacion = (mensaje) => new ErrorApp(400, mensaje);
const errorNoEncontrado = (mensaje) => new ErrorApp(404, mensaje);
const errorConflicto = (mensaje) => new ErrorApp(409, mensaje);

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// error 11000 = registro duplicado
function mensajeDuplicado(err) {
  const campos = Object.keys(err.keyValue || err.keyPattern || {});
  if (campos.includes('franjas')) {
    return 'La cancha ya tiene una reserva en ese horario.';
  }
  if (campos.length) {
    return `Ya existe un registro con el mismo valor en: ${campos.join(', ')}.`;
  }
  return 'Registro duplicado.';
}

// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ error: mensajeDuplicado(err) });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = {
  ErrorApp,
  errorValidacion,
  errorNoEncontrado,
  errorConflicto,
  asyncHandler,
  manejarErrores,
  mensajeDuplicado,
};

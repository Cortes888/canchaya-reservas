// Rutas de clientes
const express = require('express');
const { coleccion } = require('../db');
const { asyncHandler, errorNoEncontrado, errorConflicto, errorValidacion } = require('../utils/errores');
const v = require('../utils/validaciones');

const router = express.Router();

function leerCliente(body) {
  const documento = v.texto(body.documento, 'documento', { min: 5, max: 15 });
  if (!/^\d+$/.test(documento)) throw errorValidacion('El documento debe contener solo números.');
  const telefono = v.texto(body.telefono, 'teléfono', { min: 7, max: 15 });
  if (!/^[0-9+\s-]+$/.test(telefono)) throw errorValidacion('El teléfono solo puede tener números, +, - y espacios.');
  return {
    nombre: v.texto(body.nombre, 'nombre', { min: 3, max: 80 }),
    documento,
    email: v.email(body.email),
    telefono,
    ciudad: v.texto(body.ciudad, 'ciudad', { requerido: false, max: 60 }),
    equipo: v.texto(body.equipo, 'equipo', { requerido: false, max: 60 }),
  };
}

// GET /api/clientes?buscar=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filtro = {};
    if (req.query.buscar) {
      const patron = v.contiene(req.query.buscar);
      filtro.$or = [{ nombre: patron }, { documento: patron }, { email: patron }, { equipo: patron }, { telefono: patron }];
    }
    if (req.query.ciudad) filtro.ciudad = v.contiene(req.query.ciudad);

    const clientes = await coleccion('clientes')
      .aggregate([
        { $match: filtro },
        {
          $lookup: {
            from: 'reservas',
            localField: '_id',
            foreignField: 'clienteId',
            as: 'reservas',
          },
        },
        { $addFields: { totalReservas: { $size: '$reservas' } } },
        { $project: { reservas: 0 } },
        { $sort: { nombre: 1 } },
        { $limit: 2000 },
      ])
      .toArray();
    res.json(clientes);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cliente = await coleccion('clientes').findOne({ _id: v.aObjectId(req.params.id) });
    if (!cliente) throw errorNoEncontrado('Cliente no encontrado.');
    res.json(cliente);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const cliente = { ...leerCliente(req.body), fechaRegistro: new Date() };
    const { insertedId } = await coleccion('clientes').insertOne(cliente);
    res.status(201).json({ _id: insertedId, ...cliente });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const { matchedCount } = await coleccion('clientes').updateOne(
      { _id },
      { $set: { ...leerCliente(req.body), actualizadoEn: new Date() } }
    );
    if (!matchedCount) throw errorNoEncontrado('Cliente no encontrado.');
    res.json(await coleccion('clientes').findOne({ _id }));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const _id = v.aObjectId(req.params.id);
    const reservas = await coleccion('reservas').countDocuments({ clienteId: _id });
    if (reservas > 0) {
      throw errorConflicto(`El cliente tiene ${reservas} reserva(s) registradas; no se puede eliminar.`);
    }
    const { deletedCount } = await coleccion('clientes').deleteOne({ _id });
    if (!deletedCount) throw errorNoEncontrado('Cliente no encontrado.');
    res.json({ mensaje: 'Cliente eliminado.' });
  })
);

module.exports = router;

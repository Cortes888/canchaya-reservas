# CanchaYa - Reservas de canchas de fútbol 5

Proyecto final de Bases de Datos II - Universidad Católica Luis Amigó.

Integrantes: Santiago Cortes, Samuel Silva y Juan David Ospina.

Aplicación web para administrar las reservas de un negocio de canchas de fútbol 5 con sedes en Medellín y Envigado: agenda por sede, clientes, pagos, cancelaciones y reportes. La base de datos está en MongoDB Atlas.

## Tecnologías

- Node.js y Express (API)
- MongoDB Atlas con el driver oficial de MongoDB
- HTML, CSS y JavaScript para la interfaz
- Render para el despliegue

## Cómo ejecutarlo

Se necesita Node.js 18 o superior y una base de datos en MongoDB Atlas.

1. Instalar dependencias:

   ```
   npm install
   ```

2. Crear un archivo `.env` en la raíz con la conexión a Atlas:

   ```
   MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/
   DB_NAME=reservas_canchas
   PORT=3000
   ```

3. Cargar los datos de prueba (borra los datos que haya en esas colecciones):

   ```
   npm run seed
   ```

4. Iniciar el servidor y abrir http://localhost:3000

   ```
   npm start
   ```

Para correr las pruebas: `npm test`

## Despliegue en Render

- Build command: `npm install`
- Start command: `npm start`
- Variables de entorno: `MONGODB_URI` y `DB_NAME`

En Atlas, Network Access debe permitir conexiones desde cualquier IP (`0.0.0.0/0`) para que Render se pueda conectar.

## Estructura

```
src/
  server.js        inicio del servidor
  app.js           rutas de Express
  db.js            conexión, validadores e índices
  reglas/          reglas de negocio
  consultas/       pipelines de los reportes
  routes/          sedes, canchas, clientes, reservas, agenda, reportes
  utils/           validaciones, errores y fechas
public/            interfaz
scripts/           carga de datos de prueba
test/              pruebas
```

## Colecciones

- `sedes`: datos de la sede y su horario.
- `canchas`: referencia a la sede, tarifas valle y pico.
- `clientes`: datos de contacto y equipo.
- `reservas`: referencia a cancha, cliente y sede; guarda el detalle de precios, los pagos y la cancelación dentro del mismo documento.
- `contadores`: consecutivo para el código de las reservas.

## API

| Método | Ruta |
|---|---|
| GET | `/api/salud` |
| GET | `/api/agenda?fecha=&sedeId=` |
| GET, POST | `/api/sedes` |
| GET, PUT, DELETE | `/api/sedes/:id` |
| GET, POST | `/api/canchas` |
| GET, PUT, DELETE | `/api/canchas/:id` |
| GET | `/api/canchas/:id/disponibilidad?fecha=` |
| GET, POST | `/api/clientes` |
| GET, PUT, DELETE | `/api/clientes/:id` |
| GET, POST | `/api/reservas` |
| GET, PUT, DELETE | `/api/reservas/:id` |
| POST | `/api/reservas/:id/pagos` |
| POST | `/api/reservas/:id/cancelar` |
| POST | `/api/reservas/:id/completar` |
| GET | `/api/reportes/resumen`, `ocupacion`, `horas-pico`, `dias-semana`, `canchas-top`, `clientes-frecuentes`, `ingresos-sede-mes` |

La documentación técnica completa está en el documento entregado con el proyecto.

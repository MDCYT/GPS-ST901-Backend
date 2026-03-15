# GPS Tracking API (SinoTrack ST901)

Base URL: `http://<host>:<PORT>`

Esta API corre en el mismo puerto para:
- HTTP REST (web/app)
- TCP GPS (tracker ST901)

## Autenticacion

Usa JWT por header:

`Authorization: Bearer <token>`

## Flujo ST901 de comandos de motor

- `POST /devices/:id/commands/engine-stop`
- `POST /devices/:id/commands/engine-resume`

Comportamiento:
- Crea comando en `device_commands` con estado `pending`.
- Si el ST901 esta conectado por TCP, el servidor lo envia inmediatamente y queda `sent`.
- Cuando llega trafico posterior del equipo, el ultimo comando `sent` puede marcarse como `acknowledged`.

Comandos por defecto (configurables en `.env`):
- Stop: `RELAY,1#`
- Resume: `RELAY,0#`

## Endpoints Publicos

### GET /devices
Lista publica para exploracion (sin `tracker_id` ni `name`).
- Excluye dispositivos privados (con password de dispositivo).

## Endpoints Auth

### POST /auth/register
Body:
```json
{
  "email": "owner@example.com",
  "password": "12345678",
  "fullName": "Owner"
}
```

### POST /auth/login
Body:
```json
{
  "email": "owner@example.com",
  "password": "12345678"
}
```
Response incluye `token`.

### GET /auth/me
Requiere JWT.

## Endpoints de Usuario (requieren JWT)

### GET /me/devices
Lista dispositivos que el usuario posee o tiene compartidos.

### GET /me/map/devices
Dataset para mapa web (ultima posicion + online por dispositivo).

### POST /me/devices/register
Registra/claim de dispositivo en cuenta.
Body:
```json
{
  "trackerId": "9175976144",
  "name": "Tracker principal",
  "vehicleName": "Camion 1",
  "devicePassword": "clave-privada-opcional"
}
```

### PUT /me/devices/:id/password
Define/actualiza contraseña del dispositivo (solo owner).
Body:
```json
{
  "password": "nueva-clave"
}
```

### GET /me/devices/:id/share
Lista usuarios con acceso al dispositivo (solo owner).

### POST /me/devices/:id/share
Comparte acceso con otro usuario (solo owner).
Body:
```json
{
  "userId": 2
}
```

### DELETE /me/devices/:id/share/:userId
Revoca acceso compartido (solo owner).

## Endpoints de Tracking por Dispositivo

Si el dispositivo es privado, solo owner/viewer autorizado puede verlo.

### GET /devices/:id/latest
Ultimo punto GPS.

### GET /devices/:id/positions?from=...&to=...
Historial de posiciones para mapa.

### GET /devices/:id/trips?from=...&to=...
Historial de viajes.

### GET /devices/:id/events
Eventos del dispositivo.

### GET /devices/:id/status
Estado agregado: dispositivo, online, ultima posicion, ultimo comando, ultimo evento.

### GET /devices/:id/commands?limit=50
Historial de comandos del dispositivo.

## Endpoints de Comandos de Motor

### POST /devices/:id/commands/engine-stop
Solo owner.

### POST /devices/:id/commands/engine-resume
Solo owner.

## Codigos HTTP comunes

- `200` OK
- `201` Creado
- `400` Error de validacion
- `401` No autenticado
- `403` Sin permisos
- `404` No encontrado
- `500` Error interno

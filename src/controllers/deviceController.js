const deviceService = require("../services/deviceService");
const { sendJson, readJsonBody } = require("../utils/http");
const commandService = require("../services/commandService");
const { dispatchPendingCommandsForTracker } = require("../tcp/commandDispatcher");

function parseDeviceId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

async function listDevices(req, res) {
  const rows = await deviceService.listPublicDevices();
  sendJson(res, 200, rows);
}

async function listMyDevices(req, res) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const rows = await deviceService.listDevicesForUser(req.authUser.id);
  sendJson(res, 200, rows);
}

async function listMyMapDevices(req, res) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const rows = await deviceService.listMapDevicesForUser(req.authUser.id);
  sendJson(res, 200, rows);
}

async function registerMyDevice(req, res) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const device = await deviceService.registerDeviceForUser(req.authUser.id, body);
    sendJson(res, 201, {
      message: "Dispositivo registrado en tu cuenta",
      device,
    });
  } catch (err) {
    const status = /requerido|privado|contraseña|permiso/i.test(err.message) ? 400 : 500;
    sendJson(res, status, { error: err.message || "Error registrando dispositivo" });
  }
}

async function setMyDevicePassword(req, res, params) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (typeof body.password !== "string") {
      sendJson(res, 400, { error: "password requerido" });
      return;
    }

    const device = await deviceService.setDevicePassword(req.authUser.id, deviceId, body.password);
    sendJson(res, 200, {
      message: body.password ? "Contraseña de dispositivo actualizada" : "Contraseña eliminada",
      deviceId: device.id,
    });
  } catch (err) {
    const status = /solo el propietario/i.test(err.message) ? 403 : 500;
    sendJson(res, status, { error: err.message || "Error actualizando contraseña" });
  }
}

async function shareMyDevice(req, res, params) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const body = await readJsonBody(req);
  const targetUserId = Number(body.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    sendJson(res, 400, { error: "userId invalido" });
    return;
  }

  try {
    const access = await deviceService.shareDeviceWithUser(req.authUser.id, deviceId, targetUserId);
    sendJson(res, 201, access);
  } catch (err) {
    const status = /solo el propietario/i.test(err.message) ? 403 : 500;
    sendJson(res, status, { error: err.message || "Error compartiendo dispositivo" });
  }
}

async function revokeMyDeviceShare(req, res, params) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const deviceId = parseDeviceId(params.id);
  const targetUserId = Number(params.userId);
  if (!deviceId || !Number.isInteger(targetUserId) || targetUserId <= 0) {
    sendJson(res, 400, { error: "parametros invalidos" });
    return;
  }

  try {
    await deviceService.revokeSharedAccess(req.authUser.id, deviceId, targetUserId);
    sendJson(res, 200, { message: "Permiso revocado" });
  } catch (err) {
    const status = /solo el propietario/i.test(err.message) ? 403 : 500;
    sendJson(res, status, { error: err.message || "Error revocando permiso" });
  }
}

async function listMyDeviceShares(req, res, params) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const isOwner = await deviceService.isUserOwner(req.authUser.id, deviceId);
  if (!isOwner) {
    sendJson(res, 403, { error: "Solo el propietario puede ver los permisos" });
    return;
  }

  const rows = await deviceService.listDeviceAccess(deviceId);
  sendJson(res, 200, rows);
}

async function ensureDeviceAccess(req, res, deviceId, requireOwnerForCommand) {
  const authUserId = req.authUser ? req.authUser.id : null;
  const access = await deviceService.canUserAccessDevice(authUserId, deviceId);

  if (!access.allowed) {
    if (access.reason === "not-found") {
      sendJson(res, 404, { error: "No encontrado" });
      return false;
    }

    if (access.reason === "private") {
      sendJson(res, 401, { error: "Dispositivo privado: requiere autenticacion" });
      return false;
    }

    sendJson(res, 403, { error: "No tienes permisos para este dispositivo" });
    return false;
  }

  if (requireOwnerForCommand) {
    if (!authUserId) {
      sendJson(res, 401, { error: "No autenticado" });
      return false;
    }

    const owner = await deviceService.isUserOwner(authUserId, deviceId);
    if (!owner) {
      sendJson(res, 403, { error: "Solo el propietario puede enviar comandos" });
      return false;
    }
  }

  return true;
}

async function getLatest(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const row = await deviceService.getLatestByDeviceId(deviceId);
  if (!row) {
    sendJson(res, 404, { error: "No encontrado" });
    return;
  }

  sendJson(res, 200, row);
}

async function getPositions(req, res, params, url) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const rows = await deviceService.getPositionsByDeviceId(deviceId, from, to);
  sendJson(res, 200, rows);
}

async function getTrips(req, res, params, url) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const rows = await deviceService.getTripsByDeviceId(deviceId, from, to);
  sendJson(res, 200, rows);
}

async function getTripPositions(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  const tripId = parseDeviceId(params.tripId);
  if (!deviceId || !tripId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const rows = await deviceService.getTripPositions(deviceId, tripId);
  if (rows === null) {
    sendJson(res, 404, { error: "Viaje no encontrado" });
    return;
  }

  sendJson(res, 200, rows);
}

async function getEvents(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const rows = await deviceService.getEventsByDeviceId(deviceId);
  sendJson(res, 200, rows);
}

async function postEngineStop(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, true);
  if (!allowed) return;

  const device = await deviceService.getDeviceById(deviceId);
  const command = await commandService.createCommand(deviceId, "engine-stop");
  const dispatch = await dispatchPendingCommandsForTracker(device.tracker_id);

  sendJson(res, 201, {
    message:
      dispatch.reason === "ok"
        ? "Comando enviado al ST901 (si estaba conectado por TCP)"
        : "Comando en cola; se enviara cuando el ST901 se conecte",
    dispatch,
    command,
  });
}

async function postEngineResume(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, true);
  if (!allowed) return;

  const device = await deviceService.getDeviceById(deviceId);
  const command = await commandService.createCommand(deviceId, "engine-resume");
  const dispatch = await dispatchPendingCommandsForTracker(device.tracker_id);

  sendJson(res, 201, {
    message:
      dispatch.reason === "ok"
        ? "Comando enviado al ST901 (si estaba conectado por TCP)"
        : "Comando en cola; se enviara cuando el ST901 se conecte",
    dispatch,
    command,
  });
}

async function getDeviceCommands(req, res, params, url) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const limit = Number(url.searchParams.get("limit") || 50);
  const rows = await commandService.listDeviceCommands(deviceId, limit);
  sendJson(res, 200, rows);
}

async function getStatus(req, res, params) {
  const deviceId = parseDeviceId(params.id);
  if (!deviceId) {
    sendJson(res, 400, { error: "id invalido" });
    return;
  }

  const allowed = await ensureDeviceAccess(req, res, deviceId, false);
  if (!allowed) return;

  const status = await deviceService.getDeviceStatusById(deviceId);
  if (!status) {
    sendJson(res, 404, { error: "No encontrado" });
    return;
  }

  sendJson(res, 200, status);
}

module.exports = {
  listDevices,
  listMyDevices,
  listMyMapDevices,
  registerMyDevice,
  setMyDevicePassword,
  shareMyDevice,
  revokeMyDeviceShare,
  listMyDeviceShares,
  getLatest,
  getPositions,
  getTrips,
  getTripPositions,
  getEvents,
  postEngineStop,
  postEngineResume,
  getDeviceCommands,
  getStatus,
};

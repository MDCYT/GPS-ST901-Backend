const { pool } = require("../config/db");

function buildSt901Payload(commandType) {
  if (commandType === "engine-stop") {
    return process.env.ST901_ENGINE_STOP_COMMAND || "RELAY,1#";
  }

  if (commandType === "engine-resume") {
    return process.env.ST901_ENGINE_RESUME_COMMAND || "RELAY,0#";
  }

  throw new Error("tipo de comando no soportado");
}

async function createCommand(deviceId, commandType) {
  const payload = buildSt901Payload(commandType);

  const [result] = await pool.execute(
    `INSERT INTO device_commands (device_id, command_type, command_payload, status)
     VALUES (?, ?, ?, 'pending')`,
    [deviceId, commandType, payload],
  );

  const [rows] = await pool.query(
    `SELECT c.id, c.device_id, c.command_type, c.command_payload, c.status, c.queued_at,
            d.tracker_id
     FROM device_commands c
     JOIN devices d ON d.id = c.device_id
     WHERE c.id = ?
     LIMIT 1`,
    [result.insertId],
  );

  return rows[0] || null;
}

async function listDeviceCommands(deviceId, limit = 50) {
  const maxLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(
    `SELECT id, device_id, command_type, command_payload, status, queued_at, sent_at, acknowledged_at, response_payload
     FROM device_commands
     WHERE device_id = ?
     ORDER BY queued_at DESC
     LIMIT ${maxLimit}`,
    [deviceId],
  );

  return rows;
}

async function getPendingCommandsByTrackerId(trackerId, limit = 20) {
  const maxLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const [rows] = await pool.query(
    `SELECT c.id, c.device_id, c.command_type, c.command_payload, c.status, c.queued_at, d.tracker_id
     FROM device_commands c
     JOIN devices d ON d.id = c.device_id
     WHERE d.tracker_id = ?
       AND c.status = 'pending'
     ORDER BY c.queued_at ASC
     LIMIT ${maxLimit}`,
    [trackerId],
  );

  return rows;
}

async function markCommandSent(commandId, detail) {
  await pool.execute(
    `UPDATE device_commands
     SET status = 'sent', sent_at = NOW(), response_payload = ?
     WHERE id = ?`,
    [detail || null, commandId],
  );
}

async function markCommandFailed(commandId, detail) {
  await pool.execute(
    `UPDATE device_commands
     SET status = 'failed', response_payload = ?
     WHERE id = ?`,
    [detail || null, commandId],
  );
}

async function markLatestSentCommandAcknowledged(trackerId, detail) {
  const [rows] = await pool.query(
    `SELECT c.id
     FROM device_commands c
     JOIN devices d ON d.id = c.device_id
     WHERE d.tracker_id = ?
       AND c.status = 'sent'
     ORDER BY c.sent_at DESC
     LIMIT 1`,
    [trackerId],
  );

  if (rows.length === 0) return null;

  const commandId = rows[0].id;
  await pool.execute(
    `UPDATE device_commands
     SET status = 'acknowledged', acknowledged_at = NOW(), response_payload = ?
     WHERE id = ?`,
    [detail || null, commandId],
  );

  return commandId;
}

module.exports = {
  createCommand,
  listDeviceCommands,
  getPendingCommandsByTrackerId,
  markCommandSent,
  markCommandFailed,
  markLatestSentCommandAcknowledged,
};

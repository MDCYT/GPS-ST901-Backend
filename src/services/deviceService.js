const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const { isTrackerOnline } = require("../tcp/connectionRegistry");

async function listPublicDevices() {
  const [rows] = await pool.query(
    `SELECT id, vehicle_name, is_active, created_at
     FROM devices
     WHERE device_password_hash IS NULL
     ORDER BY id DESC`,
  );
  return rows;
}

async function listDevicesForUser(userId) {
  const [rows] = await pool.query(
    `SELECT d.id, d.tracker_id, d.name, d.vehicle_name, d.is_active, d.created_at,
            (d.device_password_hash IS NOT NULL) AS is_private,
            uda.role AS access_role
     FROM devices d
     INNER JOIN user_device_access uda ON uda.device_id = d.id
     WHERE uda.user_id = ?
     ORDER BY d.id DESC`,
    [userId],
  );

  return rows;
}

async function getLatestByDeviceId(deviceId) {
  const [rows] = await pool.query(
    `SELECT p.*
     FROM gps_positions p
     WHERE p.device_id = ?
     ORDER BY p.packet_time DESC
     LIMIT 1`,
    [deviceId],
  );

  return rows[0] || null;
}

async function getPositionsByDeviceId(deviceId, from, to) {
  let sql = `SELECT p.packet_time, p.latitude, p.longitude, p.speed_kmh, p.course
    FROM gps_positions p
    WHERE p.device_id = ?`;
  const params = [deviceId];

  if (from) {
    sql += " AND p.packet_time >= ?";
    params.push(from);
  }

  if (to) {
    sql += " AND p.packet_time <= ?";
    params.push(to);
  }

  sql += " ORDER BY p.packet_time ASC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getTripsByDeviceId(deviceId, from, to) {
  let sql = `SELECT id, device_id, started_at, ended_at, start_latitude, start_longitude,
    end_latitude, end_longitude, distance_km, max_speed_kmh, avg_speed_kmh
    FROM trips
    WHERE device_id = ?`;
  const params = [deviceId];

  if (from) {
    sql += " AND started_at >= ?";
    params.push(from);
  }

  if (to) {
    sql += " AND (ended_at IS NULL OR ended_at <= ?)";
    params.push(to);
  }

  sql += " ORDER BY started_at DESC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getTripPositions(deviceId, tripId) {
  const [trips] = await pool.query(
    `SELECT id, started_at, ended_at FROM trips WHERE id = ? AND device_id = ? LIMIT 1`,
    [tripId, deviceId],
  );

  if (trips.length === 0) return null;

  const trip = trips[0];

  let sql = `SELECT packet_time, latitude, longitude, speed_kmh, course
    FROM gps_positions
    WHERE device_id = ? AND packet_time >= ?`;
  const params = [deviceId, trip.started_at];

  if (trip.ended_at) {
    sql += " AND packet_time <= ?";
    params.push(trip.ended_at);
  }

  sql += " ORDER BY packet_time ASC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getEventsByDeviceId(deviceId) {
  const [rows] = await pool.query(
    `SELECT id, device_id, event_type, event_time, payload
     FROM device_events
     WHERE device_id = ?
     ORDER BY event_time DESC`,
    [deviceId],
  );
  return rows;
}

async function createCommand(deviceId, commandType) {
  const payload = JSON.stringify({ action: commandType });
  const [result] = await pool.execute(
    `INSERT INTO device_commands (device_id, command_type, command_payload, status)
     VALUES (?, ?, ?, 'pending')`,
    [deviceId, commandType, payload],
  );

  const [rows] = await pool.query(
    `SELECT id, device_id, command_type, command_payload, status, queued_at
     FROM device_commands
     WHERE id = ?
     LIMIT 1`,
    [result.insertId],
  );

  return rows[0] || null;
}

async function getDeviceById(deviceId) {
  const [rows] = await pool.query(
    "SELECT * FROM devices WHERE id = ? LIMIT 1",
    [deviceId],
  );
  return rows[0] || null;
}

async function isUserOwner(userId, deviceId) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM user_device_access
     WHERE user_id = ? AND device_id = ? AND role = 'owner'
     LIMIT 1`,
    [userId, deviceId],
  );

  return rows.length > 0;
}

async function userHasAccessToDevice(userId, deviceId) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM user_device_access
     WHERE user_id = ? AND device_id = ?
     LIMIT 1`,
    [userId, deviceId],
  );

  return rows.length > 0;
}

async function canUserAccessDevice(userId, deviceId) {
  const device = await getDeviceById(deviceId);
  if (!device) {
    return { allowed: false, reason: "not-found" };
  }

  const isPrivate = Boolean(device.device_password_hash);
  if (!isPrivate) {
    return { allowed: true, device, isPrivate: false };
  }

  if (!userId) {
    return { allowed: false, reason: "private" };
  }

  const hasAccess = await userHasAccessToDevice(userId, deviceId);
  if (!hasAccess) {
    return { allowed: false, reason: "forbidden" };
  }

  return { allowed: true, device, isPrivate: true };
}

async function registerDeviceForUser(userId, payload) {
  const trackerId = String(payload.trackerId || "").trim();
  const deviceName = payload.name ? String(payload.name).trim() : null;
  const vehicleName = payload.vehicleName ? String(payload.vehicleName).trim() : null;
  const devicePassword = payload.devicePassword ? String(payload.devicePassword) : null;

  if (!trackerId) {
    throw new Error("trackerId es requerido");
  }

  const [existingRows] = await pool.query(
    "SELECT * FROM devices WHERE tracker_id = ? LIMIT 1",
    [trackerId],
  );

  if (existingRows.length === 0) {
    const passwordHash = devicePassword ? await bcrypt.hash(devicePassword, 10) : null;
    const [insertResult] = await pool.execute(
      `INSERT INTO devices (tracker_id, name, vehicle_name, device_password_hash)
       VALUES (?, ?, ?, ?)`,
      [trackerId, deviceName, vehicleName, passwordHash],
    );

    await pool.execute(
      `INSERT INTO user_device_access (user_id, device_id, role, granted_by_user_id)
       VALUES (?, ?, 'owner', NULL)`,
      [userId, insertResult.insertId],
    );

    return getDeviceById(insertResult.insertId);
  }

  const device = existingRows[0];
  const [ownerRows] = await pool.query(
    `SELECT user_id
     FROM user_device_access
     WHERE device_id = ? AND role = 'owner'
     LIMIT 1`,
    [device.id],
  );

  if (ownerRows.length === 0) {
    if (device.device_password_hash) {
      if (!devicePassword) {
        throw new Error("este dispositivo requiere contraseña");
      }
      const ok = await bcrypt.compare(devicePassword, device.device_password_hash);
      if (!ok) {
        throw new Error("contraseña del dispositivo incorrecta");
      }
    }

    await pool.execute(
      `INSERT INTO user_device_access (user_id, device_id, role, granted_by_user_id)
       VALUES (?, ?, 'owner', NULL)
       ON DUPLICATE KEY UPDATE role = 'owner'`,
      [userId, device.id],
    );

    if (!device.device_password_hash && devicePassword) {
      const passwordHash = await bcrypt.hash(devicePassword, 10);
      await pool.execute(
        "UPDATE devices SET device_password_hash = ? WHERE id = ?",
        [passwordHash, device.id],
      );
    }

    if (deviceName || vehicleName) {
      await pool.execute(
        "UPDATE devices SET name = COALESCE(?, name), vehicle_name = COALESCE(?, vehicle_name) WHERE id = ?",
        [deviceName, vehicleName, device.id],
      );
    }

    return getDeviceById(device.id);
  }

  const hasAccess = await userHasAccessToDevice(userId, device.id);
  if (!hasAccess) {
    throw new Error("dispositivo privado: solicita permiso al propietario");
  }

  if (deviceName || vehicleName) {
    await pool.execute(
      "UPDATE devices SET name = COALESCE(?, name), vehicle_name = COALESCE(?, vehicle_name) WHERE id = ?",
      [deviceName, vehicleName, device.id],
    );
  }

  return getDeviceById(device.id);
}

async function setDevicePassword(userId, deviceId, password) {
  const owner = await isUserOwner(userId, deviceId);
  if (!owner) {
    throw new Error("solo el propietario puede cambiar la contraseña del dispositivo");
  }

  const hash = password ? await bcrypt.hash(password, 10) : null;
  await pool.execute("UPDATE devices SET device_password_hash = ? WHERE id = ?", [hash, deviceId]);
  return getDeviceById(deviceId);
}

async function shareDeviceWithUser(ownerUserId, deviceId, targetUserId) {
  const owner = await isUserOwner(ownerUserId, deviceId);
  if (!owner) {
    throw new Error("solo el propietario puede compartir el dispositivo");
  }

  await pool.execute(
    `INSERT INTO user_device_access (user_id, device_id, role, granted_by_user_id)
     VALUES (?, ?, 'viewer', ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), granted_by_user_id = VALUES(granted_by_user_id)`,
    [targetUserId, deviceId, ownerUserId],
  );

  const [rows] = await pool.query(
    `SELECT uda.user_id, u.email, uda.role, uda.granted_by_user_id, uda.created_at
     FROM user_device_access uda
     JOIN users u ON u.id = uda.user_id
     WHERE uda.user_id = ? AND uda.device_id = ?
     LIMIT 1`,
    [targetUserId, deviceId],
  );

  return rows[0] || null;
}

async function revokeSharedAccess(ownerUserId, deviceId, targetUserId) {
  const owner = await isUserOwner(ownerUserId, deviceId);
  if (!owner) {
    throw new Error("solo el propietario puede revocar permisos");
  }

  await pool.execute(
    `DELETE FROM user_device_access
     WHERE device_id = ? AND user_id = ? AND role <> 'owner'`,
    [deviceId, targetUserId],
  );
}

async function listDeviceAccess(deviceId) {
  const [rows] = await pool.query(
    `SELECT uda.user_id, u.email, u.full_name, uda.role, uda.granted_by_user_id, uda.created_at
     FROM user_device_access uda
     JOIN users u ON u.id = uda.user_id
     WHERE uda.device_id = ?
     ORDER BY uda.created_at ASC`,
    [deviceId],
  );

  return rows;
}

async function getDeviceStatusById(deviceId) {
  const [deviceRows] = await pool.query(
    "SELECT id, tracker_id, name, vehicle_name, is_active FROM devices WHERE id = ? LIMIT 1",
    [deviceId],
  );

  if (deviceRows.length === 0) {
    return null;
  }

  const device = deviceRows[0];
  const latestPosition = await getLatestByDeviceId(deviceId);

  const [commandRows] = await pool.query(
    `SELECT id, command_type, status, queued_at, sent_at, acknowledged_at
     FROM device_commands
     WHERE device_id = ?
     ORDER BY queued_at DESC
     LIMIT 1`,
    [deviceId],
  );

  const [eventRows] = await pool.query(
    `SELECT id, event_type, event_time, payload
     FROM device_events
     WHERE device_id = ?
     ORDER BY event_time DESC
     LIMIT 1`,
    [deviceId],
  );

  return {
    device,
    online: isTrackerOnline(device.tracker_id),
    latestPosition,
    latestCommand: commandRows[0] || null,
    latestEvent: eventRows[0] || null,
  };
}

async function listMapDevicesForUser(userId) {
  const [rows] = await pool.query(
    `SELECT d.id, d.tracker_id, d.name, d.vehicle_name, d.is_active,
            p.packet_time, p.latitude, p.longitude, p.speed_kmh, p.course
     FROM devices d
     JOIN user_device_access uda ON uda.device_id = d.id
     LEFT JOIN gps_positions p ON p.id = (
       SELECT p2.id
       FROM gps_positions p2
       WHERE p2.device_id = d.id
       ORDER BY p2.packet_time DESC
       LIMIT 1
     )
     WHERE uda.user_id = ?
     ORDER BY d.id DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    trackerId: row.tracker_id,
    name: row.name,
    vehicleName: row.vehicle_name,
    isActive: row.is_active,
    online: isTrackerOnline(row.tracker_id),
    latestPosition: row.packet_time
      ? {
          packetTime: row.packet_time,
          latitude: row.latitude,
          longitude: row.longitude,
          speedKmh: row.speed_kmh,
          course: row.course,
        }
      : null,
  }));
}

module.exports = {
  listPublicDevices,
  listDevicesForUser,
  getLatestByDeviceId,
  getPositionsByDeviceId,
  getTripsByDeviceId,
  getTripPositions,
  getEventsByDeviceId,
  createCommand,
  getDeviceStatusById,
  getDeviceById,
  canUserAccessDevice,
  registerDeviceForUser,
  setDevicePassword,
  shareDeviceWithUser,
  revokeSharedAccess,
  listDeviceAccess,
  isUserOwner,
  listMapDevicesForUser,
};

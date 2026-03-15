const { pool } = require("../config/db");

// Estado previo de batería por trackerId (en memoria)
const batteryStateCache = new Map();

async function getOrCreateDeviceId(trackerId) {
  const [rows] = await pool.query(
    "SELECT id FROM devices WHERE tracker_id = ? LIMIT 1",
    [trackerId],
  );

  if (rows.length > 0) return rows[0].id;

  const [result] = await pool.execute(
    "INSERT INTO devices (tracker_id, name) VALUES (?, ?)",
    [trackerId, `Tracker ${trackerId}`],
  );

  return result.insertId;
}

async function savePosition(parsed) {
  const deviceId = await getOrCreateDeviceId(parsed.trackerId);

  await pool.execute(
    `INSERT INTO gps_positions
      (device_id, packet_time, valid, latitude, longitude, speed_kmh, course,
       raw_packet, status_flags, gsm_signal, battery_level, external_power_mv, voltage_mv)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deviceId,
      parsed.packetTime,
      parsed.valid ? 1 : 0,
      parsed.latitude,
      parsed.longitude,
      parsed.speedKmh,
      parsed.course,
      parsed.rawPacket,
      parsed.statusFlags ?? null,
      parsed.gsmSignal ?? null,
      parsed.batteryLevel ?? null,
      parsed.externalPowerMv ?? null,
      parsed.voltageMv ?? null,
    ],
  );

  await checkBatteryEvent(deviceId, parsed);
}

async function checkBatteryEvent(deviceId, parsed) {
  if (parsed.batteryConnected === null) return;

  const trackerId = parsed.trackerId;
  const current = parsed.batteryConnected;

  if (!batteryStateCache.has(trackerId)) {
    // Primer paquete del tracker desde que el servidor arrancó: solo guardamos el estado
    batteryStateCache.set(trackerId, current);
    return;
  }

  const previous = batteryStateCache.get(trackerId);

  if (current !== previous) {
    batteryStateCache.set(trackerId, current);

    const eventType = current ? "battery_connected" : "battery_disconnected";
    const payload = JSON.stringify({
      statusFlags: parsed.statusFlags,
      batteryLevel: parsed.batteryLevel,
      externalPowerMv: parsed.externalPowerMv,
      voltageMv: parsed.voltageMv,
    });

    await pool.execute(
      `INSERT INTO device_events (device_id, event_type, event_time, payload)
       VALUES (?, ?, ?, ?)`,
      [deviceId, eventType, parsed.packetTime, payload],
    );

    console.log(`Evento detectado: ${eventType} para tracker ${trackerId}`);
  }
}

module.exports = {
  savePosition,
};

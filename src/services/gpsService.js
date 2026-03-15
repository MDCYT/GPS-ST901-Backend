const { pool } = require("../config/db");

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
}

module.exports = {
  savePosition,
};

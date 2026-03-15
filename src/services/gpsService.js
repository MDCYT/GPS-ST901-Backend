const { pool } = require("../config/db");

// Estado previo de batería e ignición por trackerId (en memoria)
const batteryStateCache  = new Map();
const ignitionStateCache = new Map();

// --- Seguimiento de viajes ---
// Velocidad mínima para considerar que el vehículo está en movimiento
const TRIP_MIN_SPEED_KMH = 3;
// Tiempo quieto para considerar que el vehículo se estacionó (5 minutos)
const TRIP_PARK_TIMEOUT_MS = 5 * 60 * 1000;

const tripStateCache = new Map();

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function openTrip(deviceId, startedAt, lat, lon) {
  const [result] = await pool.execute(
    `INSERT INTO trips (device_id, started_at, start_latitude, start_longitude)
     VALUES (?, ?, ?, ?)`,
    [deviceId, startedAt, lat, lon],
  );
  return result.insertId;
}

async function closeTripInCache(state, deviceId, trackerId) {
  const avgSpeed =
    state.speedCount > 0
      ? Math.round((state.speedSum / state.speedCount) * 100) / 100
      : 0;

  await pool.execute(
    `UPDATE trips
     SET ended_at = ?, end_latitude = ?, end_longitude = ?,
         distance_km = ?, max_speed_kmh = ?, avg_speed_kmh = ?
     WHERE id = ?`,
    [
      state.lastMovingPacketTime,
      state.lastLat,
      state.lastLon,
      Math.round(state.distanceKm * 1000) / 1000,
      state.maxSpeedKmh,
      avgSpeed,
      state.tripId,
    ],
  );

  console.log(
    `Viaje cerrado para tracker ${trackerId} | tripId=${state.tripId} | ` +
      `inicio=${state.startedAt} | fin=${state.lastMovingPacketTime} | ` +
      `distancia=${state.distanceKm.toFixed(2)} km`,
  );

  // Resetear estado pero mantener la entrada en el cache
  state.tripId = null;
  state.startedAt = null;
  state.startLat = null;
  state.startLon = null;
  state.lastMovingAt = null;
  state.lastMovingPacketTime = null;
  state.distanceKm = 0;
  state.maxSpeedKmh = 0;
  state.speedSum = 0;
  state.speedCount = 0;
}

async function checkTripEvent(deviceId, parsed) {
  const trackerId = parsed.trackerId;
  const packetMs = new Date(parsed.packetTime).getTime();
  const speed    = parsed.speedKmh;
  const lat      = parsed.latitude;
  const lon      = parsed.longitude;
  const isMoving = speed >= TRIP_MIN_SPEED_KMH;

  // Si el GPS reporta ignición, usarla como señal principal; si no se conoce,
  // caer de vuelta a la detección por velocidad.
  const ignitionKnown = parsed.ignitionOn !== null;
  const ignitionOn    = parsed.ignitionOn === true;

  if (!tripStateCache.has(trackerId)) {
    const newState = {
      tripId: null,
      startedAt: null,
      startLat: null,
      startLon: null,
      lastLat: lat,
      lastLon: lon,
      lastMovingAt: null,
      lastMovingPacketTime: null,
      distanceKm: 0,
      maxSpeedKmh: 0,
      speedSum: 0,
      speedCount: 0,
    };

    const shouldOpen = ignitionKnown ? ignitionOn : isMoving;
    if (shouldOpen) {
      const tripId = await openTrip(deviceId, parsed.packetTime, lat, lon);
      newState.tripId = tripId;
      newState.startedAt = parsed.packetTime;
      newState.startLat = lat;
      newState.startLon = lon;
      newState.lastMovingAt = packetMs;
      newState.lastMovingPacketTime = parsed.packetTime;
      if (isMoving) {
        newState.maxSpeedKmh = speed;
        newState.speedSum = speed;
        newState.speedCount = 1;
      }
      console.log(`Viaje iniciado para tracker ${trackerId}, tripId=${tripId}`);
    }

    tripStateCache.set(trackerId, newState);
    return;
  }

  const state = tripStateCache.get(trackerId);

  // --- Apertura de viaje ---
  // Con ignición: abrir cuando pasa de OFF a ON
  // Sin ignición: abrir cuando detecta movimiento
  const shouldOpen = ignitionKnown ? (ignitionOn && !state.tripId) : (isMoving && !state.tripId);

  if (shouldOpen) {
    const tripId = await openTrip(deviceId, parsed.packetTime, lat, lon);
    state.tripId = tripId;
    state.startedAt = parsed.packetTime;
    state.startLat = lat;
    state.startLon = lon;
    state.lastLat = lat;
    state.lastLon = lon;
    state.lastMovingAt = packetMs;
    state.lastMovingPacketTime = parsed.packetTime;
    state.distanceKm = 0;
    state.maxSpeedKmh = 0;
    state.speedSum = 0;
    state.speedCount = 0;
    console.log(`Viaje iniciado para tracker ${trackerId}, tripId=${tripId}`);
  }

  // --- Acumulación de recorrido (mientras el viaje está abierto) ---
  if (state.tripId) {
    if (isMoving) {
      state.distanceKm += haversineKm(state.lastLat, state.lastLon, lat, lon);
      state.lastMovingAt = packetMs;
      state.lastMovingPacketTime = parsed.packetTime;
      state.maxSpeedKmh = Math.max(state.maxSpeedKmh, speed);
      state.speedSum += speed;
      state.speedCount += 1;
    }
    state.lastLat = lat;
    state.lastLon = lon;
  }

  // --- Cierre de viaje ---
  if (state.tripId) {
    if (ignitionKnown) {
      // Ignición apagada → cerrar inmediatamente
      if (!ignitionOn) {
        await closeTripInCache(state, deviceId, trackerId);
      }
    } else {
      // Sin ignición: cerrar por timeout de inactividad (tráfico vs estacionado)
      if (!isMoving && state.lastMovingAt !== null) {
        const idleMs = packetMs - state.lastMovingAt;
        if (idleMs >= TRIP_PARK_TIMEOUT_MS) {
          await closeTripInCache(state, deviceId, trackerId);
        }
      }
    }
  }

  if (!state.tripId) {
    state.lastLat = lat;
    state.lastLon = lon;
  }
}

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
  await checkIgnitionEvent(deviceId, parsed);
  await checkTripEvent(deviceId, parsed);
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

async function checkIgnitionEvent(deviceId, parsed) {
  if (parsed.ignitionOn === null) return;

  const trackerId = parsed.trackerId;
  const current = parsed.ignitionOn;

  if (!ignitionStateCache.has(trackerId)) {
    ignitionStateCache.set(trackerId, current);
    return;
  }

  const previous = ignitionStateCache.get(trackerId);

  if (current !== previous) {
    ignitionStateCache.set(trackerId, current);

    const eventType = current ? "ignition_on" : "ignition_off";
    const payload = JSON.stringify({
      statusFlags: parsed.statusFlags,
      voltageMv: parsed.voltageMv,
      externalPowerMv: parsed.externalPowerMv,
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

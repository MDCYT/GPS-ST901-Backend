function gpsToDecimal(raw, hemi) {
  const value = Number(raw);
  const degrees = Math.floor(value / 100);
  const minutes = value - degrees * 100;
  let decimal = degrees + minutes / 60;

  if (hemi === "S" || hemi === "W") decimal *= -1;
  return decimal;
}

function parseDateTime(hhmmss, ddmmyy) {
  const hh = hhmmss.slice(0, 2);
  const mm = hhmmss.slice(2, 4);
  const ss = hhmmss.slice(4, 6);

  const dd = ddmmyy.slice(0, 2);
  const mo = ddmmyy.slice(2, 4);
  const yy = `20${ddmmyy.slice(4, 6)}`;

  return `${yy}-${mo}-${dd} ${hh}:${mm}:${ss}`;
}

function parsePacket(packet) {
  const clean = packet.trim();

  if (!clean.startsWith("*HQ,") || !clean.endsWith("#")) return null;

  const parts = clean.slice(0, -1).split(",");
  if (parts.length < 12) return null;

  const trackerId = parts[1];
  const hhmmss = parts[3];
  const validity = parts[4];
  const latRaw = parts[5];
  const latHem = parts[6];
  const lonRaw = parts[7];
  const lonHem = parts[8];
  const speed = parts[9];
  const course = parts[10];
  const ddmmyy = parts[11];

  const statusFlags = parts[12];
  const gsmSignal = parts[13] ? Number(parts[13]) : undefined;
  const batteryLevel = parts[14] ? Number(parts[14]) : undefined;
  const externalPowerMv = parts[15] ? Number(parts[15]) : undefined;
  const voltageMv = parts[16] ? Number(parts[16].replace("#", "")) : undefined;

  // Bit 19: batería interna conectada al vehículo
  // Bit 10: ignición (cable ACC con voltaje)
  const flagInt = statusFlags ? parseInt(statusFlags, 16) : null;
  const batteryConnected = flagInt !== null ? Boolean(flagInt & 0x80000) : null;
  const ignitionOn      = flagInt !== null ? Boolean(flagInt & 0x0400)   : null;

  return {
    trackerId,
    packetTime: parseDateTime(hhmmss, ddmmyy),
    valid: validity === "A",
    latitude: gpsToDecimal(latRaw, latHem),
    longitude: gpsToDecimal(lonRaw, lonHem),
    speedKmh: Number(speed),
    course: Number(course),
    statusFlags,
    batteryConnected,
    ignitionOn,
    gsmSignal,
    batteryLevel,
    externalPowerMv,
    voltageMv,
    rawPacket: clean,
  };
}

module.exports = {
  parsePacket,
};

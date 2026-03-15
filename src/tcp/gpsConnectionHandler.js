const { parsePacket } = require("../services/gpsParser");
const { savePosition } = require("../services/gpsService");
const { registerTrackerSocket, unregisterSocket } = require("./connectionRegistry");
const { dispatchPendingCommandsForTracker } = require("./commandDispatcher");
const { markLatestSentCommandAcknowledged } = require("../services/commandService");

function handleGpsSocket(socket, initialChunk) {
  let pending = "";
  let queue = Promise.resolve();
  let boundTrackerId = null;

  function appendAndProcess(chunk) {
    pending += chunk.toString("utf8");

    queue = queue
      .then(async () => {
        while (pending.includes("#")) {
          const idx = pending.indexOf("#");
          const packet = pending.slice(0, idx + 1);
          pending = pending.slice(idx + 1);

          console.log("Paquete:", packet);

          const parsed = parsePacket(packet);
          if (!parsed) {
            console.warn("Paquete no reconocido");
            continue;
          }

          console.log("Parseado:", parsed);

          try {
            await savePosition(parsed);
            if (parsed.trackerId) {
              registerTrackerSocket(parsed.trackerId, socket);
              boundTrackerId = parsed.trackerId;
              await dispatchPendingCommandsForTracker(parsed.trackerId);
            }
            socket.write("ON#");
            console.log("ACK enviado: ON#");
          } catch (dbErr) {
            console.error("Error guardando en DB:", dbErr);
          }

          if (boundTrackerId) {
            await markLatestSentCommandAcknowledged(
              boundTrackerId,
              `device-traffic:${packet.slice(0, 120)}`,
            );
          }
        }
      })
      .catch((err) => {
        console.error("Error procesando paquete GPS:", err);
      });
  }

  console.log("Nueva conexion GPS desde:", `${socket.remoteAddress}:${socket.remotePort}`);

  if (initialChunk && initialChunk.length > 0) {
    appendAndProcess(initialChunk);
  }

  socket.on("data", appendAndProcess);
  socket.on("error", (err) => {
    console.error("Error en conexion GPS:", err);
  });

  socket.on("close", () => {
    unregisterSocket(socket);
  });
}

module.exports = {
  handleGpsSocket,
};

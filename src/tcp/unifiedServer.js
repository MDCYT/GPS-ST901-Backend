const net = require("net");
const { createHttpApiServer } = require("../http/apiServer");
const { handleGpsSocket } = require("./gpsConnectionHandler");
const { unregisterSocket } = require("./connectionRegistry");

function looksLikeHttp(chunk) {
  const prefix = chunk.toString("utf8", 0, Math.min(chunk.length, 16)).toUpperCase();
  return (
    prefix.startsWith("GET ") ||
    prefix.startsWith("POST ") ||
    prefix.startsWith("PUT ") ||
    prefix.startsWith("PATCH ") ||
    prefix.startsWith("DELETE ") ||
    prefix.startsWith("HEAD ") ||
    prefix.startsWith("OPTIONS ")
  );
}

function createUnifiedServer(port) {
  const httpServer = createHttpApiServer();

  const unifiedServer = net.createServer((socket) => {
    socket.on("close", () => {
      unregisterSocket(socket);
    });

    socket.once("data", (firstChunk) => {
      if (looksLikeHttp(firstChunk)) {
        socket.unshift(firstChunk);
        httpServer.emit("connection", socket);
        return;
      }

      handleGpsSocket(socket, firstChunk);
    });
  });

  unifiedServer.on("error", (err) => {
    console.error("Error en servidor unificado:", err);
  });

  unifiedServer.listen(port, () => {
    console.log(`Servidor unificado (GPS TCP + API HTTP) escuchando en ${port}`);
  });

  return unifiedServer;
}

module.exports = {
  createUnifiedServer,
};

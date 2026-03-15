const http = require("http");
const { routes } = require("../routes/deviceRoutes");
const { sendJson } = require("../utils/http");
const { attachAuthUser } = require("./authMiddleware");

function createHttpApiServer() {
  return http.createServer(async (req, res) => {
    try {
      attachAuthUser(req);

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
      }

      const url = new URL(req.url || "/", "http://localhost");

      for (const route of routes) {
        if (route.method !== req.method) continue;

        const match = url.pathname.match(route.pattern);
        if (!match) continue;

        if (route.authRequired && !req.authUser) {
          sendJson(res, 401, { error: "No autenticado" });
          return;
        }

        await route.handler(req, res, match.groups || {}, url);
        return;
      }

      sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (err) {
      console.error("Error en API:", err);
      sendJson(res, 500, { error: "Error interno" });
    }
  });
}

module.exports = {
  createHttpApiServer,
};

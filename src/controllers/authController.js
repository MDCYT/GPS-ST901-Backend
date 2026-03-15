const authService = require("../services/authService");
const { sendJson, readJsonBody } = require("../utils/http");

async function register(req, res) {
  try {
    const body = await readJsonBody(req);
    const user = await authService.registerUser({
      email: body.email,
      password: body.password,
      fullName: body.fullName,
    });

    sendJson(res, 201, {
      message: "Usuario registrado",
      user,
    });
  } catch (err) {
    const status = /ya registrado|requeridos/i.test(err.message) ? 400 : 500;
    sendJson(res, status, { error: err.message || "Error registrando usuario" });
  }
}

async function login(req, res) {
  try {
    const body = await readJsonBody(req);
    const session = await authService.loginUser({
      email: body.email,
      password: body.password,
    });

    sendJson(res, 200, session);
  } catch (err) {
    const status = /credenciales invalidas/i.test(err.message) ? 401 : 500;
    sendJson(res, status, { error: err.message || "Error de autenticacion" });
  }
}

async function me(req, res) {
  if (!req.authUser) {
    sendJson(res, 401, { error: "No autenticado" });
    return;
  }

  const user = await authService.getUserById(req.authUser.id);
  if (!user) {
    sendJson(res, 404, { error: "Usuario no encontrado" });
    return;
  }

  sendJson(res, 200, {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    createdAt: user.created_at,
  });
}

module.exports = {
  register,
  login,
  me,
};

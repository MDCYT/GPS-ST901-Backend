const authService = require("../services/authService");
const { getBearerToken } = require("../utils/http");

function attachAuthUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    req.authUser = null;
    return;
  }

  try {
    const payload = authService.verifyToken(token);
    req.authUser = {
      id: Number(payload.sub),
      email: payload.email,
    };
  } catch {
    req.authUser = null;
  }
}

module.exports = {
  attachAuthUser,
};

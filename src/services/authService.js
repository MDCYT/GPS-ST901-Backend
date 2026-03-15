const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "cambia-este-secreto-en-produccion";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

async function registerUser({ email, password, fullName }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(fullName || "").trim();

  if (!normalizedEmail || !password) {
    throw new Error("email y password son requeridos");
  }

  const [existingRows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [
    normalizedEmail,
  ]);
  if (existingRows.length > 0) {
    throw new Error("email ya registrado");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.execute(
    "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
    [normalizedEmail, passwordHash, cleanName || null],
  );

  return {
    id: result.insertId,
    email: normalizedEmail,
    fullName: cleanName || null,
  };
}

async function loginUser({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const [rows] = await pool.query(
    "SELECT id, email, full_name, password_hash FROM users WHERE email = ? LIMIT 1",
    [normalizedEmail],
  );

  if (rows.length === 0) {
    throw new Error("credenciales invalidas");
  }

  const user = rows[0];
  const ok = await bcrypt.compare(String(password || ""), user.password_hash);
  if (!ok) {
    throw new Error("credenciales invalidas");
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    },
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    "SELECT id, email, full_name, created_at FROM users WHERE id = ? LIMIT 1",
    [userId],
  );

  return rows[0] || null;
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  getUserById,
};

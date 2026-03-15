require("dotenv").config();

const mysql = require("mysql2/promise");

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const [colRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_password_hash'",
  );

  if (colRows[0].cnt === 0) {
    await pool.query("ALTER TABLE devices ADD COLUMN device_password_hash VARCHAR(255) NULL");
  }

  await pool.query(
    "CREATE TABLE IF NOT EXISTS users (id BIGINT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(190) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, full_name VARCHAR(255), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );

  await pool.query(
    "CREATE TABLE IF NOT EXISTS user_device_access (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, device_id BIGINT NOT NULL, role ENUM('owner','viewer') NOT NULL DEFAULT 'viewer', granted_by_user_id BIGINT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY user_device_unique (user_id, device_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE, FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL)",
  );

  await pool.end();
  console.log("Migracion aplicada correctamente");
}

run().catch((err) => {
  console.error("Error aplicando migracion:", err);
  process.exit(1);
});

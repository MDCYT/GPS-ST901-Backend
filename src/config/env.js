require("dotenv").config();

const config = {
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  },
  port: Number(process.env.PORT || process.env.TCP_PORT || 20109),
};

module.exports = config;

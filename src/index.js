const config = require("./config/env");
const { testDb } = require("./config/db");
const { createUnifiedServer } = require("./tcp/unifiedServer");

async function main() {
	await testDb();
	createUnifiedServer(config.port);
}

main().catch((err) => {
	console.error("Error fatal:", err);
	process.exit(1);
});

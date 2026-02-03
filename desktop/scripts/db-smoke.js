const path = require("path");
const db = require("../db");

const baseDir = path.join(__dirname, "..");

db.initDb(baseDir);

const created = db.addServer({
  name: "Smoke Test",
  url: "http://127.0.0.1:8080",
  token: null,
});

const list = db.listServers();
if (!list.find((item) => item.id === created.id)) {
  console.error("Smoke test failed: created server not found");
  process.exit(1);
}

db.deleteServer({ id: created.id });

console.log("DB smoke test OK");

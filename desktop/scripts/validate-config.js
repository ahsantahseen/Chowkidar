const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json in desktop directory.");
  process.exit(1);
}

const raw = fs.readFileSync(configPath, "utf-8");
const config = JSON.parse(raw);

try {
  const parsed = new URL(config.backendBaseUrl);
  if (!parsed.protocol.startsWith("http")) {
    throw new Error("backendBaseUrl must be http or https");
  }
} catch (error) {
  console.error("Invalid backendBaseUrl:", error.message);
  process.exit(1);
}

const uiPort = Number(config.uiPort);
if (!Number.isInteger(uiPort) || uiPort <= 0) {
  console.error("Invalid uiPort in config.json");
  process.exit(1);
}

console.log("Config OK");

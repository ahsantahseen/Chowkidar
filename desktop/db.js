const path = require("path");
const Database = require("better-sqlite3");

let dbInstance;
let dbPath;

function initDb(baseDir = __dirname) {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedBase = process.env.CHOWKIDAR_DB_DIR || baseDir;
  dbPath =
    process.env.CHOWKIDAR_DB_PATH ||
    path.join(resolvedBase, "chowkidar.sqlite");

  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      token TEXT,
      group_name TEXT,
      tags TEXT,
      sort_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const columns = dbInstance
    .prepare("PRAGMA table_info(servers)")
    .all()
    .map((col) => col.name);

  if (!columns.includes("group_name")) {
    dbInstance.exec("ALTER TABLE servers ADD COLUMN group_name TEXT");
  }
  if (!columns.includes("tags")) {
    dbInstance.exec("ALTER TABLE servers ADD COLUMN tags TEXT");
  }
  if (!columns.includes("sort_order")) {
    dbInstance.exec("ALTER TABLE servers ADD COLUMN sort_order INTEGER");
  }

  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    initDb();
  }
  return dbInstance;
}

function listServers() {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, name, url, token, group_name, tags, sort_order, created_at, updated_at FROM servers ORDER BY sort_order ASC, id DESC",
    )
    .all();
}

function getServerById(id) {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, name, url, token, group_name, tags, sort_order, created_at, updated_at FROM servers WHERE id = ?",
    )
    .get(id);
}

function addServer(payload) {
  const db = getDb();
  const now = new Date().toISOString();
  const name = payload?.name?.trim();
  const url = payload?.url?.trim();
  const token = payload?.token?.trim() || null;
  const groupName = payload?.group?.trim() || null;
  const tags = payload?.tags?.trim() || null;

  const maxOrderRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM servers")
    .get();
  const sortOrder = Number(maxOrderRow?.maxOrder || 0) + 1;

  if (!name || !url) {
    throw new Error("name and url are required");
  }

  const stmt = db.prepare(
    "INSERT INTO servers (name, url, token, group_name, tags, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const info = stmt.run(name, url, token, groupName, tags, sortOrder, now, now);
  return getServerById(info.lastInsertRowid);
}

function updateServer(payload) {
  const db = getDb();
  const id = Number(payload?.id);
  if (!id) {
    throw new Error("id is required");
  }

  const name = payload?.name?.trim();
  const url = payload?.url?.trim();
  const token = payload?.token?.trim() || null;
  const groupName = payload?.group?.trim() || null;
  const tags = payload?.tags?.trim() || null;

  if (!name || !url) {
    throw new Error("name and url are required");
  }

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE servers SET name = ?, url = ?, token = ?, group_name = ?, tags = ?, updated_at = ? WHERE id = ?",
  ).run(name, url, token, groupName, tags, now, id);

  return getServerById(id);
}

function updateServerMeta(payload) {
  const db = getDb();
  const id = Number(payload?.id);
  if (!id) {
    throw new Error("id is required");
  }

  const fields = [];
  const values = [];

  if (payload?.group !== undefined) {
    fields.push("group_name = ?");
    values.push(payload.group?.trim() || null);
  }

  if (payload?.tags !== undefined) {
    fields.push("tags = ?");
    values.push(payload.tags?.trim() || null);
  }

  if (payload?.sortOrder !== undefined) {
    fields.push("sort_order = ?");
    values.push(Number(payload.sortOrder));
  }

  if (!fields.length) {
    return getServerById(id);
  }

  const now = new Date().toISOString();
  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  const statement = `UPDATE servers SET ${fields.join(", ")} WHERE id = ?`;
  db.prepare(statement).run(...values);

  return getServerById(id);
}

function deleteServer(payload) {
  const db = getDb();
  const id = Number(payload?.id);
  if (!id) {
    throw new Error("id is required");
  }
  db.prepare("DELETE FROM servers WHERE id = ?").run(id);
  return { id };
}

module.exports = {
  initDb,
  listServers,
  addServer,
  updateServer,
  updateServerMeta,
  deleteServer,
};

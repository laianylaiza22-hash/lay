"use strict";
const { createClient } = require("@libsql/client");
const bcrypt = require("bcryptjs");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Se estiver local sem variaveis do Turso, usa arquivo local (para testar no seu PC)
const client = url
  ? createClient({ url, authToken })
  : createClient({ url: "file:agencialola.db" });

async function init() {
  await client.batch([
    "CREATE TABLE IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', photo TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')) )",
    "CREATE TABLE IF NOT EXISTS clients ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT, instagram TEXT, address TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')) )",
    "CREATE TABLE IF NOT EXISTS cash ( id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value REAL NOT NULL, description TEXT, date TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')) )"
  ], "write");

  // Seed usuarios iniciais se tabela vazia
  const { rows } = await client.execute("SELECT COUNT(*) AS n FROM users");
  const count = rows[0]?.n || 0;
  if (count === 0) {
    const seed = [
      { name: "Lola Silva", email: "lola@agencialola.local", username: "lola", role: "admin", pass: "lola123" },
      { name: "Alex Carte", email: "alex@agencialola.local", username: "alex", role: "operator", pass: "alex123" },
      { name: "Equipe 2", email: "", username: "equipe2", role: "operator", pass: "equipe123" },
      { name: "Equipe 3", email: "", username: "equipe3", role: "operator", pass: "equipe123" }
    ];
    for (const u of seed) {
      const hash = bcrypt.hashSync(u.pass, 10);
      await client.execute({
        sql: "INSERT INTO users (name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        args: [u.name, u.email, u.username, hash, u.role]
      });
    }
    console.log("Usuarios iniciais criados: lola / alex / equipe2 / equipe3");
  }
}

module.exports = { client, init };

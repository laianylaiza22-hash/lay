"use strict";
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database(path.join(__dirname, "agencialola.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  photo TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  instagram TEXT,
  address TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Usuarios iniciais: 1 administrador + 3 operadores
const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (count === 0) {
  const seed = [
    { name: "Lola Silva",   email: "lola@agencialola.local",  username: "lola",    role: "admin",    pass: "lola123" },
    { name: "Alex Carte",   email: "alex@agencialola.local",  username: "alex",    role: "operator", pass: "alex123" },
    { name: "Equipe 2",     email: "",                        username: "equipe2", role: "operator", pass: "equipe123" },
    { name: "Equipe 3",     email: "",                        username: "equipe3", role: "operator", pass: "equipe123" }
  ];
  const ins = db.prepare("INSERT INTO users (name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)");
  for (const u of seed) {
    ins.run(u.name, u.email, u.username, bcrypt.hashSync(u.pass, 10), u.role);
  }
  console.log("Usuarios iniciais criados: lola / alex / equipe2 / equipe3");
}

module.exports = db;

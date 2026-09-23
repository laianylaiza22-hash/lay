"use strict";
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { client, init } = require("./db");
const { auth, requireRole, SECRET } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const isAdmin = requireRole("admin");

/* ---------------- LOGIN ---------------- */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Informe usuario e senha." });
  const { rows } = await client.execute({
    sql: "SELECT * FROM users WHERE username = ? AND active = 1",
    args: [String(username).trim().toLowerCase()]
  });
  const user = rows[0];
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: "Usuario ou senha invalidos." });
  }
  const payload = { id: user.id, name: user.name, username: user.username, role: user.role };
  const token = jwt.sign(payload, SECRET, { expiresIn: "12h" });
  res.json({ token, user: payload });
});

app.get("/api/me", auth, async (req, res) => {
  const { rows } = await client.execute({
    sql: "SELECT id, name, email, username, role, photo FROM users WHERE id = ?",
    args: [req.user.id]
  });
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Usuario nao encontrado." });
  res.json(user);
});

/* ---------------- USUARIOS (somente admin) ---------------- */
app.get("/api/users", auth, isAdmin, async (req, res) => {
  const { rows } = await client.execute("SELECT id, name, email, username, role, photo, active, created_at FROM users ORDER BY id");
  res.json(rows);
});

app.post("/api/users", auth, isAdmin, async (req, res) => {
  const { name, email, username, password, role, photo } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: "Nome, usuario e senha sao obrigatorios." });
  if (!["admin", "operator"].includes(role)) return res.status(400).json({ error: "Perfil invalido." });
  try {
    const r = await client.execute({
      sql: "INSERT INTO users (name, email, username, password_hash, role, photo) VALUES (?, ?, ?, ?, ?, ?)",
      args: [name.trim(), (email || "").trim(), String(username).trim().toLowerCase(), bcrypt.hashSync(String(password), 10), role, photo || ""]
    });
    res.status(201).json({ id: Number(r.lastInsertRowId) });
  } catch (e) {
    res.status(400).json({ error: "Nome de usuario ja existe." });
  }
});

app.put("/api/users/:id", auth, isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, role, photo, password, active } = req.body || {};
  const tRes = await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  const target = tRes.rows[0];
  if (!target) return res.status(404).json({ error: "Usuario nao encontrado." });
  if (id === req.user.id && (role === "operator" || active === 0)) {
    return res.status(400).json({ error: "Voce nao pode rebaixar nem desativar a si mesmo." });
  }
  const aRes = await client.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1");
  const admins = aRes.rows[0].n;
  if (target.role === "admin" && admins <= 1 && (role === "operator" || active === 0)) {
    return res.status(400).json({ error: "Deve existir ao menos um administrador ativo." });
  }
  const fields = [], vals = [];
  if (name !== undefined) { fields.push("name = ?"); vals.push(String(name).trim()); }
  if (email !== undefined) { fields.push("email = ?"); vals.push(String(email).trim()); }
  if (role && ["admin", "operator"].includes(role)) { fields.push("role = ?"); vals.push(role); }
  if (photo !== undefined) { fields.push("photo = ?"); vals.push(photo || ""); }
  if (active !== undefined) { fields.push("active = ?"); vals.push(active ? 1 : 0); }
  if (password) { fields.push("password_hash = ?"); vals.push(bcrypt.hashSync(String(password), 10)); }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  vals.push(id);
  await client.execute({ sql: "UPDATE users SET " + fields.join(", ") + " WHERE id = ?", args: vals });
  res.json({ ok: true });
});

app.delete("/api/users/:id", auth, isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Voce nao pode excluir a si mesmo." });
  const tRes = await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  const target = tRes.rows[0];
  if (!target) return res.status(404).json({ error: "Usuario nao encontrado." });
  const aRes = await client.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1");
  const admins = aRes.rows[0].n;
  if (target.role === "admin" && admins <= 1) {
    return res.status(400).json({ error: "Deve existir ao menos um administrador ativo." });
  }
  await client.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
  res.json({ ok: true });
});

/* Trocar a propria senha e foto */
app.put("/api/me", auth, async (req, res) => {
  const { name, email, photo, password } = req.body || {};
  const fields = [], vals = [];
  if (name) { fields.push("name = ?"); vals.push(String(name).trim()); }
  if (email !== undefined) { fields.push("email = ?"); vals.push(String(email).trim()); }
  if (photo !== undefined) { fields.push("photo = ?"); vals.push(photo || ""); }
  if (password) { fields.push("password_hash = ?"); vals.push(bcrypt.hashSync(String(password), 10)); }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  vals.push(req.user.id);
  await client.execute({ sql: "UPDATE users SET " + fields.join(", ") + " WHERE id = ?", args: vals });
  res.json({ ok: true });
});

/* ---------------- CLIENTES ---------------- */
app.get("/api/clients", auth, async (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const { rows } = await client.execute("SELECT * FROM clients ORDER BY name");
  let filtered = rows;
  if (q) filtered = rows.filter(c => ((c.name || "") + " " + (c.phone || "") + " " + (c.instagram || "")).toLowerCase().includes(q));
  res.json(filtered);
});

app.post("/api/clients", auth, async (req, res) => {
  const { name, phone, email, instagram, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
  const r = await client.execute({
    sql: "INSERT INTO clients (name, phone, email, instagram, address, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    args: [name.trim(), phone || "", email || "", instagram || "", address || "", req.user.id]
  });
  res.status(201).json({ id: Number(r.lastInsertRowId) });
});

app.put("/api/clients/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email, instagram, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
  await client.execute({
    sql: "UPDATE clients SET name = ?, phone = ?, email = ?, instagram = ?, address = ? WHERE id = ?",
    args: [name.trim(), phone || "", email || "", instagram || "", address || "", id]
  });
  res.json({ ok: true });
});

app.delete("/api/clients/:id", auth, isAdmin, async (req, res) => {
  await client.execute({ sql: "DELETE FROM clients WHERE id = ?", args: [Number(req.params.id)] });
  res.json({ ok: true });
});

/* ---------------- CAIXA ---------------- */
app.get("/api/cash", auth, async (req, res) => {
  const { from, to, type } = req.query;
  let sql = "SELECT * FROM cash WHERE 1=1", vals = [];
  if (from) { sql += " AND date >= ?"; vals.push(from); }
  if (to) { sql += " AND date <= ?"; vals.push(to); }
  if (type === "entrada" || type === "saida") { sql += " AND type = ?"; vals.push(type); }
  sql += " ORDER BY date DESC, id DESC";
  const { rows } = await client.execute({ sql, args: vals });
  res.json(rows);
});

app.post("/api/cash", auth, async (req, res) => {
  const { type, value, description, date } = req.body || {};
  if (type !== "entrada" && type !== "saida") return res.status(400).json({ error: "Tipo invalido." });
  const v = Number(value);
  if (!(v > 0)) return res.status(400).json({ error: "Informe um valor maior que zero." });
  const d = date || new Date().toISOString().slice(0, 10);
  const r = await client.execute({
    sql: "INSERT INTO cash (type, value, description, date, created_by) VALUES (?, ?, ?, ?, ?)",
    args: [type, v, description || "", d, req.user.id]
  });
  res.status(201).json({ id: Number(r.lastInsertRowId) });
});

app.delete("/api/cash/:id", auth, isAdmin, async (req, res) => {
  await client.execute({ sql: "DELETE FROM cash WHERE id = ?", args: [Number(req.params.id)] });
  res.json({ ok: true });
});

/* ---------------- BACKUP (somente admin) ---------------- */
app.get("/api/backup", auth, isAdmin, async (req, res) => {
  const users = (await client.execute("SELECT id, name, email, username, role, photo, active, created_at FROM users")).rows;
  const clients = (await client.execute("SELECT * FROM clients")).rows;
  const cash = (await client.execute("SELECT * FROM cash")).rows;
  res.json({ exported_at: new Date().toISOString(), users, clients, cash });
});

app.post("/api/backup", auth, isAdmin, async (req, res) => {
  const { users, clients, cash } = req.body || {};
  await client.execute("DELETE FROM cash");
  await client.execute("DELETE FROM clients");
  if (Array.isArray(cash)) {
    for (const c of cash) {
      await client.execute({
        sql: "INSERT INTO cash (type, value, description, date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [c.type, c.value, c.description || "", c.date, c.created_by || null, c.created_at || new Date().toISOString()]
      });
    }
  }
  if (Array.isArray(clients)) {
    for (const c of clients) {
      await client.execute({
        sql: "INSERT INTO clients (name, phone, email, instagram, address, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [c.name, c.phone || "", c.email || "", c.instagram || "", c.address || "", c.created_by || null, c.created_at || new Date().toISOString()]
      });
    }
  }
  if (Array.isArray(users) && users.length) {
    await client.execute("DELETE FROM users");
    for (const u of users) {
      const hash = u.password_hash || bcrypt.hashSync("trocar123", 10);
      await client.execute({
        sql: "INSERT INTO users (name, email, username, password_hash, role, photo, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [u.name, u.email || "", u.username, hash, u.role === "admin" ? "admin" : "operator", u.photo || "", u.active ? 1 : 0]
      });
    }
  }
  res.json({ ok: true });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

(async () => {
  await init();
  app.listen(PORT, () => console.log("Agencia Lola Silva rodando em http://localhost:" + PORT + " - conectado no Turso"));
})();
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
{
  "name": "agencia-lola-silva",
  "version": "2.0.0",
  "description": "Sistema de gestao da Agencia Lola Silva - com banco Turso persistente",
  "main": "server.js",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "@libsql/client": "^0.14.0"
  }
}

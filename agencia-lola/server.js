"use strict";
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { auth, requireRole, SECRET } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const isAdmin = requireRole("admin");

/* ---------------- LOGIN ---------------- */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Informe usuario e senha." });
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(String(username).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: "Usuario ou senha invalidos." });
  }
  const payload = { id: user.id, name: user.name, username: user.username, role: user.role };
  const token = jwt.sign(payload, SECRET, { expiresIn: "12h" });
  res.json({ token, user: payload });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT id, name, email, username, role, photo FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "Usuario nao encontrado." });
  res.json(user);
});

/* ---------------- USUARIOS (somente admin) ---------------- */
app.get("/api/users", auth, isAdmin, (req, res) => {
  const users = db.prepare("SELECT id, name, email, username, role, photo, active, created_at FROM users ORDER BY id").all();
  res.json(users);
});

app.post("/api/users", auth, isAdmin, (req, res) => {
  const { name, email, username, password, role, photo } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: "Nome, usuario e senha sao obrigatorios." });
  if (!["admin", "operator"].includes(role)) return res.status(400).json({ error: "Perfil invalido." });
  try {
    const r = db.prepare("INSERT INTO users (name, email, username, password_hash, role, photo) VALUES (?, ?, ?, ?, ?, ?)")
      .run(name.trim(), (email || "").trim(), String(username).trim().toLowerCase(), bcrypt.hashSync(String(password), 10), role, photo || "");
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "Nome de usuario ja existe." });
  }
});

app.put("/api/users/:id", auth, isAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, email, role, photo, password, active } = req.body || {};
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Usuario nao encontrado." });
  if (id === req.user.id && (role === "operator" || active === 0)) {
    return res.status(400).json({ error: "Voce nao pode rebaixar nem desativar a si mesmo." });
  }
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
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
  db.prepare("UPDATE users SET " + fields.join(", ") + " WHERE id = ?").run(...vals);
  res.json({ ok: true });
});

app.delete("/api/users/:id", auth, isAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Voce nao pode excluir a si mesmo." });
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Usuario nao encontrado." });
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
  if (target.role === "admin" && admins <= 1) {
    return res.status(400).json({ error: "Deve existir ao menos um administrador ativo." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true });
});

/* Trocar a propria senha e foto */
app.put("/api/me", auth, (req, res) => {
  const { name, email, photo, password } = req.body || {};
  const fields = [], vals = [];
  if (name) { fields.push("name = ?"); vals.push(String(name).trim()); }
  if (email !== undefined) { fields.push("email = ?"); vals.push(String(email).trim()); }
  if (photo !== undefined) { fields.push("photo = ?"); vals.push(photo || ""); }
  if (password) { fields.push("password_hash = ?"); vals.push(bcrypt.hashSync(String(password), 10)); }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  vals.push(req.user.id);
  db.prepare("UPDATE users SET " + fields.join(", ") + " WHERE id = ?").run(...vals);
  res.json({ ok: true });
});

/* ---------------- CLIENTES ---------------- */
app.get("/api/clients", auth, (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  let rows = db.prepare("SELECT * FROM clients ORDER BY name").all();
  if (q) rows = rows.filter(c => ((c.name || "") + " " + (c.phone || "") + " " + (c.instagram || "")).toLowerCase().includes(q));
  res.json(rows);
});

app.post("/api/clients", auth, (req, res) => {
  const { name, phone, email, instagram, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
  const r = db.prepare("INSERT INTO clients (name, phone, email, instagram, address, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name.trim(), phone || "", email || "", instagram || "", address || "", req.user.id);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.put("/api/clients/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email, instagram, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
  db.prepare("UPDATE clients SET name = ?, phone = ?, email = ?, instagram = ?, address = ? WHERE id = ?")
    .run(name.trim(), phone || "", email || "", instagram || "", address || "", id);
  res.json({ ok: true });
});

app.delete("/api/clients/:id", auth, isAdmin, (req, res) => {
  db.prepare("DELETE FROM clients WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------------- CAIXA ---------------- */
app.get("/api/cash", auth, (req, res) => {
  const { from, to, type } = req.query;
  let sql = "SELECT * FROM cash WHERE 1=1", vals = [];
  if (from) { sql += " AND date >= ?"; vals.push(from); }
  if (to) { sql += " AND date <= ?"; vals.push(to); }
  if (type === "entrada" || type === "saida") { sql += " AND type = ?"; vals.push(type); }
  sql += " ORDER BY date DESC, id DESC";
  res.json(db.prepare(sql).all(...vals));
});

app.post("/api/cash", auth, (req, res) => {
  const { type, value, description, date } = req.body || {};
  if (type !== "entrada" && type !== "saida") return res.status(400).json({ error: "Tipo invalido." });
  const v = Number(value);
  if (!(v > 0)) return res.status(400).json({ error: "Informe um valor maior que zero." });
  const d = date || new Date().toISOString().slice(0, 10);
  const r = db.prepare("INSERT INTO cash (type, value, description, date, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(type, v, description || "", d, req.user.id);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.delete("/api/cash/:id", auth, isAdmin, (req, res) => {
  db.prepare("DELETE FROM cash WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------------- BACKUP (somente admin) ---------------- */
app.get("/api/backup", auth, isAdmin, (req, res) => {
  res.json({
    exported_at: new Date().toISOString(),
    users: db.prepare("SELECT id, name, email, username, role, photo, active, created_at FROM users").all(),
    clients: db.prepare("SELECT * FROM clients").all(),
    cash: db.prepare("SELECT * FROM cash").all()
  });
});

app.post("/api/backup", auth, isAdmin, (req, res) => {
  const { users, clients, cash } = req.body || {};
  const tx = db.transaction(() => {
    db.exec("DELETE FROM cash; DELETE FROM clients;");
    if (Array.isArray(cash)) {
      const ins = db.prepare("INSERT INTO cash (type, value, description, date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const c of cash) ins.run(c.type, c.value, c.description || "", c.date, c.created_by || null, c.created_at || new Date().toISOString());
    }
    if (Array.isArray(clients)) {
      const ins = db.prepare("INSERT INTO clients (name, phone, email, instagram, address, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const c of clients) ins.run(c.name, c.phone || "", c.email || "", c.instagram || "", c.address || "", c.created_by || null, c.created_at || new Date().toISOString());
    }
    if (Array.isArray(users) && users.length) {
      db.exec("DELETE FROM users;");
      const ins = db.prepare("INSERT INTO users (name, email, username, password_hash, role, photo, active) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const u of users) {
        const hash = u.password_hash || bcrypt.hashSync("trocar123", 10);
        ins.run(u.name, u.email || "", u.username, hash, u.role === "admin" ? "admin" : "operator", u.photo || "", u.active ? 1 : 0);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log("Agencia Lola Silva rodando em http://localhost:" + PORT));

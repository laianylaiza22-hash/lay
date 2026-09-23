"use strict";
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "lola-silva-secret-troque-isto";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Nao autenticado." });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissao para esta acao." });
    }
    next();
  };
}

module.exports = { auth, requireRole, SECRET };

(function () {
"use strict";

var token = localStorage.getItem("lola_token") || "";
var me = null;
var PHOTO = "";

function api(path, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  opts.headers["Content-Type"] = "application/json";
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  return fetch(path, opts).then(function (r) {
    if (r.status === 401) { doLogout(); throw new Error("Sessão expirada."); }
    return r.json().then(function (data) {
      if (!r.ok) throw new Error(data.error || "Erro na operação.");
      return data;
    });
  });
}

function money(n) { return "R$ " + Number(n || 0).toFixed(2).replace(".", ","); }
function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
function parseMoney(v) {
  var s = String(v || "").replace(/\s/g, "").replace("R$", "");
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  var n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function avatar(photo) {
  if (photo) return photo;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#e8e8e8"/><circle cx="40" cy="30" r="13" fill="#bdbdbd"/><path d="M15 72c4-16 14-24 25-24s21 8 25 24z" fill="#bdbdbd"/></svg>');
}
function readPhoto(input, cb) {
  if (!input.files || !input.files[0]) return cb("");
  var fr = new FileReader();
  fr.onload = function (e) { cb(e.target.result); };
  fr.readAsDataURL(input.files[0]);
}

/* ---------- LOGIN ---------- */
function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appScreen").classList.add("hidden");
}
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
}
function doLogout() {
  token = ""; me = null;
  localStorage.removeItem("lola_token");
  showLogin();
}

document.getElementById("loginBtn").onclick = function () {
  var u = document.getElementById("loginUser").value;
  var p = document.getElementById("loginPass").value;
  var err = document.getElementById("loginError");
  err.classList.add("hidden");
  api("/api/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) })
    .then(function (d) {
      token = d.token;
      localStorage.setItem("lola_token", token);
      boot();
    })
    .catch(function (e) { err.textContent = e.message; err.classList.remove("hidden"); });
};
document.getElementById("loginPass").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});
document.getElementById("logoutBtn").onclick = doLogout;

/* ---------- NAVEGAÇÃO ---------- */
var PAGES = [
  { id: "dashboard", label: "Início", roles: ["admin", "operator"] },
  { id: "clientes", label: "Clientes", roles: ["admin", "operator"] },
  { id: "caixa", label: "Caixa", roles: ["admin", "operator"] },
  { id: "relatorios", label: "Relatórios", roles: ["admin", "operator"] },
  { id: "usuarios", label: "Usuários", roles: ["admin"] },
  { id: "backup", label: "Backup", roles: ["admin"] }
];

function buildNav() {
  var sb = document.getElementById("sidebar");
  sb.innerHTML = "";
  PAGES.filter(function (p) { return p.roles.indexOf(me.role) >= 0; }).forEach(function (p, i) {
    var b = document.createElement("button");
    b.className = "nav-btn" + (i === 0 ? " active" : "");
    b.textContent = p.label;
    b.setAttribute("data-page", p.id);
    b.onclick = function () { go(p.id); };
    sb.appendChild(b);
  });
}

function go(page) {
  var btns = document.querySelectorAll(".nav-btn");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-page") === page);
  var secs = document.querySelectorAll(".page");
  for (var j = 0; j < secs.length; j++) secs[j].classList.add("hidden");
  document.getElementById("page-" + page).classList.remove("hidden");
  if (page === "dashboard") loadDashboard();
  if (page === "clientes") loadClients();
  if (page === "caixa") loadCash();
  if (page === "relatorios") loadReports();
  if (page === "usuarios") loadUsers();
}

function isAdmin() { return me && me.role === "admin"; }

/* ---------- DASHBOARD ---------- */
function loadDashboard() {
  Promise.all([api("/api/cash"), api("/api/clients")]).then(function (r) {
    var cash = r[0], clients = r[1], inn = 0, out = 0;
    cash.forEach(function (c) { if (c.type === "entrada") inn += c.value; else out += c.value; });
    document.getElementById("dBalance").textContent = money(inn - out);
    document.getElementById("dIn").textContent = money(inn);
    document.getElementById("dOut").textContent = money(out);
    document.getElementById("dClients").textContent = clients.length;
    var box = document.getElementById("dashRecent");
    box.innerHTML = "";
    cash.slice(0, 5).forEach(function (c) { box.appendChild(cashItem(c, false)); });
    if (!cash.length) box.innerHTML = '<div class="muted">Nenhuma movimentação ainda.</div>';
  }).catch(function (e) { alert(e.message); });
}

function cashItem(c, canDelete) {
  var item = document.createElement("div");
  item.className = "list-item";
  var left = document.createElement("div");
  left.innerHTML = "<strong>" + esc(c.description || "Sem descrição") + "</strong><br><small>" + fmtDate(c.date) + "</small>";
  var right = document.createElement("div");
  right.className = c.type === "entrada" ? "tag-in" : "tag-out";
  right.textContent = (c.type === "entrada" ? "+ " : "- ") + money(c.value);
  item.appendChild(left);
  var actions = document.createElement("div");
  actions.className = "row-actions";
  actions.appendChild(right);
  if (canDelete && isAdmin()) {
    var del = document.createElement("button");
    del.className = "danger small"; del.textContent = "Excluir";
    del.onclick = function () {
      if (!confirm("Excluir esta movimentação?")) return;
      api("/api/cash/" + c.id, { method: "DELETE" }).then(loadCash).catch(function (e) { alert(e.message); });
    };
    actions.appendChild(del);
  }
  item.appendChild(actions);
  return item;
}

/* ---------- CLIENTES ---------- */
function resetClientForm() {
  document.getElementById("clientId").value = "";
  ["clientName","clientPhone","clientEmail","clientInstagram","clientAddress"].forEach(function (id) { document.getElementById(id).value = ""; });
  document.getElementById("clientFormTitle").textContent = "Cadastrar cliente";
  document.getElementById("cancelClient").classList.add("hidden");
}
document.getElementById("saveClient").onclick = function () {
  var id = document.getElementById("clientId").value;
  var body = {
    name: document.getElementById("clientName").value,
    phone: document.getElementById("clientPhone").value,
    email: document.getElementById("clientEmail").value,
    instagram: document.getElementById("clientInstagram").value,
    address: document.getElementById("clientAddress").value
  };
  var p = id ? api("/api/clients/" + id, { method: "PUT", body: JSON.stringify(body) })
             : api("/api/clients", { method: "POST", body: JSON.stringify(body) });
  p.then(function () { resetClientForm(); loadClients(); }).catch(function (e) { alert(e.message); });
};
document.getElementById("cancelClient").onclick = resetClientForm;
document.getElementById("clientSearch").oninput = loadClients;

function loadClients() {
  var q = document.getElementById("clientSearch").value;
  api("/api/clients?q=" + encodeURIComponent(q)).then(function (rows) {
    var box = document.getElementById("clientList");
    box.innerHTML = "";
    rows.forEach(function (c) {
      var item = document.createElement("div");
      item.className = "list-item";
      var left = document.createElement("div");
      left.innerHTML = "<strong>" + esc(c.name) + "</strong><br><small>" + esc([c.phone, c.instagram, c.email].filter(Boolean).join(" · ")) + "</small>";
      var actions = document.createElement("div");
      actions.className = "row-actions";
      var edit = document.createElement("button");
      edit.className = "ghost small"; edit.textContent = "Editar";
      edit.onclick = function () {
        document.getElementById("clientId").value = c.id;
        document.getElementById("clientName").value = c.name || "";
        document.getElementById("clientPhone").value = c.phone || "";
        document.getElementById("clientEmail").value = c.email || "";
        document.getElementById("clientInstagram").value = c.instagram || "";
        document.getElementById("clientAddress").value = c.address || "";
        document.getElementById("clientFormTitle").textContent = "Editar cliente";
        document.getElementById("cancelClient").classList.remove("hidden");
        window.scrollTo(0, 0);
      };
      actions.appendChild(edit);
      if (isAdmin()) {
        var del = document.createElement("button");
        del.className = "danger small"; del.textContent = "Excluir";
        del.onclick = function () {
          if (!confirm("Excluir o cliente " + c.name + "?")) return;
          api("/api/clients/" + c.id, { method: "DELETE" }).then(loadClients).catch(function (e) { alert(e.message); });
        };
        actions.appendChild(del);
      }
      item.appendChild(left); item.appendChild(actions);
      box.appendChild(item);
    });
    if (!rows.length) box.innerHTML = '<div class="muted">Nenhum cliente encontrado.</div>';
  }).catch(function (e) { alert(e.message); });
}

/* ---------- CAIXA ---------- */
document.getElementById("addCash").onclick = function () {
  var body = {
    type: document.getElementById("cashType").value,
    value: parseMoney(document.getElementById("cashValue").value),
    date: document.getElementById("cashDate").value || todayISO(),
    description: document.getElementById("cashDescription").value
  };
  api("/api/cash", { method: "POST", body: JSON.stringify(body) })
    .then(function () {
      document.getElementById("cashValue").value = "";
      document.getElementById("cashDescription").value = "";
      loadCash();
    })
    .catch(function (e) { alert(e.message); });
};

function loadCash() {
  api("/api/cash").then(function (rows) {
    var inn = 0, out = 0;
    var box = document.getElementById("cashList");
    box.innerHTML = "";
    rows.forEach(function (c) {
      if (c.type === "entrada") inn += c.value; else out += c.value;
      box.appendChild(cashItem(c, true));
    });
    document.getElementById("cashIn").textContent = money(inn);
    document.getElementById("cashOut").textContent = money(out);
    document.getElementById("cashBalance").textContent = money(inn - out);
    if (!rows.length) box.innerHTML = '<div class="muted">Nenhuma movimentação registrada.</div>';
  }).catch(function (e) { alert(e.message); });
}

/* ---------- RELATÓRIOS ---------- */
document.getElementById("repPeriod").onchange = loadReports;
document.getElementById("repType").onchange = loadReports;

function periodRange() {
  var p = document.getElementById("repPeriod").value;
  var t = todayISO();
  if (p === "today") return { from: t, to: t };
  if (p === "week") { var d = new Date(); d.setDate(d.getDate() - 6); return { from: d.toISOString().slice(0,10), to: t }; }
  if (p === "month") return { from: t.slice(0, 7) + "-01", to: t };
  return {};
}
var lastReport = [];
function loadReports() {
  var r = periodRange();
  var type = document.getElementById("repType").value;
  var qs = [];
  if (r.from) qs.push("from=" + r.from);
  if (r.to) qs.push("to=" + r.to);
  if (type !== "all") qs.push("type=" + type);
  api("/api/cash" + (qs.length ? "?" + qs.join("&") : "")).then(function (rows) {
    lastReport = rows;
    var inn = 0, out = 0;
    var box = document.getElementById("repList");
    box.innerHTML = "";
    rows.forEach(function (c) {
      if (c.type === "entrada") inn += c.value; else out += c.value;
      box.appendChild(cashItem(c, false));
    });
    document.getElementById("repIn").textContent = money(inn);
    document.getElementById("repOut").textContent = money(out);
    document.getElementById("repBalance").textContent = money(inn - out);
    if (!rows.length) box.innerHTML = '<div class="muted">Nenhuma movimentação no período.</div>';
  }).catch(function (e) { alert(e.message); });
}
document.getElementById("repExport").onclick = function () {
  var csv = "data;tipo;descricao;valor\n" + lastReport.map(function (c) {
    return [c.date, c.type, '"' + String(c.description || "").replace(/"/g, '""') + '"', String(c.value).replace(".", ",")].join(";");
  }).join("\n");
  var a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "relatorio-caixa.csv";
  a.click();
};

/* ---------- USUÁRIOS (admin) ---------- */
function resetUserForm() {
  document.getElementById("userId").value = "";
  ["userName","userUsername","userEmail","userPassword"].forEach(function (id) { document.getElementById(id).value = ""; });
  document.getElementById("userPhoto").value = "";
  PHOTO = "";
  document.getElementById("userFormTitle").textContent = "Novo usuário";
  document.getElementById("cancelUser").classList.add("hidden");
}
document.getElementById("saveUser").onclick = function () {
  var id = document.getElementById("userId").value;
  readPhoto(document.getElementById("userPhoto"), function (photo) {
    var body = {
      name: document.getElementById("userName").value,
      username: document.getElementById("userUsername").value,
      email: document.getElementById("userEmail").value,
      role: document.getElementById("userRole").value,
      photo: photo || PHOTO
    };
    var pw = document.getElementById("userPassword").value;
    if (pw) body.password = pw;
    var p = id ? api("/api/users/" + id, { method: "PUT", body: JSON.stringify(body) })
               : api("/api/users", { method: "POST", body: JSON.stringify(body) });
    p.then(function () { resetUserForm(); loadUsers(); }).catch(function (e) { alert(e.message); });
  });
};
document.getElementById("cancelUser").onclick = resetUserForm;

function loadUsers() {
  api("/api/users").then(function (rows) {
    var box = document.getElementById("userList");
    box.innerHTML = "";
    rows.forEach(function (u) {
      var item = document.createElement("div");
      item.className = "list-item user-row";
      var img = document.createElement("img");
      img.className = "avatar small"; img.src = avatar(u.photo);
      var left = document.createElement("div");
      left.innerHTML = "<strong>" + esc(u.name) + "</strong> <span class='role-badge " + u.role + "'>" +
        (u.role === "admin" ? "Administrador" : "Operador") + "</span><br><small>@" + esc(u.username) +
        (u.email ? " · " + esc(u.email) : "") + (u.active ? "" : " · desativado") + "</small>";
      var actions = document.createElement("div");
      actions.className = "row-actions";
      var edit = document.createElement("button");
      edit.className = "ghost small"; edit.textContent = "Editar";
      edit.onclick = function () {
        document.getElementById("userId").value = u.id;
        document.getElementById("userName").value = u.name;
        document.getElementById("userUsername").value = u.username;
        document.getElementById("userEmail").value = u.email || "";
        document.getElementById("userRole").value = u.role;
        document.getElementById("userPassword").value = "";
        PHOTO = u.photo || "";
        document.getElementById("userFormTitle").textContent = "Editar usuário";
        document.getElementById("cancelUser").classList.remove("hidden");
        window.scrollTo(0, 0);
      };
      actions.appendChild(edit);
      var toggle = document.createElement("button");
      toggle.className = "ghost small";
      toggle.textContent = u.active ? "Desativar" : "Ativar";
      toggle.onclick = function () {
        api("/api/users/" + u.id, { method: "PUT", body: JSON.stringify({ active: u.active ? 0 : 1 }) })
          .then(loadUsers).catch(function (e) { alert(e.message); });
      };
      actions.appendChild(toggle);
      if (u.id !== me.id) {
        var del = document.createElement("button");
        del.className = "danger small"; del.textContent = "Excluir";
        del.onclick = function () {
          if (!confirm("Excluir o usuário " + u.name + "?")) return;
          api("/api/users/" + u.id, { method: "DELETE" }).then(loadUsers).catch(function (e) { alert(e.message); });
        };
        actions.appendChild(del);
      }
      item.appendChild(img); item.appendChild(left); item.appendChild(actions);
      box.appendChild(item);
    });
    document.getElementById("meName").value = me.name || "";
    document.getElementById("meEmail").value = me.email || "";
  }).catch(function (e) { alert(e.message); });
}

document.getElementById("saveMe").onclick = function () {
  readPhoto(document.getElementById("mePhoto"), function (photo) {
    var body = {
      name: document.getElementById("meName").value,
      email: document.getElementById("meEmail").value,
      photo: photo || me.photo || ""
    };
    var pw = document.getElementById("mePassword").value;
    if (pw) body.password = pw;
    api("/api/me", { method: "PUT", body: JSON.stringify(body) })
      .then(function () { alert("Perfil atualizado!"); boot(); })
      .catch(function (e) { alert(e.message); });
  });
};

/* ---------- BACKUP (admin) ---------- */
document.getElementById("exportBackup").onclick = function () {
  api("/api/backup").then(function (d) {
    var a = document.createElement("a");
    a.href = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(d, null, 2));
    a.download = "backup-lola-" + todayISO() + ".json";
    a.click();
  }).catch(function (e) { alert(e.message); });
};
document.getElementById("importBackup").onchange = function () {
  if (!this.files || !this.files[0]) return;
  if (!confirm("Restaurar o backup? Os dados atuais serão substituídos.")) { this.value = ""; return; }
  var fr = new FileReader();
  fr.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      api("/api/backup", { method: "POST", body: JSON.stringify(data) })
        .then(function () { alert("Backup restaurado com sucesso!"); boot(); })
        .catch(function (err) { alert(err.message); });
    } catch (err) { alert("Arquivo de backup inválido."); }
  };
  fr.readAsText(this.files[0]);
  this.value = "";
};

/* ---------- INIT ---------- */
function boot() {
  api("/api/me").then(function (u) {
    me = u;
    document.getElementById("headerName").textContent = u.name;
    document.getElementById("headerEmail").textContent = u.email || "@" + u.username;
    document.getElementById("headerPhoto").src = avatar(u.photo);
    var rb = document.getElementById("headerRole");
    rb.textContent = u.role === "admin" ? "Administrador" : "Operador";
    rb.className = "role-badge " + u.role;
    document.getElementById("dashName").textContent = u.name;
    document.getElementById("cashDate").value = todayISO();
    buildNav();
    showApp();
    go("dashboard");
  }).catch(function () { doLogout(); });
}

if (token) boot(); else showLogin();
})();

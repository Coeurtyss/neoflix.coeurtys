const API = "/api";

function formatPrice(n) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

const loginScreen = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");

async function checkAuth() {
  try {
    const { authenticated } = await api("/admin/me");
    if (authenticated) {
      loginScreen.style.display = "none";
      dashboard.style.display = "block";
      initDashboard();
    } else {
      loginScreen.style.display = "flex";
      dashboard.style.display = "none";
    }
  } catch (e) {
    loginScreen.style.display = "flex";
  }
}

document.querySelector("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = document.querySelector("#login-form .form-note");
  const password = document.querySelector("#login-password").value;
  try {
    await api("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    note.style.color = "#15813F";
    note.textContent = "Connexion réussie.";
    checkAuth();
  } catch (err) {
    note.style.color = "#E0502F";
    note.textContent = err.message;
  }
});

document.querySelector("#logout-btn").addEventListener("click", async () => {
  await api("/admin/logout", { method: "POST" });
  checkAuth();
});

// ---------- dashboard ----------
let dashboardReady = false;

function initDashboard() {
  loadStats();
  loadOrders();
  loadProducts();
  if (dashboardReady) return;
  dashboardReady = true;

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#panel-${tab.dataset.tab}`).classList.add("active");
    });
  });

  document.querySelector("#refresh-orders").addEventListener("click", () => { loadOrders(); loadStats(); });
  document.querySelector("#add-product-btn").addEventListener("click", () => openProductModal());
  document.querySelector("#product-modal-close").addEventListener("click", closeProductModal);
  document.querySelector("#product-modal").addEventListener("click", (e) => {
    if (e.target.id === "product-modal") closeProductModal();
  });
  document.querySelector("#product-form").addEventListener("submit", onProductFormSubmit);
}

async function loadStats() {
  try {
    const s = await api("/stats");
    document.querySelector("#stat-orders").textContent = s.total_orders;
    document.querySelector("#stat-new").textContent = s.new_orders;
    document.querySelector("#stat-products").textContent = s.total_products;
  } catch (e) {}
}

// ---------- orders ----------
async function loadOrders() {
  const wrap = document.querySelector("#orders-table-wrap");
  wrap.innerHTML = "<p>Chargement…</p>";
  try {
    const { orders } = await api("/orders");
    if (!orders.length) {
      wrap.innerHTML = `<div class="empty-state">Aucune commande pour le moment. Les commandes passées depuis le site apparaîtront ici.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>#</th><th>Client</th><th>Téléphone</th><th>Produit</th><th>Prix</th><th>Statut</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${orders.map(orderRowHTML).join("")}
        </tbody>
      </table>`;
    wrap.querySelectorAll("select.admin-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        await api(`/orders/${sel.dataset.id}`, { method: "PATCH", body: JSON.stringify({ status: sel.value }) });
        loadStats();
      });
    });
    wrap.querySelectorAll(".delete-order").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Supprimer cette commande ?")) return;
        await api(`/orders/${btn.dataset.id}`, { method: "DELETE" });
        loadOrders();
        loadStats();
      });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state">Impossible de charger les commandes.</div>`;
  }
}

function orderRowHTML(o) {
  const statuses = ["nouveau", "confirmé", "livré", "annulé"];
  return `
    <tr>
      <td>#${o.id}</td>
      <td>${escapeHTML(o.customer_name)}</td>
      <td>${escapeHTML(o.phone)}</td>
      <td>${escapeHTML(o.product_name)}</td>
      <td>${o.price ? formatPrice(o.price) : "—"}</td>
      <td>
        <select class="admin-select status-${o.status}" data-id="${o.id}">
          ${statuses.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td>${o.created_at}</td>
      <td><button class="icon-btn delete-order" data-id="${o.id}" title="Supprimer">🗑️</button></td>
    </tr>`;
}

// ---------- products ----------
let productsCache = [];

async function loadProducts() {
  const wrap = document.querySelector("#products-table-wrap");
  wrap.innerHTML = "<p>Chargement…</p>";
  try {
    const { products } = await api("/products");
    productsCache = products;
    if (!products.length) {
      wrap.innerHTML = `<div class="empty-state">Aucun produit. Ajoutez votre premier article.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Vedette</th><th></th></tr></thead>
        <tbody>
          ${products.map(productRowHTML).join("")}
        </tbody>
      </table>`;
    wrap.querySelectorAll(".edit-product").forEach((btn) => {
      btn.addEventListener("click", () => openProductModal(productsCache.find((p) => p.id == btn.dataset.id)));
    });
    wrap.querySelectorAll(".delete-product").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Supprimer ce produit du catalogue ?")) return;
        await api(`/products/${btn.dataset.id}`, { method: "DELETE" });
        loadProducts();
        loadStats();
      });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state">Impossible de charger le catalogue.</div>`;
  }
}

const CAT_LABELS = { iphone: "iPhone", samsung: "Samsung", local: "Tecno / Infinix", accessoires: "Accessoires" };

function productRowHTML(p) {
  return `
    <tr>
      <td>${escapeHTML(p.name)}</td>
      <td>${CAT_LABELS[p.category] || p.category}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${p.featured ? "★ Oui" : "—"}</td>
      <td>
        <button class="icon-btn edit-product" data-id="${p.id}" title="Modifier">✏️</button>
        <button class="icon-btn delete-product" data-id="${p.id}" title="Supprimer">🗑️</button>
      </td>
    </tr>`;
}

function openProductModal(product = null) {
  const modal = document.querySelector("#product-modal");
  const form = document.querySelector("#product-form");
  form.querySelector(".form-note").textContent = "";
  document.querySelector("#product-modal-title").textContent = product ? "Modifier le produit" : "Ajouter un produit";
  document.querySelector("#product-modal-eyebrow").textContent = product ? "Modification" : "Nouveau produit";
  document.querySelector("#pf-id").value = product ? product.id : "";
  document.querySelector("#pf-name").value = product ? product.name : "";
  document.querySelector("#pf-category").value = product ? product.category : "iphone";
  document.querySelector("#pf-price").value = product ? product.price : "";
  document.querySelector("#pf-badge").value = product ? product.badge || "" : "";
  document.querySelector("#pf-specs").value = product ? product.specs || "" : "";
  document.querySelector("#pf-color").value = product ? product.color || "ph-1" : "ph-1";
  document.querySelector("#pf-featured").checked = product ? !!product.featured : false;
  modal.classList.add("show");
}

function closeProductModal() {
  document.querySelector("#product-modal").classList.remove("show");
}

async function onProductFormSubmit(e) {
  e.preventDefault();
  const note = document.querySelector("#product-form .form-note");
  const id = document.querySelector("#pf-id").value;
  const payload = {
    name: document.querySelector("#pf-name").value.trim(),
    category: document.querySelector("#pf-category").value,
    price: Number(document.querySelector("#pf-price").value),
    badge: document.querySelector("#pf-badge").value,
    specs: document.querySelector("#pf-specs").value.trim(),
    color: document.querySelector("#pf-color").value,
    featured: document.querySelector("#pf-featured").checked,
  };
  try {
    if (id) {
      await api(`/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await api("/products", { method: "POST", body: JSON.stringify(payload) });
    }
    closeProductModal();
    loadProducts();
    loadStats();
  } catch (err) {
    note.style.color = "#E0502F";
    note.textContent = err.message;
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

checkAuth();

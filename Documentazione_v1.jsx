import { useState, useCallback, useMemo } from "react";

/* ─── BRAND CONFIG ─── */
const BRANDS = [
  { id: "windtre", name: "WindTre", color: "#FF6B00", icon: "📶", accent: "#FF8C33" },
  { id: "vodafone_fastweb", name: "Vodafone / Fastweb", color: "#E60000", icon: "📡", accent: "#FF3333" },
  { id: "sky", name: "Sky", color: "#0072C9", icon: "📺", accent: "#3399DD" },
  { id: "energia", name: "Energia", color: "#00A651", icon: "⚡", accent: "#33C474" },
];

const CATEGORIES = [
  { id: "canvass", name: "Canvass Attuale", icon: "📋", desc: "Offerte e listini aggiornati" },
  { id: "modulistica", name: "Modulistica Utile", icon: "📝", desc: "Moduli compilabili e template" },
  { id: "operativa", name: "Documentazione Operativa", icon: "📂", desc: "Procedure, guide e manuali" },
];

/* ─── MOCK DOCUMENTS ─── */
const MOCK_DOCS = {
  windtre: {
    canvass: [
      { id: 1, name: "Canvass Consumer Marzo 2026", type: "pdf", size: "2.4 MB", date: "01/03/2026", fillable: false },
      { id: 2, name: "Canvass Business Marzo 2026", type: "pdf", size: "3.1 MB", date: "01/03/2026", fillable: false },
      { id: 3, name: "Listino Accessori Q1 2026", type: "pdf", size: "1.8 MB", date: "15/01/2026", fillable: false },
    ],
    modulistica: [
      { id: 4, name: "Modulo Recesso", type: "pdf", size: "180 KB", date: "10/02/2026", fillable: true },
      { id: 5, name: "Modulo Cambio Intestatario", type: "pdf", size: "210 KB", date: "10/02/2026", fillable: true },
      { id: 6, name: "Modulo Reclamo", type: "pdf", size: "150 KB", date: "05/01/2026", fillable: true },
    ],
    operativa: [
      { id: 7, name: "Guida Attivazione MNP", type: "pdf", size: "850 KB", date: "20/02/2026", fillable: false },
      { id: 8, name: "Procedura Verifica Credito", type: "pdf", size: "420 KB", date: "15/02/2026", fillable: false },
      { id: 9, name: "Manuale CRM Agenti", type: "pdf", size: "5.2 MB", date: "01/01/2026", fillable: false },
    ],
  },
  vodafone_fastweb: {
    canvass: [
      { id: 10, name: "Canvass Vodafone Consumer Marzo 2026", type: "pdf", size: "2.8 MB", date: "01/03/2026", fillable: false },
      { id: 11, name: "Canvass Fastweb Casa Marzo 2026", type: "pdf", size: "1.9 MB", date: "01/03/2026", fillable: false },
    ],
    modulistica: [
      { id: 12, name: "Modulo Migrazione Vodafone-Fastweb", type: "pdf", size: "290 KB", date: "15/02/2026", fillable: true },
      { id: 13, name: "Modulo SDD Bancario", type: "pdf", size: "175 KB", date: "10/01/2026", fillable: true },
    ],
    operativa: [
      { id: 14, name: "Guida Convergenza Fisso-Mobile", type: "pdf", size: "1.1 MB", date: "01/02/2026", fillable: false },
      { id: 15, name: "Troubleshooting Linea Fissa", type: "pdf", size: "680 KB", date: "20/01/2026", fillable: false },
    ],
  },
  sky: {
    canvass: [
      { id: 16, name: "Canvass Sky TV Marzo 2026", type: "pdf", size: "3.5 MB", date: "01/03/2026", fillable: false },
      { id: 17, name: "Canvass Sky WiFi Marzo 2026", type: "pdf", size: "2.0 MB", date: "01/03/2026", fillable: false },
    ],
    modulistica: [
      { id: 18, name: "Modulo Attivazione Sky Q", type: "pdf", size: "320 KB", date: "01/02/2026", fillable: true },
      { id: 19, name: "Modulo Recesso Sky", type: "pdf", size: "190 KB", date: "15/01/2026", fillable: true },
    ],
    operativa: [
      { id: 20, name: "Guida Installazione Sky Glass", type: "pdf", size: "4.2 MB", date: "01/03/2026", fillable: false },
    ],
  },
  energia: {
    canvass: [
      { id: 21, name: "Canvass Luce Marzo 2026", type: "pdf", size: "1.6 MB", date: "01/03/2026", fillable: false },
      { id: 22, name: "Canvass Gas Marzo 2026", type: "pdf", size: "1.4 MB", date: "01/03/2026", fillable: false },
    ],
    modulistica: [
      { id: 23, name: "Modulo Voltura", type: "pdf", size: "250 KB", date: "10/02/2026", fillable: true },
      { id: 24, name: "Modulo Subentro", type: "pdf", size: "230 KB", date: "10/02/2026", fillable: true },
    ],
    operativa: [
      { id: 25, name: "Guida Lettura Bolletta", type: "pdf", size: "980 KB", date: "01/01/2026", fillable: false },
    ],
  },
};

/* ─── STYLES ─── */
const S = {
  page: { fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif", background: "#f0f2f5", minHeight: "100vh", color: "#1a1a2e" },
  header: { background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" },
  headerSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 },
  body: { maxWidth: 1200, margin: "0 auto", padding: "24px 20px" },
  breadcrumb: { display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontSize: 14, color: "#6b7280", flexWrap: "wrap" },
  breadLink: { color: "#3b82f6", cursor: "pointer", textDecoration: "none", fontWeight: 500 },
  breadSep: { color: "#d1d5db", userSelect: "none" },
  breadCurrent: { color: "#1a1a2e", fontWeight: 600 },

  /* Brand cards */
  brandGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 },
  brandCard: (color) => ({
    background: "#fff",
    borderRadius: 16,
    padding: "32px 28px",
    cursor: "pointer",
    border: "2px solid transparent",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    transition: "all 0.25s ease",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    textAlign: "center",
  }),
  brandStripe: (color) => ({
    position: "absolute", top: 0, left: 0, right: 0, height: 5, background: color,
  }),
  brandIcon: { fontSize: 48, marginBottom: 4 },
  brandName: { fontSize: 20, fontWeight: 700, color: "#1a1a2e" },
  brandCount: (color) => ({ fontSize: 13, color: color, fontWeight: 600 }),

  /* Category cards */
  catGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 },
  catCard: (brandColor) => ({
    background: "#fff",
    borderRadius: 14,
    padding: "28px 24px",
    cursor: "pointer",
    border: "2px solid #e5e7eb",
    boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
  }),
  catIcon: { fontSize: 36, flexShrink: 0 },
  catName: { fontSize: 17, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 },
  catDesc: { fontSize: 13, color: "#6b7280", lineHeight: 1.4 },
  catBadge: (color) => ({
    display: "inline-block",
    marginTop: 8,
    background: color + "18",
    color: color,
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 20,
  }),

  /* Document list */
  docTable: { width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
  docTh: { textAlign: "left", padding: "14px 18px", background: "#f8fafc", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e5e7eb" },
  docTd: { padding: "14px 18px", borderBottom: "1px solid #f0f0f0", fontSize: 14, color: "#374151", verticalAlign: "middle" },
  docName: { fontWeight: 600, color: "#1a1a2e" },
  badge: (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg }),
  actionBtn: (color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "6px 14px", borderRadius: 8, border: "none",
    background: color + "14", color: color, fontSize: 13,
    fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
    marginRight: 6,
  }),

  /* Admin */
  adminBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  uploadBtn: (color) => ({
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "10px 22px", borderRadius: 10, border: "none",
    background: color, color: "#fff", fontSize: 14, fontWeight: 700,
    cursor: "pointer", boxShadow: "0 2px 8px " + color + "40",
    transition: "all 0.2s",
  }),
  toggleBtn: (active) => ({
    padding: "8px 18px", borderRadius: 8,
    border: active ? "2px solid #3b82f6" : "2px solid #e5e7eb",
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#3b82f6" : "#6b7280",
    fontWeight: 600, fontSize: 13, cursor: "pointer",
    transition: "all 0.15s",
  }),

  /* Modal */
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHead: (color) => ({ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", background: color + "08" }),
  modalTitle: { fontSize: 18, fontWeight: 700, color: "#1a1a2e" },
  modalBody: { padding: 24 },
  modalClose: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", fontWeight: 700, lineHeight: 1 },

  /* Form fields */
  fieldGroup: { marginBottom: 18 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border 0.15s" },
  select: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" },
  textarea: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 80 },

  /* Preview */
  previewBox: { background: "#f8fafc", borderRadius: 12, border: "2px dashed #d1d5db", padding: 40, textAlign: "center", color: "#9ca3af", marginBottom: 16 },
  previewPdf: { background: "#1a1a2e", borderRadius: 12, height: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", gap: 12 },

  /* Fillable form */
  fillCard: { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.04)" },

  /* Empty state */
  emptyState: { textAlign: "center", padding: "60px 20px", color: "#9ca3af" },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: 600, color: "#6b7280" },
  emptySub: { fontSize: 13, marginTop: 4 },
};

/* ─── HELPERS ─── */
function getBrand(id) { return BRANDS.find(function(b) { return b.id === id; }); }
function getCat(id) { return CATEGORIES.find(function(c) { return c.id === id; }); }
function getDocs(brandId, catId) { return (MOCK_DOCS[brandId] && MOCK_DOCS[brandId][catId]) || []; }
function getTotalDocs(brandId) {
  var total = 0;
  CATEGORIES.forEach(function(c) { total += getDocs(brandId, c.id).length; });
  return total;
}

/* ─── COMPONENTS ─── */

/* Brand Selection (landing) */
function BrandGrid(props) {
  var onSelect = props.onSelect;
  return (
    React.createElement("div", null,
      React.createElement("div", { style: { marginBottom: 24 } },
        React.createElement("h2", { style: { fontSize: 24, fontWeight: 800, color: "#1a1a2e", margin: 0 } }, "Documentazione"),
        React.createElement("p", { style: { color: "#6b7280", fontSize: 14, marginTop: 6 } }, "Seleziona un brand per visualizzare la documentazione disponibile")
      ),
      React.createElement("div", { style: S.brandGrid },
        BRANDS.map(function(brand) {
          var count = getTotalDocs(brand.id);
          return React.createElement("div", {
            key: brand.id,
            style: S.brandCard(brand.color),
            onClick: function() { onSelect(brand.id); },
            onMouseEnter: function(e) { e.currentTarget.style.borderColor = brand.color; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px " + brand.color + "20"; },
            onMouseLeave: function(e) { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; },
          },
            React.createElement("div", { style: S.brandStripe(brand.color) }),
            React.createElement("div", { style: S.brandIcon }, brand.icon),
            React.createElement("div", { style: S.brandName }, brand.name),
            React.createElement("div", { style: S.brandCount(brand.color) }, count + " documenti")
          );
        })
      )
    )
  );
}

/* Category Selection */
function CategoryGrid(props) {
  var brandId = props.brandId;
  var onSelect = props.onSelect;
  var brand = getBrand(brandId);
  return (
    React.createElement("div", null,
      React.createElement("div", { style: { marginBottom: 24 } },
        React.createElement("h2", { style: { fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: 0 } },
          React.createElement("span", { style: { color: brand.color } }, brand.name),
          " — Categorie"
        )
      ),
      React.createElement("div", { style: S.catGrid },
        CATEGORIES.map(function(cat) {
          var docs = getDocs(brandId, cat.id);
          return React.createElement("div", {
            key: cat.id,
            style: S.catCard(brand.color),
            onClick: function() { onSelect(cat.id); },
            onMouseEnter: function(e) { e.currentTarget.style.borderColor = brand.color; e.currentTarget.style.transform = "translateY(-2px)"; },
            onMouseLeave: function(e) { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.transform = "translateY(0)"; },
          },
            React.createElement("div", { style: S.catIcon }, cat.icon),
            React.createElement("div", null,
              React.createElement("div", { style: S.catName }, cat.name),
              React.createElement("div", { style: S.catDesc }, cat.desc),
              React.createElement("div", { style: S.catBadge(brand.color) }, docs.length + " documenti")
            )
          );
        })
      )
    )
  );
}

/* Document List */
function DocList(props) {
  var brandId = props.brandId;
  var catId = props.catId;
  var isAdmin = props.isAdmin;
  var onPreview = props.onPreview;
  var onFill = props.onFill;
  var onUpload = props.onUpload;
  var onAdminAction = props.onAdminAction;
  var brand = getBrand(brandId);
  var cat = getCat(catId);
  var docs = getDocs(brandId, catId);

  if (docs.length === 0) {
    return React.createElement("div", { style: S.emptyState },
      React.createElement("div", { style: S.emptyIcon }, "📭"),
      React.createElement("div", { style: S.emptyText }, "Nessun documento disponibile"),
      React.createElement("div", { style: S.emptySub }, "Questa categoria non contiene ancora documenti."),
      isAdmin && React.createElement("button", {
        style: Object.assign({}, S.uploadBtn(brand.color), { marginTop: 16 }),
        onClick: onUpload,
      }, "＋ Carica Documento")
    );
  }

  return React.createElement("div", null,
    React.createElement("div", { style: S.adminBar },
      React.createElement("div", null,
        React.createElement("h2", { style: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", margin: 0 } },
          React.createElement("span", { style: { color: brand.color } }, cat.name)
        ),
        React.createElement("p", { style: { color: "#6b7280", fontSize: 13, margin: "4px 0 0" } }, docs.length + " documenti disponibili")
      ),
      isAdmin && React.createElement("button", {
        style: S.uploadBtn(brand.color),
        onClick: onUpload,
      }, "＋ Carica Documento")
    ),
    React.createElement("table", { style: S.docTable },
      React.createElement("thead", null,
        React.createElement("tr", null,
          React.createElement("th", { style: S.docTh }, "Documento"),
          React.createElement("th", { style: Object.assign({}, S.docTh, { width: 90 }) }, "Formato"),
          React.createElement("th", { style: Object.assign({}, S.docTh, { width: 90 }) }, "Dim."),
          React.createElement("th", { style: Object.assign({}, S.docTh, { width: 110 }) }, "Aggiornato"),
          React.createElement("th", { style: Object.assign({}, S.docTh, { width: isAdmin ? 320 : 220, textAlign: "right" }) }, "Azioni")
        )
      ),
      React.createElement("tbody", null,
        docs.map(function(doc) {
          return React.createElement("tr", { key: doc.id,
            onMouseEnter: function(e) { e.currentTarget.style.background = "#fafbfc"; },
            onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; },
          },
            React.createElement("td", { style: S.docTd },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement("span", { style: { fontSize: 20 } }, "📄"),
                React.createElement("span", { style: S.docName }, doc.name),
                doc.fillable && React.createElement("span", { style: S.badge("#eff6ff", "#3b82f6") }, "Compilabile")
              )
            ),
            React.createElement("td", { style: S.docTd },
              React.createElement("span", { style: S.badge("#fef3c7", "#d97706") }, doc.type.toUpperCase())
            ),
            React.createElement("td", { style: Object.assign({}, S.docTd, { color: "#6b7280", fontSize: 13 }) }, doc.size),
            React.createElement("td", { style: Object.assign({}, S.docTd, { color: "#6b7280", fontSize: 13 }) }, doc.date),
            React.createElement("td", { style: Object.assign({}, S.docTd, { textAlign: "right" }) },
              React.createElement("button", { style: S.actionBtn("#3b82f6"), onClick: function() { onPreview(doc); } }, "👁 Anteprima"),
              React.createElement("button", { style: S.actionBtn("#10b981") }, "⬇ Scarica"),
              doc.fillable && React.createElement("button", { style: S.actionBtn("#8b5cf6"), onClick: function() { onFill(doc); } }, "✏️ Compila"),
              isAdmin && React.createElement("button", { style: S.actionBtn("#ef4444"), onClick: function() { onAdminAction(doc, "delete"); } }, "🗑"),
              isAdmin && React.createElement("button", { style: S.actionBtn("#f59e0b"), onClick: function() { onAdminAction(doc, "rename"); } }, "✏️")
            )
          );
        })
      )
    )
  );
}

/* Preview Modal */
function PreviewModal(props) {
  var doc = props.doc;
  var onClose = props.onClose;
  var brand = props.brand;
  if (!doc) return null;
  return React.createElement("div", { style: S.overlay, onClick: onClose },
    React.createElement("div", { style: Object.assign({}, S.modal, { maxWidth: 700 }), onClick: function(e) { e.stopPropagation(); } },
      React.createElement("div", { style: S.modalHead(brand.color) },
        React.createElement("div", { style: S.modalTitle }, doc.name),
        React.createElement("button", { style: S.modalClose, onClick: onClose }, "✕")
      ),
      React.createElement("div", { style: S.modalBody },
        React.createElement("div", { style: S.previewPdf },
          React.createElement("span", { style: { fontSize: 56 } }, "📄"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 700 } }, "Anteprima PDF"),
          React.createElement("div", { style: { fontSize: 13, opacity: 0.6 } }, doc.name),
          React.createElement("div", { style: { fontSize: 12, opacity: 0.4, marginTop: 8 } }, "Qui verrà renderizzato il PDF con react-pdf"),
          React.createElement("button", {
            style: Object.assign({}, S.uploadBtn("#fff"), { color: "#1a1a2e", marginTop: 16 }),
          }, "⬇ Scarica Documento")
        )
      )
    )
  );
}

/* Fillable Form Modal */
function FillableModal(props) {
  var doc = props.doc;
  var onClose = props.onClose;
  var brand = props.brand;
  if (!doc) return null;

  var mockFields = [
    { key: "nome", label: "Nome", type: "text" },
    { key: "cognome", label: "Cognome", type: "text" },
    { key: "cf", label: "Codice Fiscale", type: "text" },
    { key: "indirizzo", label: "Indirizzo", type: "text" },
    { key: "citta", label: "Città", type: "text" },
    { key: "telefono", label: "Telefono", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "note", label: "Note aggiuntive", type: "textarea" },
  ];

  return React.createElement("div", { style: S.overlay, onClick: onClose },
    React.createElement("div", { style: S.modal, onClick: function(e) { e.stopPropagation(); } },
      React.createElement("div", { style: S.modalHead(brand.color) },
        React.createElement("div", null,
          React.createElement("div", { style: S.modalTitle }, "Compila Modulo"),
          React.createElement("div", { style: { fontSize: 13, color: "#6b7280", marginTop: 2 } }, doc.name)
        ),
        React.createElement("button", { style: S.modalClose, onClick: onClose }, "✕")
      ),
      React.createElement("div", { style: S.modalBody },
        React.createElement("div", { style: { background: brand.color + "10", border: "1px solid " + brand.color + "30", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: brand.color, fontWeight: 600 } },
          "💡 I campi verranno pre-compilati con i dati del cliente se disponibili in anagrafica."
        ),
        mockFields.map(function(f) {
          return React.createElement("div", { key: f.key, style: S.fieldGroup },
            React.createElement("label", { style: S.label }, f.label),
            f.type === "textarea"
              ? React.createElement("textarea", { style: S.textarea, placeholder: "Inserisci " + f.label.toLowerCase() })
              : React.createElement("input", { style: S.input, type: "text", placeholder: "Inserisci " + f.label.toLowerCase() })
          );
        }),
        React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" } },
          React.createElement("button", {
            style: Object.assign({}, S.uploadBtn("#6b7280"), { boxShadow: "none" }),
            onClick: onClose,
          }, "Annulla"),
          React.createElement("button", {
            style: S.uploadBtn(brand.color),
          }, "📥 Esporta PDF Compilato")
        )
      )
    )
  );
}

/* Upload Modal (Admin) */
function UploadModal(props) {
  var onClose = props.onClose;
  var brand = props.brand;
  var catId = props.catId;
  if (!brand) return null;
  return React.createElement("div", { style: S.overlay, onClick: onClose },
    React.createElement("div", { style: S.modal, onClick: function(e) { e.stopPropagation(); } },
      React.createElement("div", { style: S.modalHead(brand.color) },
        React.createElement("div", { style: S.modalTitle }, "Carica Documento"),
        React.createElement("button", { style: S.modalClose, onClick: onClose }, "✕")
      ),
      React.createElement("div", { style: S.modalBody },
        React.createElement("div", { style: S.fieldGroup },
          React.createElement("label", { style: S.label }, "Nome Documento"),
          React.createElement("input", { style: S.input, type: "text", placeholder: "es. Canvass Consumer Aprile 2026" })
        ),
        React.createElement("div", { style: S.fieldGroup },
          React.createElement("label", { style: S.label }, "Categoria"),
          React.createElement("select", { style: S.select, defaultValue: catId },
            CATEGORIES.map(function(c) {
              return React.createElement("option", { key: c.id, value: c.id }, c.name);
            })
          )
        ),
        React.createElement("div", { style: S.fieldGroup },
          React.createElement("label", { style: S.label }, "Tipo Documento"),
          React.createElement("select", { style: S.select },
            React.createElement("option", { value: "flat" }, "PDF statico (sola lettura)"),
            React.createElement("option", { value: "fillable" }, "PDF compilabile (con campi)")
          )
        ),
        React.createElement("div", { style: S.fieldGroup },
          React.createElement("label", { style: S.label }, "File"),
          React.createElement("div", { style: S.previewBox },
            React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "📎"),
            React.createElement("div", { style: { fontWeight: 600, color: "#6b7280" } }, "Trascina un file o clicca per selezionare"),
            React.createElement("div", { style: { fontSize: 12, marginTop: 4 } }, "PDF, massimo 25 MB")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "flex-end" } },
          React.createElement("button", {
            style: Object.assign({}, S.uploadBtn("#6b7280"), { boxShadow: "none" }),
            onClick: onClose,
          }, "Annulla"),
          React.createElement("button", { style: S.uploadBtn(brand.color) }, "⬆ Carica")
        )
      )
    )
  );
}

/* Admin Action Modal (rename/delete) */
function AdminActionModal(props) {
  var doc = props.doc;
  var action = props.action;
  var onClose = props.onClose;
  var brand = props.brand;
  if (!doc || !action) return null;

  if (action === "delete") {
    return React.createElement("div", { style: S.overlay, onClick: onClose },
      React.createElement("div", { style: Object.assign({}, S.modal, { maxWidth: 440 }), onClick: function(e) { e.stopPropagation(); } },
        React.createElement("div", { style: S.modalHead("#ef4444") },
          React.createElement("div", { style: S.modalTitle }, "Conferma Eliminazione"),
          React.createElement("button", { style: S.modalClose, onClick: onClose }, "✕")
        ),
        React.createElement("div", { style: S.modalBody },
          React.createElement("p", { style: { fontSize: 14, color: "#374151", lineHeight: 1.6 } },
            "Sei sicuro di voler eliminare il documento ",
            React.createElement("strong", null, doc.name),
            "? Questa azione non può essere annullata."
          ),
          React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 } },
            React.createElement("button", {
              style: Object.assign({}, S.uploadBtn("#6b7280"), { boxShadow: "none" }),
              onClick: onClose,
            }, "Annulla"),
            React.createElement("button", { style: S.uploadBtn("#ef4444") }, "🗑 Elimina")
          )
        )
      )
    );
  }

  return React.createElement("div", { style: S.overlay, onClick: onClose },
    React.createElement("div", { style: Object.assign({}, S.modal, { maxWidth: 440 }), onClick: function(e) { e.stopPropagation(); } },
      React.createElement("div", { style: S.modalHead(brand.color) },
        React.createElement("div", { style: S.modalTitle }, "Rinomina Documento"),
        React.createElement("button", { style: S.modalClose, onClick: onClose }, "✕")
      ),
      React.createElement("div", { style: S.modalBody },
        React.createElement("div", { style: S.fieldGroup },
          React.createElement("label", { style: S.label }, "Nuovo Nome"),
          React.createElement("input", { style: S.input, type: "text", defaultValue: doc.name })
        ),
        React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 } },
          React.createElement("button", {
            style: Object.assign({}, S.uploadBtn("#6b7280"), { boxShadow: "none" }),
            onClick: onClose,
          }, "Annulla"),
          React.createElement("button", { style: S.uploadBtn(brand.color) }, "✓ Salva")
        )
      )
    )
  );
}

/* ─── MAIN APP ─── */
export default function Documentazione() {
  var _nav = useState(null);
  var brandId = _nav[0];
  var setBrandId = _nav[1];

  var _cat = useState(null);
  var catId = _cat[0];
  var setCatId = _cat[1];

  var _admin = useState(false);
  var isAdmin = _admin[0];
  var setIsAdmin = _admin[1];

  var _preview = useState(null);
  var previewDoc = _preview[0];
  var setPreviewDoc = _preview[1];

  var _fill = useState(null);
  var fillDoc = _fill[0];
  var setFillDoc = _fill[1];

  var _upload = useState(false);
  var showUpload = _upload[0];
  var setShowUpload = _upload[1];

  var _adminAct = useState(null);
  var adminAct = _adminAct[0];
  var setAdminAct = _adminAct[1];

  var brand = brandId ? getBrand(brandId) : null;

  var goHome = useCallback(function() { setBrandId(null); setCatId(null); }, []);
  var goBrand = useCallback(function(id) { setBrandId(id); setCatId(null); }, []);

  /* Breadcrumb */
  var crumbs = [];
  crumbs.push(React.createElement("span", { key: "home", style: brandId ? S.breadLink : S.breadCurrent, onClick: brandId ? goHome : undefined }, "📁 Documentazione"));
  if (brand) {
    crumbs.push(React.createElement("span", { key: "s1", style: S.breadSep }, "›"));
    crumbs.push(React.createElement("span", { key: "brand", style: catId ? S.breadLink : S.breadCurrent, onClick: catId ? function() { setCatId(null); } : undefined }, brand.name));
  }
  if (catId) {
    var cat = getCat(catId);
    crumbs.push(React.createElement("span", { key: "s2", style: S.breadSep }, "›"));
    crumbs.push(React.createElement("span", { key: "cat", style: S.breadCurrent }, cat.name));
  }

  return React.createElement("div", { style: S.page },
    /* Header */
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h1", { style: S.headerTitle }, "Telefutura CRM"),
        React.createElement("div", { style: S.headerSub }, "Sezione Documentazione")
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
        React.createElement("button", {
          style: S.toggleBtn(isAdmin),
          onClick: function() { setIsAdmin(!isAdmin); },
        }, isAdmin ? "🔓 Modalità Admin" : "🔒 Modalità Utente"),
        brandId && React.createElement("button", {
          style: Object.assign({}, S.toggleBtn(false), { border: "2px solid #e5e7eb" }),
          onClick: goHome,
        }, "← Tutti i Brand")
      )
    ),

    /* Body */
    React.createElement("div", { style: S.body },
      React.createElement("div", { style: S.breadcrumb }, crumbs),

      /* Pages */
      !brandId && React.createElement(BrandGrid, { onSelect: goBrand }),

      brandId && !catId && React.createElement(CategoryGrid, { brandId: brandId, onSelect: function(id) { setCatId(id); } }),

      brandId && catId && React.createElement(DocList, {
        brandId: brandId,
        catId: catId,
        isAdmin: isAdmin,
        onPreview: function(d) { setPreviewDoc(d); },
        onFill: function(d) { setFillDoc(d); },
        onUpload: function() { setShowUpload(true); },
        onAdminAction: function(d, act) { setAdminAct({ doc: d, action: act }); },
      })
    ),

    /* Modals */
    previewDoc && React.createElement(PreviewModal, { doc: previewDoc, brand: brand, onClose: function() { setPreviewDoc(null); } }),
    fillDoc && React.createElement(FillableModal, { doc: fillDoc, brand: brand, onClose: function() { setFillDoc(null); } }),
    showUpload && React.createElement(UploadModal, { brand: brand, catId: catId, onClose: function() { setShowUpload(false); } }),
    adminAct && React.createElement(AdminActionModal, {
      doc: adminAct.doc,
      action: adminAct.action,
      brand: brand,
      onClose: function() { setAdminAct(null); },
    })
  );
}

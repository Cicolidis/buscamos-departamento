const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDGdZ1i6WeByjW13RgMvYjpMV5vQyiymNE",
  authDomain: "deptos-laura-camilo.firebaseapp.com",
  projectId: "deptos-laura-camilo",
  storageBucket: "deptos-laura-camilo.firebasestorage.app",
  messagingSenderId: "705629944207",
  appId: "1:705629944207:web:d5680bc1f3725d530673fa"
};

const USUARIOS = ["Juju", "Laura Beat"];

const KANBAN_COLS = [
  { id: "por_visitar", label: "Por visitar", accent: "#64748b" },
  { id: "visitado",    label: "Visitado",    accent: "#3b82f6" },
  { id: "favorito",    label: "Favorito",    accent: "#f5b301" },
  { id: "descartado",  label: "Descartado",  accent: "#f43f5e" },
];

const ESTADOS = ["Sin contactar", "Contactado", "Turno agendado", "Visitado"];
const ESTADO_COLOR = {
  "Sin contactar": "#64748b",
  "Contactado":    "#3b82f6",
  "Turno agendado":"#f5b301",
  "Visitado":      "#22c55e",
};

/* ============================================================
   FIREBASE
   ============================================================ */
let db = null, dbError = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (e) {
  dbError = e.message || String(e);
}
const COL = () => db.collection("departamentos");
const ts = () => firebase.firestore.FieldValue.serverTimestamp();

/* ============================================================
   HELPERS
   ============================================================ */
const emptyDepto = () => ({
  url_zonaprop: "", titulo: "", ubicacion: "",
  precio_alquiler: 0, moneda_alquiler: "ARS", expensas: 0,
  ambientes: 0, superficie_cubierta: 0, superficie_total: 0, piso: "",
  descripcion: "", contacto_nombre: "", contacto_telefono: "", contacto_email: "",
  fotos: [], video_url: "",
  estado_contacto: "Sin contactar", fecha_publicacion: "",
  ventajas: [], desventajas: [], estrellas: 0, notas_visita: "",
  columna_kanban: "por_visitar",
});

const num = (v) => { const n = Number(String(v).replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; };

function fmtMoney(v, moneda) {
  if (v == null || v === "" || isNaN(v)) return "—";
  const s = Number(v).toLocaleString("es-AR");
  return (moneda === "USD" ? "US$ " : "$ ") + s;
}

function fmtDate(t) {
  if (!t) return "—";
  try {
    const d = t.toDate ? t.toDate() : new Date(t);
    return d.toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" }) +
      " " + d.toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit" });
  } catch { return "—"; }
}

function youtubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? "https://www.youtube.com/embed/" + m[1] : null;
}

/* ============================================================
   PARSEO VÍA WORKER DE CLOUDFLARE (producción)
   ============================================================ */
const WORKER_URL = "https://deptos-parser.camilogovz.workers.dev";
const APP_TOKEN  = "f8ed5a9778dc1d445b5c937012e7d5585d3341cbf5b1b99b9ac2f6eddfeffc61";

async function parsearContenido(contenido) {
  const headers = { "Content-Type": "application/json" };
  if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;

  const resp = await fetch(WORKER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ contenido }),
  });

  if (!resp.ok) {
    let msg = "El parser respondió " + resp.status;
    try { const e = await resp.json(); if (e.error) msg += " · " + e.error; } catch {}
    throw new Error(msg + ". Revisá el contenido pegado o cargá el aviso a mano.");
  }
  return await resp.json();
}

/* ============================================================
   COMPONENTES UI BÁSICOS
   ============================================================ */
function Stars({ value, onChange, size = 16 }) {
  // value 0..3; 0 = sin valorar (vacío)
  return (
    <span className="inline-flex items-center gap-0.5">
      {value === 0 && !onChange && <span style={{color:"var(--muted)", fontSize:size}}>—</span>}
      {[1,2,3].map(i => (
        <span
          key={i}
          onClick={onChange ? (e)=>{ e.stopPropagation(); onChange(value === i && i === 1 ? 0 : i); } : undefined}
          style={{
            cursor: onChange ? "pointer" : "default",
            fontSize: size,
            color: i <= value ? "var(--amber)" : "#3a3f4b",
            lineHeight: 1,
          }}
          title={onChange ? (i + " estrella" + (i>1?"s":"")) : undefined}
        >★</span>
      ))}
      {onChange && (
        <button onClick={(e)=>{e.stopPropagation(); onChange(0);}}
          className="ml-2 text-[11px] text-slate-500 hover:text-slate-300">limpiar</button>
      )}
    </span>
  );
}

function Badge({ text, color }) {
  return (
    <span style={{ background: color + "22", color, border: "1px solid " + color + "55" }}
      className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap">{text}</span>
  );
}

// Input numérico con separador de miles es-AR (450000 → "450.000").
// allowEmpty: si está vacío guarda "" (para filtros); si no, guarda 0.
function NumeroInput({ value, onChange, allowEmpty = false, placeholder, className }) {
  const display = !Number(value) ? "" : Number(value).toLocaleString("es-AR");
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits === "" ? (allowEmpty ? "" : 0) : Number(digits));
  };
  return (
    <input type="text" inputMode="numeric" value={display} onChange={handle}
      placeholder={placeholder} className={className} />
  );
}

// Campo de formulario estable (definido a nivel de módulo, NO dentro de un render,
// para que el input no se desmonte en cada tecla y no pierda el foco).
function Campo({ label, value, onChange, type = "text", span = 1, placeholder }) {
  return (
    <div className={span === 2 ? "md:col-span-2" : ""}>
      <label>{label}</label>
      {type === "number"
        ? <NumeroInput value={value} onChange={onChange} placeholder={placeholder} />
        : <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

// Botones de una ficha: abrir el aviso de ZonaProp en pestaña nueva y copiar su enlace.
// No se muestra si la ficha no tiene URL. Frena la propagación para no abrir el detalle.
function AccionesZonaProp({ url }) {
  const [copiado, setCopiado] = useState(false);
  if (!url) return null;

  const abrir = (e) => { e.stopPropagation(); window.open(url, "_blank", "noopener"); };
  const copiar = async (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else throw new Error("sin clipboard");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 1200);
  };

  const btn = "p-1 rounded text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--surface2)]";
  return (
    <div className="flex items-center gap-0.5" onClick={(e)=>e.stopPropagation()}>
      <button onClick={abrir} title="Abrir en ZonaProp" className={btn}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button onClick={copiar} title={copiado ? "¡Copiado!" : "Copiar enlace"}
        className={btn + (copiado ? " !text-[var(--primary)]" : "")}>
        {copiado
          ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
      </button>
    </div>
  );
}

/* ============================================================
   TARJETA KANBAN
   ============================================================ */
function Card({ d, onOpen, draggable, onDragStart, onMove, mobile }) {
  const portada = (d.fotos && d.fotos.length) ? d.fotos[0] : null;
  return (
    <div
      data-card-id={d.id}
      draggable={draggable}
      onDragStart={draggable ? (e)=>onDragStart(e, d.id) : undefined}
      onClick={()=>onOpen(d.id)}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mb-3 cursor-pointer hover:border-slate-500 transition-colors"
    >
      <div className="flex gap-3">
        {portada && (
          <img src={portada} alt="" loading="lazy"
            className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-[var(--surface2)]"
            onError={(e)=>{ e.target.style.display="none"; }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-snug line-clamp-2">{d.titulo || "Sin título"}</div>
          <div className="text-xs text-[var(--muted)] mt-0.5 truncate">{d.ubicacion || "—"}</div>
          <div className="text-sm font-semibold mt-1">{fmtMoney(d.precio_alquiler, d.moneda_alquiler)}
            <span className="text-xs font-normal text-[var(--muted)]"> {d.precio_alquiler ? "/mes" : ""}</span>
          </div>
          {!!d.expensas && <div className="text-[11px] text-[var(--muted)]">+ {fmtMoney(d.expensas)} expensas</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-[var(--muted)]">
        {!!d.ambientes && <span>{d.ambientes} amb.</span>}
        {!!d.superficie_cubierta && <span>· {d.superficie_cubierta} m² cub.</span>}
      </div>

      <div className="flex items-center justify-between mt-2">
        <Stars value={d.estrellas || 0} size={14} />
        <Badge text={d.estado_contacto} color={ESTADO_COLOR[d.estado_contacto] || "#64748b"} />
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
        <span className="text-[10px] text-slate-500">creado por {d.creado_por || "—"}</span>
        <div className="flex items-center gap-1">
          <AccionesZonaProp url={d.url_zonaprop} />
          {mobile && (
            <select
              value={d.columna_kanban}
              onClick={(e)=>e.stopPropagation()}
              onChange={(e)=>{ e.stopPropagation(); onMove(d.id, e.target.value); }}
              className="!w-auto !py-1 !text-[11px] !px-2"
              title="Mover a otra columna"
            >
              {KANBAN_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

// Variante concisa tipo lista: una fila baja con miniatura, datos clave y estrellas.
function CardCompacta({ d, onOpen, draggable, onDragStart }) {
  const portada = (d.fotos && d.fotos.length) ? d.fotos[0] : null;
  return (
    <div
      data-card-id={d.id}
      draggable={draggable}
      onDragStart={draggable ? (e)=>onDragStart(e, d.id) : undefined}
      onClick={()=>onOpen(d.id)}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 mb-2 cursor-pointer hover:border-slate-500 transition-colors flex items-center gap-2"
    >
      {portada
        ? <img src={portada} alt="" loading="lazy"
            className="w-10 h-10 rounded object-cover flex-shrink-0 bg-[var(--surface2)]"
            onError={(e)=>{ e.target.style.visibility="hidden"; }} />
        : <div className="w-10 h-10 rounded flex-shrink-0 bg-[var(--surface2)]" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-xs leading-snug truncate">{d.titulo || "Sin título"}</div>
        <div className="text-[11px] text-[var(--muted)] truncate">{d.ubicacion || "—"}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-semibold">{fmtMoney(d.precio_alquiler, d.moneda_alquiler)}</span>
          <Stars value={d.estrellas || 0} size={11} />
        </div>
      </div>
      <div className="flex-shrink-0"><AccionesZonaProp url={d.url_zonaprop} /></div>
    </div>
  );
}

/* ============================================================
   BARRA DE FILTROS
   ============================================================ */
function Filtros({ f, setF }) {
  const upd = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const toggleArr = (k, v) => setF(prev => {
    const arr = prev[k].includes(v) ? prev[k].filter(x=>x!==v) : [...prev[k], v];
    return { ...prev, [k]: arr };
  });
  const ambChips = ["1","2","3","4+"];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label>Buscar (título, ubicación, descripción)</label>
          <input value={f.texto} onChange={e=>upd("texto", e.target.value)} placeholder="Palermo, balcón, 2 amb…" />
        </div>
        <div className="md:col-span-2">
          <label>Precio mín.</label>
          <NumeroInput value={f.precioMin} onChange={v=>upd("precioMin", v)} allowEmpty placeholder="0" />
        </div>
        <div className="md:col-span-2">
          <label>Precio máx.</label>
          <NumeroInput value={f.precioMax} onChange={v=>upd("precioMax", v)} allowEmpty placeholder="∞" />
        </div>
        <div className="md:col-span-2">
          <label>Estrellas mín.</label>
          <select value={f.estrellasMin} onChange={e=>upd("estrellasMin", Number(e.target.value))}>
            <option value={0}>Cualquiera</option>
            <option value={1}>★ y más</option>
            <option value={2}>★★ y más</option>
            <option value={3}>★★★</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <button onClick={()=>setF(defaultFiltros())}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-white hover:border-slate-500">
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-3">
        <div>
          <label>Ambientes</label>
          <div className="flex gap-1.5">
            {ambChips.map(a => (
              <button key={a} onClick={()=>toggleArr("ambientes", a)}
                className={"px-2.5 py-1 rounded-lg text-xs border " +
                  (f.ambientes.includes(a) ? "bg-[var(--primary)] text-black border-[var(--primary)] font-semibold"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-slate-500")}>{a}</button>
            ))}
          </div>
        </div>
        <div>
          <label>Estado de contacto</label>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS.map(s => (
              <button key={s} onClick={()=>toggleArr("estados", s)}
                className={"px-2.5 py-1 rounded-lg text-xs border " +
                  (f.estados.includes(s) ? "bg-[var(--primary)] text-black border-[var(--primary)] font-semibold"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-slate-500")}>{s}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultFiltros() {
  return { texto:"", precioMin:"", precioMax:"", ambientes:[], estados:[], estrellasMin:0 };
}

function aplicaFiltros(list, f) {
  return list.filter(d => {
    if (f.texto) {
      const t = f.texto.toLowerCase();
      const hay = [d.titulo, d.ubicacion, d.descripcion].join(" ").toLowerCase();
      if (!hay.includes(t)) return false;
    }
    if (f.precioMin !== "" && num(d.precio_alquiler) < num(f.precioMin)) return false;
    if (f.precioMax !== "" && num(d.precio_alquiler) > num(f.precioMax)) return false;
    if (f.ambientes.length) {
      const amb = num(d.ambientes);
      const ok = f.ambientes.some(a => a === "4+" ? amb >= 4 : amb === num(a));
      if (!ok) return false;
    }
    if (f.estados.length && !f.estados.includes(d.estado_contacto)) return false;
    if ((d.estrellas || 0) < f.estrellasMin) return false;
    return true;
  });
}

/* ============================================================
   VISTA KANBAN
   ============================================================ */
// Devuelve el comparador para ordenar una columna según el modo elegido.
// manual: por `orden` asc; las fichas con `orden` explícito van antes que las
// nunca reordenadas, que caen por fecha desc (más recientes primero).
function comparador(sortMode) {
  if (sortMode === "estrellas") {
    return (a, b) => (b.estrellas||0) - (a.estrellas||0)
      || (b.creado_en?.seconds||0) - (a.creado_en?.seconds||0);
  }
  if (sortMode === "manual") {
    return (a, b) => {
      const ka = a.orden, kb = b.orden;
      if (ka != null && kb != null) return ka - kb;
      if (ka != null) return -1;
      if (kb != null) return 1;
      return (b.creado_en?.seconds||0) - (a.creado_en?.seconds||0);
    };
  }
  return (a, b) => (b.creado_en?.seconds||0) - (a.creado_en?.seconds||0); // recientes
}

function Kanban({ deptos, onOpen, onMove, onReorder, mobile, viewMode, sortMode }) {
  const [tab, setTab] = useState(KANBAN_COLS[0].id);
  const [overCol, setOverCol] = useState(null);

  const grouped = useMemo(() => {
    const g = {}; KANBAN_COLS.forEach(c => g[c.id] = []);
    deptos.forEach(d => { (g[d.columna_kanban] || g.por_visitar).push(d); });
    KANBAN_COLS.forEach(c => g[c.id].sort(comparador(sortMode)));
    return g;
  }, [deptos, sortMode]);

  const manual = sortMode === "manual";

  const onDragStart = (e, id) => { e.dataTransfer.setData("text/plain", id); e.currentTarget.classList.add("card-drag"); };

  // Elige tarjeta normal o compacta según el modo de vista.
  const renderCard = (d, draggable) => viewMode === "lista"
    ? <CardCompacta key={d.id} d={d} onOpen={onOpen} draggable={draggable} onDragStart={onDragStart} />
    : <Card key={d.id} d={d} onOpen={onOpen} draggable={draggable} onDragStart={onDragStart} onMove={onMove} mobile={mobile} />;

  // Índice de inserción según la posición vertical del cursor (ignorando la tarjeta arrastrada).
  const indiceInsercion = (e, draggedId) => {
    const cards = [...e.currentTarget.querySelectorAll("[data-card-id]")]
      .filter(el => el.getAttribute("data-card-id") !== draggedId);
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  const onDrop = (e, col) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setOverCol(null);
    document.querySelectorAll(".card-drag").forEach(el=>el.classList.remove("card-drag"));
    if (!id) return;
    if (!manual) { onMove(id, col); return; }
    // Modo manual: reordenar dentro de la columna destino y persistir el orden.
    const index = indiceInsercion(e, id);
    const ids = grouped[col].filter(d => d.id !== id).map(d => d.id);
    ids.splice(index, 0, id);
    onReorder(col, ids, id);
  };

  // Mobile en modo manual: mover una tarjeta arriba/abajo dentro de su columna.
  const moverEnLista = (col, id, dir) => {
    const ids = grouped[col].map(d => d.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(col, ids, id);
  };

  if (mobile) {
    const col = KANBAN_COLS.find(c => c.id === tab);
    return (
      <div>
        <div className="flex gap-1 mb-3 overflow-x-auto">
          {KANBAN_COLS.map(c => (
            <button key={c.id} onClick={()=>setTab(c.id)}
              className={"flex-1 min-w-[90px] px-2 py-2 rounded-lg text-xs font-medium border whitespace-nowrap " +
                (tab===c.id ? "border-transparent text-black" : "border-[var(--border)] text-[var(--muted)]")}
              style={tab===c.id ? { background: c.accent } : {}}>
              {c.label} <span className="opacity-70">({grouped[c.id].length})</span>
            </button>
          ))}
        </div>
        <div>
          {grouped[tab].length === 0
            ? <p className="text-center text-sm text-slate-500 py-10">No hay departamentos en “{col.label}”.</p>
            : grouped[tab].map((d, i) => manual ? (
                <div key={d.id} className="flex items-stretch gap-2">
                  <div className="flex flex-col justify-center gap-1">
                    <button disabled={i===0} onClick={()=>moverEnLista(tab, d.id, -1)}
                      className="px-2 py-1 rounded border border-[var(--border)] text-sm disabled:opacity-30" title="Subir">↑</button>
                    <button disabled={i===grouped[tab].length-1} onClick={()=>moverEnLista(tab, d.id, 1)}
                      className="px-2 py-1 rounded border border-[var(--border)] text-sm disabled:opacity-30" title="Bajar">↓</button>
                  </div>
                  <div className="flex-1 min-w-0">{renderCard(d, false)}</div>
                </div>
              ) : renderCard(d, false))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {KANBAN_COLS.map(c => (
        <div key={c.id}
          onDragOver={(e)=>{ e.preventDefault(); setOverCol(c.id); }}
          onDragLeave={()=>setOverCol(o => o===c.id ? null : o)}
          onDrop={(e)=>onDrop(e, c.id)}
          className={"bg-[var(--bg)] rounded-xl p-2 min-h-[200px] " + (overCol===c.id ? "col-over" : "")}>
          <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b-2" style={{ borderColor: c.accent }}>
            <span className="text-sm font-semibold" style={{ color: c.accent }}>{c.label}</span>
            <span className="text-xs text-[var(--muted)]">{grouped[c.id].length}</span>
          </div>
          {grouped[c.id].length === 0
            ? <p className="text-xs text-slate-600 text-center py-6">Arrastrá tarjetas acá</p>
            : grouped[c.id].map(d => renderCard(d, true))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   LISTA EDITABLE (ventajas / desventajas)
   ============================================================ */
function ListaEditable({ titulo, items, onChange, color, sugerencias }) {
  const [nuevo, setNuevo] = useState("");
  const actuales = items || [];
  const add = (texto) => {
    const t = (texto ?? nuevo).trim();
    if (t && !actuales.includes(t)) onChange([...actuales, t]);
    if (texto == null) setNuevo("");
  };
  // Sugerencias = frases usadas antes que todavía no están en esta ficha.
  const disponibles = (sugerencias || []).filter(s => !actuales.includes(s));
  return (
    <div>
      <label style={{ color }}>{titulo}</label>
      <div className="space-y-1 mb-2">
        {actuales.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm flex-1 bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">{it}</span>
            <button onClick={()=>onChange(actuales.filter((_,j)=>j!==i))}
              className="text-slate-500 hover:text-rose-400 text-sm px-2">✕</button>
          </div>
        ))}
      </div>
      {disponibles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {disponibles.map(s => (
            <button key={s} onClick={()=>add(s)}
              style={{ borderColor: color + "66", color }}
              className="px-2 py-0.5 rounded-full text-[11px] border bg-transparent hover:bg-[var(--surface2)]"
              title="Agregar de registros anteriores">+ {s}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={nuevo} onChange={e=>setNuevo(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } }}
          placeholder="Agregar…" />
        <button onClick={()=>add()} className="px-3 rounded-lg border border-[var(--border)] text-sm hover:border-slate-500">+</button>
      </div>
    </div>
  );
}

/* ============================================================
   GALERÍA / LIGHTBOX
   ============================================================ */
function Galeria({ fotos, onChange }) {
  const [lightbox, setLightbox] = useState(null);
  const [nueva, setNueva] = useState("");
  const arr = fotos || [];
  return (
    <div>
      <label>Fotos {arr.length ? `(${arr.length})` : ""}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {arr.map((u, i) => (
          <div key={i} className="relative group">
            <img src={u} alt="" loading="lazy"
              onClick={()=>setLightbox(u)}
              className="w-24 h-24 object-cover rounded-lg cursor-zoom-in bg-[var(--surface2)] border border-[var(--border)]"
              onError={(e)=>{ e.target.style.opacity=0.3; }} />
            {onChange && (
              <button onClick={()=>onChange(arr.filter((_,j)=>j!==i))}
                className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-5 h-5 text-xs leading-none opacity-0 group-hover:opacity-100">✕</button>
            )}
            {i===0 && <span className="absolute bottom-0 left-0 bg-[var(--amber)] text-black text-[9px] px-1 rounded-tr-md font-semibold">PORTADA</span>}
          </div>
        ))}
        {arr.length === 0 && <span className="text-xs text-slate-500 py-8">Sin fotos.</span>}
      </div>
      {onChange && (
        <div className="flex gap-2">
          <input value={nueva} onChange={e=>setNueva(e.target.value)} placeholder="Pegar URL de imagen…" />
          <button onClick={()=>{ if(nueva.trim()){ onChange([...arr, nueva.trim()]); setNueva(""); } }}
            className="px-3 rounded-lg border border-[var(--border)] text-sm hover:border-slate-500">Agregar</button>
        </div>
      )}
      {lightbox && (
        <div onClick={()=>setLightbox(null)}
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6 cursor-zoom-out">
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   VISTA DETALLE / EDICIÓN
   ============================================================ */
function Detalle({ depto, usuario, onBack, onSave, onDelete, sugerencias }) {
  const [d, setD] = useState(depto);
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));
  const embed = youtubeEmbed(d.video_url);

  const guardar = async () => {
    setGuardando(true);
    try { await onSave(d); } finally { setGuardando(false); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-white mb-4">← Volver al tablero</button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="Título" span={2} value={d.titulo} onChange={(v)=>set("titulo", v)} />
        <Campo label="Ubicación" span={2} value={d.ubicacion} onChange={(v)=>set("ubicacion", v)} />
        <Campo label="URL ZonaProp" span={2} value={d.url_zonaprop} onChange={(v)=>set("url_zonaprop", v)} />

        <div>
          <label>Precio alquiler</label>
          <div className="flex gap-2">
            <NumeroInput value={d.precio_alquiler} onChange={(v)=>set("precio_alquiler", v)} />
            <select className="!w-24" value={d.moneda_alquiler} onChange={e=>set("moneda_alquiler", e.target.value)}>
              <option>ARS</option><option>USD</option>
            </select>
          </div>
        </div>
        <Campo label="Expensas" type="number" value={d.expensas} onChange={(v)=>set("expensas", v)} />
        <Campo label="Ambientes" type="number" value={d.ambientes} onChange={(v)=>set("ambientes", v)} />
        <Campo label="Piso" value={d.piso} onChange={(v)=>set("piso", v)} />
        <Campo label="Sup. cubierta (m²)" type="number" value={d.superficie_cubierta} onChange={(v)=>set("superficie_cubierta", v)} />
        <Campo label="Sup. total (m²)" type="number" value={d.superficie_total} onChange={(v)=>set("superficie_total", v)} />
        <Campo label="Fecha de publicación" span={2} value={d.fecha_publicacion} onChange={(v)=>set("fecha_publicacion", v)} />

        <div className="md:col-span-2">
          <label>Descripción</label>
          <textarea rows={4} value={d.descripcion ?? ""} onChange={e=>set("descripcion", e.target.value)} />
        </div>

        <Campo label="Contacto · nombre" value={d.contacto_nombre} onChange={(v)=>set("contacto_nombre", v)} />
        <Campo label="Contacto · teléfono" value={d.contacto_telefono} onChange={(v)=>set("contacto_telefono", v)} />
        <Campo label="Contacto · email" span={2} value={d.contacto_email} onChange={(v)=>set("contacto_email", v)} />
      </div>

      <div className="mt-5"><Galeria fotos={d.fotos} onChange={(v)=>set("fotos", v)} /></div>

      <div className="mt-5">
        <label>Video (URL)</label>
        <input value={d.video_url ?? ""} onChange={e=>set("video_url", e.target.value)} placeholder="YouTube u otra URL…" />
        {embed && (
          <div className="mt-2 aspect-video">
            <iframe src={embed} className="w-full h-full rounded-lg" allowFullScreen frameBorder="0"></iframe>
          </div>
        )}
        {!embed && d.video_url && (
          <a href={d.video_url} target="_blank" rel="noreferrer" className="text-sm text-[var(--primary)] mt-1 inline-block">Abrir video ↗</a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <ListaEditable titulo="Ventajas" items={d.ventajas} onChange={(v)=>set("ventajas", v)} color="#22c55e" sugerencias={sugerencias?.ventajas} />
        <ListaEditable titulo="Desventajas" items={d.desventajas} onChange={(v)=>set("desventajas", v)} color="#f43f5e" sugerencias={sugerencias?.desventajas} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div>
          <label>Valoración</label>
          <Stars value={d.estrellas || 0} size={28} onChange={(v)=>set("estrellas", v)} />
        </div>
        <div>
          <label>Estado de contacto</label>
          <select value={d.estado_contacto} onChange={e=>set("estado_contacto", e.target.value)}>
            {ESTADOS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label>Columna del tablero</label>
          <select value={d.columna_kanban} onChange={e=>set("columna_kanban", e.target.value)}>
            {KANBAN_COLS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label>Notas de la visita</label>
          <textarea rows={3} value={d.notas_visita ?? ""} onChange={e=>set("notas_visita", e.target.value)} />
        </div>
      </div>

      {(d.creado_por || d.modificado_por) && (
        <div className="text-xs text-slate-500 mt-5 space-y-1 border-t border-[var(--border)] pt-3">
          {d.creado_por && <div>Creado por <b className="text-slate-400">{d.creado_por}</b> el {fmtDate(d.creado_en)}</div>}
          {d.modificado_por && <div>Última modificación por <b className="text-slate-400">{d.modificado_por}</b> el {fmtDate(d.modificado_en)}</div>}
        </div>
      )}

      <div className="flex items-center justify-between mt-6 sticky bottom-0 bg-[var(--bg)] py-3 -mx-1 px-1">
        <div>
          {d.id && (confirmDel
            ? <span className="text-sm">¿Eliminar?
                <button onClick={()=>onDelete(d.id)} className="ml-2 text-rose-400 font-semibold">Sí, eliminar</button>
                <button onClick={()=>setConfirmDel(false)} className="ml-2 text-slate-400">Cancelar</button>
              </span>
            : <button onClick={()=>setConfirmDel(true)} className="text-sm text-rose-400 hover:text-rose-300">Eliminar</button>)}
        </div>
        <button onClick={guardar} disabled={guardando}
          className="px-5 py-2 rounded-lg bg-[var(--primary)] text-black font-semibold text-sm disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   VISTA INGESTA
   ============================================================ */
function Ingesta({ onPrefill, onBack }) {
  const [tab, setTab] = useState("html"); // html | texto | json | manual
  const [valor, setValor] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const procesar = async () => {
    setError(null);
    if (tab === "manual") { onPrefill(emptyDepto()); return; }
    if (!valor.trim()) { setError("Pegá el contenido primero."); return; }
    setCargando(true);
    try {
      if (tab === "json") {
        const obj = JSON.parse(valor.replace(/```json/gi,"").replace(/```/g,"").trim());
        onPrefill({ ...emptyDepto(), ...obj });
      } else {
        const obj = await parsearContenido(valor);
        onPrefill({ ...emptyDepto(), ...obj });
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  };

  const tabs = [
    { id:"html",   label:"Pegar HTML",   hint:"Pegá el código fuente (Ctrl+U → copiar todo, o copialo con Claude in Chrome). Es la opción que captura las fotos." },
    { id:"texto",  label:"Pegar texto",  hint:"Pegá el texto visible del aviso. Rápido, pero no captura las URLs de fotos." },
    { id:"json",   label:"Pegar JSON",   hint:"Si ya extrajiste los datos con Claude in Chrome como JSON, pegalo acá tal cual." },
    { id:"manual", label:"Carga manual", hint:"Crear un registro vacío y completar a mano." },
  ];
  const cur = tabs.find(t=>t.id===tab);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-white mb-4">← Volver al tablero</button>
      <h2 className="text-lg font-semibold mb-3">Agregar departamento</h2>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tabs.map(t => (
          <button key={t.id} onClick={()=>{ setTab(t.id); setError(null); }}
            className={"px-3 py-1.5 rounded-lg text-sm border " +
              (tab===t.id ? "bg-[var(--primary)] text-black border-[var(--primary)] font-semibold"
                : "border-[var(--border)] text-[var(--muted)] hover:border-slate-500")}>{t.label}</button>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)] mb-3">{cur.hint}</p>

      {tab !== "manual" && (
        <textarea rows={10} value={valor} onChange={e=>setValor(e.target.value)}
          placeholder={tab==="json" ? '{ "titulo": "...", "precio_alquiler": 0, ... }' : "Pegá acá el contenido del aviso…"} />
      )}

      {error && <div className="mt-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">{error}</div>}

      <button onClick={procesar} disabled={cargando}
        className="mt-4 px-5 py-2 rounded-lg bg-[var(--primary)] text-black font-semibold text-sm disabled:opacity-50">
        {cargando ? "Procesando…" : (tab==="manual" ? "Crear registro vacío" : tab==="json" ? "Cargar JSON" : "Extraer datos")}
      </button>
    </div>
  );
}

/* ============================================================
   SELECCIÓN DE USUARIO
   ============================================================ */
function SelectorUsuario({ onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold mb-1">Búsqueda de deptos</h1>
      <p className="text-[var(--muted)] mb-8 text-sm">¿Quién está usando la app?</p>
      <div className="flex gap-4">
        {USUARIOS.map(u => (
          <button key={u} onClick={()=>onSelect(u)}
            className="px-8 py-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors text-lg font-semibold min-w-[140px]">
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   APP PRINCIPAL
   ============================================================ */
function App() {
  const [usuario, setUsuario] = useState(() => localStorage.getItem("depto_usuario") || null);
  const [view, setView] = useState("kanban"); // kanban | detalle | ingesta
  const [deptos, setDeptos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null); // registro nuevo prellenado
  const [loading, setLoading] = useState(true);
  const [errConn, setErrConn] = useState(dbError);
  const [filtros, setFiltros] = useState(defaultFiltros());
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("depto_vista") || "tarjetas"); // tarjetas | lista
  const [sortMode, setSortMode] = useState(() => localStorage.getItem("depto_orden") || "recientes"); // recientes | estrellas | manual

  const cambiarVista = (v) => { localStorage.setItem("depto_vista", v); setViewMode(v); };
  const cambiarOrden = (v) => { localStorage.setItem("depto_orden", v); setSortMode(v); };

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const h = () => setMobile(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Suscripción en tiempo real
  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const unsub = COL().onSnapshot(
      (snap) => {
        const arr = [];
        snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
        arr.sort((a,b) => (b.creado_en?.seconds||0) - (a.creado_en?.seconds||0));
        setDeptos(arr);
        setLoading(false);
        setErrConn(null);
      },
      (err) => { setErrConn(err.message || String(err)); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const selectUsuario = (u) => { localStorage.setItem("depto_usuario", u); setUsuario(u); };

  const abrir = (id) => { setOpenId(id); setDraft(null); setView("detalle"); };

  const mover = async (id, col) => {
    try { await COL().doc(id).update({ columna_kanban: col, modificado_por: usuario, modificado_en: ts() }); }
    catch (e) { alert("No se pudo mover: " + (e.message||e)); }
  };

  // Reordenamiento manual: persiste `orden` 0..n para la columna destino. A la ficha
  // movida le actualiza también la columna (si cambió) y los campos de modificación.
  const reordenar = async (col, idsOrdenados, movedId) => {
    try {
      const batch = db.batch();
      idsOrdenados.forEach((id, i) => {
        const data = { orden: i };
        if (id === movedId) { data.columna_kanban = col; data.modificado_por = usuario; data.modificado_en = ts(); }
        batch.update(COL().doc(id), data);
      });
      await batch.commit();
    } catch (e) { alert("No se pudo reordenar: " + (e.message||e)); }
  };

  const guardar = async (d) => {
    try {
      if (d.id) {
        const { id, ...rest } = d;
        await COL().doc(id).update({ ...rest, modificado_por: usuario, modificado_en: ts() });
      } else {
        await COL().add({ ...d, creado_por: usuario, creado_en: ts(), modificado_por: usuario, modificado_en: ts() });
      }
      setView("kanban"); setOpenId(null); setDraft(null);
    } catch (e) { alert("No se pudo guardar: " + (e.message||e)); }
  };

  const eliminar = async (id) => {
    try { await COL().doc(id).delete(); setView("kanban"); setOpenId(null); }
    catch (e) { alert("No se pudo eliminar: " + (e.message||e)); }
  };

  const prefill = (obj) => { setDraft(obj); setOpenId(null); setView("detalle"); };

  if (!usuario) return <SelectorUsuario onSelect={selectUsuario} />;

  const deptoActual = draft || deptos.find(d => d.id === openId) || null;
  const visibles = aplicaFiltros(deptos, filtros);

  // Frases distintas de ventajas/desventajas ya usadas, para sugerir al cargar/editar.
  const sugerencias = useMemo(() => {
    const juntar = (k) => [...new Set(deptos.flatMap(d => d[k] || []).map(s => String(s).trim()).filter(Boolean))].sort();
    return { ventajas: juntar("ventajas"), desventajas: juntar("desventajas") };
  }, [deptos]);

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg md:text-xl font-bold cursor-pointer" onClick={()=>{ setView("kanban"); setOpenId(null); }}>
            Búsqueda de deptos
          </h1>
          {!loading && view==="kanban" && (
            <span className="text-xs text-[var(--muted)]">{visibles.length}/{deptos.length} visibles</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view==="kanban" && (
            <select value={sortMode} onChange={e=>cambiarOrden(e.target.value)}
              title="Ordenar tableros"
              className="!w-auto !py-1.5 !text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg">
              <option value="recientes">Recientes</option>
              <option value="estrellas">Mejor valorados</option>
              <option value="manual">Orden manual</option>
            </select>
          )}
          {view==="kanban" && (
            <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              {[{id:"tarjetas",ic:"▦",t:"Tarjetas"},{id:"lista",ic:"☰",t:"Lista"}].map(v => (
                <button key={v.id} onClick={()=>cambiarVista(v.id)} title={v.t}
                  className={"px-2.5 py-1.5 text-sm " + (viewMode===v.id ? "bg-[var(--primary)] text-black font-semibold" : "text-[var(--muted)] hover:text-white")}>
                  {v.ic}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>{ setDraft(null); setView("ingesta"); }}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-black font-semibold text-sm">+ Agregar</button>
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-3 pr-1.5 py-1">
            <span className="text-xs text-[var(--muted)]">Usás como</span>
            <select value={usuario} onChange={e=>selectUsuario(e.target.value)}
              className="!w-auto !py-0.5 !px-1 !border-0 !bg-transparent font-semibold text-sm">
              {USUARIOS.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Estado de conexión */}
      {errConn && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
          <b>Error de conexión con Firestore:</b> {errConn}
          <div className="text-xs mt-1 text-rose-200/70">Si estás dentro de claude.ai, puede ser una restricción del sandbox. Probá abriendo este archivo localmente o publicándolo en GitHub Pages.</div>
        </div>
      )}

      {/* Cuerpo */}
      {view === "kanban" && (
        <>
          <Filtros f={filtros} setF={setFiltros} />
          {loading
            ? <p className="text-center text-[var(--muted)] py-16">Cargando departamentos…</p>
            : deptos.length === 0
              ? <div className="text-center py-16">
                  <p className="text-[var(--muted)] mb-3">Todavía no hay departamentos cargados.</p>
                  <button onClick={()=>setView("ingesta")} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-black font-semibold text-sm">Agregar el primero</button>
                </div>
              : <Kanban deptos={visibles} onOpen={abrir} onMove={mover} onReorder={reordenar} mobile={mobile} viewMode={viewMode} sortMode={sortMode} />}
        </>
      )}

      {view === "detalle" && deptoActual && (
        <Detalle depto={deptoActual} usuario={usuario} sugerencias={sugerencias}
          onBack={()=>{ setView("kanban"); setOpenId(null); setDraft(null); }}
          onSave={guardar} onDelete={eliminar} />
      )}

      {view === "ingesta" && (
        <Ingesta onPrefill={prefill} onBack={()=>setView("kanban")} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

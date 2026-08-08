function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  toast.textContent = mensaje;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Registros: array sincronizado en vivo con Firestore ---
// registrosCacheCompleto incluye los borrados (para la Papelera); registrosCache es lo que usa el resto de la app.
let registrosCacheCompleto = [];
let registrosCache = [];
let unsubscribeRegistros = null;

function cargarRegistros() {
  return registrosCache;
}

function iniciarListenerRegistros() {
  if (unsubscribeRegistros) return;
  unsubscribeRegistros = db.collection("registros").onSnapshot(
    (snapshot) => {
      registrosCacheCompleto = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      registrosCache = registrosCacheCompleto.filter((r) => !r.eliminado);
      onRegistrosActualizados();
    },
    () => mostrarToast("No se pudo sincronizar con la nube")
  );
}

function onRegistrosActualizados() {
  if (typeof renderPanelAvanceGeneral === "function") renderPanelAvanceGeneral();
  if (document.getElementById("tab-ficha").classList.contains("active") && typeof renderTimeline === "function") {
    renderTimeline();
  }
  if (document.getElementById("tab-feed").classList.contains("active") && typeof renderFeed === "function") {
    renderFeed();
  }
  if (document.getElementById("tab-papelera").classList.contains("active") && typeof renderPapelera === "function") {
    renderPapelera();
  }
  if (document.getElementById("tab-registros").classList.contains("active") && typeof renderHistorialRendimiento === "function") {
    renderHistorialRendimiento();
  }
}

// --- Panel general de avance de campaña (debajo del mapa) ---
function renderPanelAvanceGeneral() {
  const cont = document.getElementById("panel-avance-general");
  if (!cont || !lotesCache.length || typeof campanasLoteCache === "undefined" || typeof calcularAvanceCampana !== "function") return;

  const nombresUnicos = [...new Set(lotesCache.map((l) => l.nombre))];
  const grupos = new Map(); // "cultivo__temporada" -> { cultivo, temporada, hectareasTotales, hectareasPlan, sembrado, cosechado, produccion }

  nombresUnicos.forEach((nombre) => {
    const campana = campanasLoteCache[nombre];
    if (!campana || !campana.cultivo) return; // puede existir el doc solo por hectareasOficiales, sin campaña asignada
    const lote = lotesCache.find((l) => l.nombre === nombre);
    const clave = `${campana.cultivo}__${campana.temporada}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { cultivo: campana.cultivo, temporada: campana.temporada, hectareasTotales: 0, hectareasPlan: 0, sembrado: 0, cosechado: 0, produccion: 0 });
    }
    const g = grupos.get(clave);
    g.hectareasTotales += (typeof hectareasDeLote === "function" ? hectareasDeLote(nombre, lote) : lote?.hectareasTotales) || 0;
    g.hectareasPlan += parseFloat(campana.hectareasPlan) || 0;
    const avance = calcularAvanceCampana(nombre, campana);
    g.sembrado += avance.sembrado;
    g.cosechado += avance.cosechado;
    g.produccion += avance.produccion;
  });

  const listaGrupos = [...grupos.values()].sort((a, b) => b.hectareasTotales - a.hectareasTotales);

  cont.innerHTML = listaGrupos.length
    ? listaGrupos.map(renderTarjetaAvanceGeneral).join("")
    : '<p class="vacio">Todavía no hay campañas asignadas a ningún lote.</p>';
}

function renderTarjetaAvanceGeneral(g) {
  const baseSembrado = g.hectareasPlan || g.hectareasTotales;
  const pctSembrado = baseSembrado ? Math.min(100, Math.round((g.sembrado / baseSembrado) * 100)) : 0;
  const pctCosechado = g.sembrado ? Math.min(100, Math.round((g.cosechado / g.sembrado) * 100)) : 0;
  const etiquetaSembrado = g.hectareasPlan
    ? `Sembrado: ${g.sembrado.toFixed(1)} de ${g.hectareasPlan.toFixed(1)} ha planificadas (${pctSembrado}%)`
    : `Sembrado: ${g.sembrado.toFixed(1)} ha (${pctSembrado}%)`;
  return `
    <div class="avance-general-card">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(g.cultivo)} ${escapeHtml(g.temporada)}</span>
        <span class="lote-fecha">${g.hectareasTotales.toFixed(1)} ha</span>
      </div>
      <div class="barra-avance">
        <span class="barra-etiqueta">${etiquetaSembrado}</span>
        <div class="barra-fondo"><div class="barra-relleno barra-siembra" style="width:${pctSembrado}%"></div></div>
      </div>
      <div class="barra-avance">
        <span class="barra-etiqueta">Cosechado: ${g.cosechado.toFixed(1)} ha (${pctCosechado}%)</span>
        <div class="barra-fondo"><div class="barra-relleno barra-cosecha" style="width:${pctCosechado}%"></div></div>
      </div>
      ${g.produccion > 0 ? `<p class="avance-produccion">Producción: ${g.produccion.toFixed(1)} t</p>` : ""}
    </div>
  `;
}

// --- Arranque de la app (recién después de iniciar sesión) ---
function iniciarApp() {
  iniciarListenerRegistros();
  if (typeof iniciarListenerCampanas === "function") iniciarListenerCampanas();
  if (typeof iniciarListenerClima === "function") iniciarListenerClima();
  if (typeof iniciarListenerPoscosecha === "function") iniciarListenerPoscosecha();
  cargarLotes()
    .then((lotes) => {
      lotesCache = lotes;
      dibujarMapa();
      if (typeof poblarSelectorLotes === "function") poblarSelectorLotes();
      setTimeout(() => {
        if (typeof purgarPapeleraVieja === "function") purgarPapeleraVieja();
      }, 1000);
    })
    .catch(() => mostrarToast("No se pudo cargar el mapa de lotes"));
}

// --- Menú (☰): panel lateral con todas las secciones ---
function abrirMenu() {
  document.getElementById("tabs").hidden = false;
  document.getElementById("menu-backdrop").hidden = false;
}
function cerrarMenu() {
  document.getElementById("tabs").hidden = true;
  document.getElementById("menu-backdrop").hidden = true;
}
document.getElementById("btn-menu").addEventListener("click", abrirMenu);
document.getElementById("menu-backdrop").addEventListener("click", cerrarMenu);

// --- Navegación de pestañas (Mapa / Clima / Registros) ---
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "mapa") dibujarMapa();
  if (btn.dataset.tab === "papelera" && typeof renderPapelera === "function") renderPapelera();
  if (btn.dataset.tab === "feed" && typeof renderFeed === "function") renderFeed();
  if (btn.dataset.tab === "poscosecha" && typeof renderPoscosecha === "function") renderPoscosecha();
  if (btn.dataset.tab === "registros" && typeof renderHistorialRendimiento === "function") renderHistorialRendimiento();
  cerrarMenu();
});

// --- Lotes (KML) ---
let lotesCache = [];
let ultimaUbicacion = null;

// --- Zoom y desplazamiento del mapa (independiente del zoom de la página) ---
let extentoMapaCompleto = null; // { w, h } del mapa completo, sin zoom
let vistaMapa = null; // { x, y, w, h } — porción visible actual
let mapaSeMovio = false; // evita que un arrastre se interprete como clic en un lote

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function aplicarVistaMapa() {
  const svg = document.querySelector("#mapa-contenedor svg");
  if (!svg || !vistaMapa) return;
  svg.setAttribute("viewBox", `${vistaMapa.x.toFixed(5)} ${vistaMapa.y.toFixed(5)} ${vistaMapa.w.toFixed(5)} ${vistaMapa.h.toFixed(5)}`);
}

function zoomMapa(factor, cx, cy) {
  if (!vistaMapa || !extentoMapaCompleto) return;
  const nuevoAncho = limitar(vistaMapa.w * factor, extentoMapaCompleto.w * 0.04, extentoMapaCompleto.w);
  const nuevoAlto = vistaMapa.h * (nuevoAncho / vistaMapa.w);
  const proporcionX = (cx - vistaMapa.x) / vistaMapa.w;
  const proporcionY = (cy - vistaMapa.y) / vistaMapa.h;
  const nuevoX = limitar(cx - proporcionX * nuevoAncho, 0, Math.max(0, extentoMapaCompleto.w - nuevoAncho));
  const nuevoY = limitar(cy - proporcionY * nuevoAlto, 0, Math.max(0, extentoMapaCompleto.h - nuevoAlto));
  vistaMapa = { x: nuevoX, y: nuevoY, w: nuevoAncho, h: nuevoAlto };
  aplicarVistaMapa();
}

function panMapa(dxPantalla, dyPantalla) {
  const svg = document.querySelector("#mapa-contenedor svg");
  if (!svg || !vistaMapa) return;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const escalaX = vistaMapa.w / rect.width;
  const escalaY = vistaMapa.h / rect.height;
  const nuevoX = limitar(vistaMapa.x - dxPantalla * escalaX, 0, Math.max(0, extentoMapaCompleto.w - vistaMapa.w));
  const nuevoY = limitar(vistaMapa.y - dyPantalla * escalaY, 0, Math.max(0, extentoMapaCompleto.h - vistaMapa.h));
  vistaMapa = { ...vistaMapa, x: nuevoX, y: nuevoY };
  aplicarVistaMapa();
}

function distanciaEntrePuntos(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function iniciarControlesMapa() {
  const cont = document.getElementById("mapa-contenedor");
  if (!cont || cont.dataset.controlesListos) return;
  cont.dataset.controlesListos = "1";

  cont.addEventListener(
    "wheel",
    (e) => {
      if (!vistaMapa) return;
      e.preventDefault();
      const svg = cont.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const cx = vistaMapa.x + px * vistaMapa.w;
      const cy = vistaMapa.y + py * vistaMapa.h;
      zoomMapa(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
    },
    { passive: false }
  );

  let arrastrandoMouse = false;
  let ultimoX = 0;
  let ultimoY = 0;

  cont.addEventListener("mousedown", (e) => {
    if (!vistaMapa) return;
    arrastrandoMouse = true;
    mapaSeMovio = false;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!arrastrandoMouse) return;
    const dx = e.clientX - ultimoX;
    const dy = e.clientY - ultimoY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapaSeMovio = true;
    panMapa(dx, dy);
    ultimoX = e.clientX;
    ultimoY = e.clientY;
  });
  window.addEventListener("mouseup", () => (arrastrandoMouse = false));

  let toque = null;
  cont.addEventListener(
    "touchstart",
    (e) => {
      if (!vistaMapa) return;
      mapaSeMovio = false;
      if (e.touches.length === 1) {
        toque = { modo: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const [t1, t2] = e.touches;
        toque = {
          modo: "pinch",
          dist: distanciaEntrePuntos(t1, t2),
        };
      }
    },
    { passive: false }
  );
  cont.addEventListener(
    "touchmove",
    (e) => {
      if (!toque || !vistaMapa) return;
      e.preventDefault();
      if (toque.modo === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - toque.x;
        const dy = e.touches[0].clientY - toque.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapaSeMovio = true;
        panMapa(dx, dy);
        toque.x = e.touches[0].clientX;
        toque.y = e.touches[0].clientY;
      } else if (toque.modo === "pinch" && e.touches.length === 2) {
        const [t1, t2] = e.touches;
        const nuevaDist = distanciaEntrePuntos(t1, t2);
        const svg = cont.querySelector("svg");
        if (svg && nuevaDist > 0) {
          const rect = svg.getBoundingClientRect();
          const midX = (t1.clientX + t2.clientX) / 2;
          const midY = (t1.clientY + t2.clientY) / 2;
          const px = (midX - rect.left) / rect.width;
          const py = (midY - rect.top) / rect.height;
          const cx = vistaMapa.x + px * vistaMapa.w;
          const cy = vistaMapa.y + py * vistaMapa.h;
          mapaSeMovio = true;
          zoomMapa(toque.dist / nuevaDist, cx, cy);
        }
        toque.dist = nuevaDist;
      }
    },
    { passive: false }
  );
  cont.addEventListener("touchend", (e) => {
    if (e.touches.length === 0) toque = null;
  });

  document.getElementById("btn-zoom-in").addEventListener("click", () => {
    if (!vistaMapa) return;
    zoomMapa(1 / 1.4, vistaMapa.x + vistaMapa.w / 2, vistaMapa.y + vistaMapa.h / 2);
  });
  document.getElementById("btn-zoom-out").addEventListener("click", () => {
    if (!vistaMapa) return;
    zoomMapa(1.4, vistaMapa.x + vistaMapa.w / 2, vistaMapa.y + vistaMapa.h / 2);
  });
  document.getElementById("btn-zoom-reset").addEventListener("click", () => {
    if (!extentoMapaCompleto) return;
    vistaMapa = { x: 0, y: 0, w: extentoMapaCompleto.w, h: extentoMapaCompleto.h };
    aplicarVistaMapa();
  });
}

function dibujarMapa() {
  const cont = document.getElementById("mapa-contenedor");
  if (!cont) return;
  if (!lotesCache.length) {
    cont.innerHTML = '<p class="vacio">Cargando mapa de lotes...</p>';
    return;
  }

  const puntos = lotesCache.flatMap((l) => l.poligono);
  const lats = puntos.map((p) => p[0]);
  const lons = puntos.map((p) => p[1]);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const correccion = Math.cos(((latMin + latMax) / 2) * Math.PI / 180);

  const ancho = (lonMax - lonMin) * correccion;
  const alto = latMax - latMin;
  const margen = Math.max(ancho, alto) * 0.03;
  const w = ancho + margen * 2;
  const h = alto + margen * 2;

  extentoMapaCompleto = { w, h };
  if (!vistaMapa) vistaMapa = { x: 0, y: 0, w, h };

  const proyectar = ([lat, lon]) => {
    const x = (lon - lonMin) * correccion + margen;
    const y = (latMax - lat) + margen;
    return `${x.toFixed(5)},${y.toFixed(5)}`;
  };

  const poligonosSvg = lotesCache
    .map((l, i) => {
      const clase = l.ambiente === "Profundo" ? "color-profundo" : "color-superficial";
      const puntosSvg = l.poligono.map(proyectar).join(" ");
      return `<polygon points="${puntosSvg}" class="lote-poligono ${clase}" data-idx="${i}"></polygon>`;
    })
    .join("");

  let marcadorSvg = "";
  if (ultimaUbicacion) {
    const [x, y] = proyectar(ultimaUbicacion).split(",");
    marcadorSvg = `<circle cx="${x}" cy="${y}" r="${w * 0.008}" class="marcador-ubicacion"></circle>`;
  }

  cont.innerHTML = `
    <svg viewBox="${vistaMapa.x.toFixed(5)} ${vistaMapa.y.toFixed(5)} ${vistaMapa.w.toFixed(5)} ${vistaMapa.h.toFixed(5)}" preserveAspectRatio="xMidYMid meet" width="100%">
      ${poligonosSvg}
      ${marcadorSvg}
    </svg>
  `;

  cont.querySelectorAll(".lote-poligono").forEach((poly) => {
    poly.addEventListener("click", () => {
      if (mapaSeMovio) {
        mapaSeMovio = false;
        return;
      }
      const lote = lotesCache[Number(poly.dataset.idx)];
      abrirFicha(lote.nombre);
    });
  });

  iniciarControlesMapa();
  renderPanelAvanceGeneral();
}

// --- Service worker para uso offline ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

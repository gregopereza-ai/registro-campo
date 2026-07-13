const STORAGE_KEY = "zogoibi-registros";

const CAMPOS = {
  recorrida: ["fecha", "lote", "hectareas", "malezasEmergidas", "malezasSinEmerger", "pulverizacion"],
  siembra: ["fecha", "lote", "hectareas", "variedad", "origen", "densidad", "observaciones"],
};

const ETIQUETAS = {
  fecha: "Fecha",
  lote: "Lote",
  hectareas: "Hectáreas",
  malezasEmergidas: "Malezas emergidas",
  malezasSinEmerger: "Malezas sin emerger",
  pulverizacion: "Pulverización planificada",
  variedad: "Variedad",
  origen: "Origen",
  densidad: "Densidad (kg/ha)",
  observaciones: "Observaciones",
};

function cargarRegistros() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function guardarRegistros(registros) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}

function generarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  toast.textContent = mensaje;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2200);
}

// --- Navegación de pestañas ---
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "registros") renderRegistros();
  if (btn.dataset.tab === "mapa") dibujarMapa();
});

// --- Lotes (KML) y detección por GPS ---
let lotesCache = [];
let ultimaUbicacion = null;

cargarLotes()
  .then((lotes) => {
    lotesCache = lotes;
    dibujarMapa();
  })
  .catch(() => mostrarToast("No se pudo cargar el mapa de lotes"));

document.querySelectorAll(".btn-ubicacion").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mostrarToast("Este dispositivo no soporta GPS");
      return;
    }
    mostrarToast("Buscando tu ubicación...");
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const { latitude, longitude } = posicion.coords;
        ultimaUbicacion = [latitude, longitude];
        const lote = buscarLotePorUbicacion(latitude, longitude, lotesCache);
        if (lote) {
          const form = document.getElementById("form-" + btn.dataset.form);
          form.elements["lote"].value = lote.nombre;
          mostrarToast(`Lote detectado: ${lote.nombre}`);
        } else {
          mostrarToast("No se encontró un lote en tu ubicación actual");
        }
        dibujarMapa();
      },
      () => mostrarToast("No se pudo obtener tu ubicación"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
});

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
    <svg viewBox="0 0 ${w.toFixed(5)} ${h.toFixed(5)}" preserveAspectRatio="xMidYMid meet" width="100%">
      ${poligonosSvg}
      ${marcadorSvg}
    </svg>
  `;

  cont.querySelectorAll(".lote-poligono").forEach((poly) => {
    poly.addEventListener("click", () => {
      cont.querySelectorAll(".lote-poligono").forEach((p) => p.classList.remove("seleccionado"));
      poly.classList.add("seleccionado");
      const lote = lotesCache[Number(poly.dataset.idx)];
      const ha = lote.hectareas ? `${lote.hectareas.toFixed(1)} ha` : "sin datos de ha";
      document.getElementById("mapa-info").textContent = `${lote.nombre} — ${lote.ambiente} — ${ha}`;
    });
  });
}

// --- Guardar formularios ---
function manejarSubmit(formId, tipo) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form).entries());
    const registro = {
      id: generarId(),
      tipo,
      creado: new Date().toISOString(),
      ...datos,
    };
    const registros = cargarRegistros();
    registros.push(registro);
    guardarRegistros(registros);
    form.reset();
    mostrarToast(tipo === "recorrida" ? "Recorrida guardada" : "Siembra guardada");
  });
}

manejarSubmit("form-recorrida", "recorrida");
manejarSubmit("form-siembra", "siembra");

// --- Filtro de registros ---
let filtroActual = "todos";
document.querySelector(".filtro-tipo").addEventListener("click", (e) => {
  const btn = e.target.closest(".filtro-btn");
  if (!btn) return;
  document.querySelectorAll(".filtro-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  filtroActual = btn.dataset.filtro;
  renderRegistros();
});

function renderRegistros() {
  const cont = document.getElementById("lista-registros");
  let registros = cargarRegistros();
  if (filtroActual !== "todos") {
    registros = registros.filter((r) => r.tipo === filtroActual);
  }
  registros.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  if (registros.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay registros cargados.</p>';
    return;
  }

  cont.innerHTML = registros.map(renderCard).join("");
}

function renderCard(r) {
  const campos = CAMPOS[r.tipo] || [];
  const detalle = campos
    .filter((c) => c !== "fecha" && c !== "lote" && r[c])
    .map((c) => `<dt>${ETIQUETAS[c] || c}</dt><dd>${escapeHtml(r[c])}</dd>`)
    .join("");

  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${r.tipo}</span>
        <span class="lote-fecha">${escapeHtml(r.lote || "")} — ${escapeHtml(r.fecha || "")}</span>
      </div>
      <dl>${detalle}</dl>
      <button class="btn-eliminar" data-id="${r.id}">Eliminar</button>
    </div>
  `;
}

document.getElementById("lista-registros").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-eliminar");
  if (!btn) return;
  if (!confirm("¿Eliminar este registro?")) return;
  const registros = cargarRegistros().filter((r) => r.id !== btn.dataset.id);
  guardarRegistros(registros);
  renderRegistros();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Exportar CSV ---
function exportarCSV(tipo) {
  const registros = cargarRegistros().filter((r) => r.tipo === tipo);
  const campos = CAMPOS[tipo];
  const encabezado = campos.map((c) => ETIQUETAS[c] || c).join(",");
  const filas = registros.map((r) =>
    campos.map((c) => csvEscape(r[c])).join(",")
  );
  const csv = [encabezado, ...filas].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tipo}-zogoibi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(valor) {
  const v = (valor ?? "").toString();
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

document.getElementById("btn-export-recorrida").addEventListener("click", () => exportarCSV("recorrida"));
document.getElementById("btn-export-siembra").addEventListener("click", () => exportarCSV("siembra"));

// --- Importar CSV ---
function parseCSV(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lineas.length < 2) return [];
  const filas = lineas.slice(1).map((linea) => {
    const valores = [];
    let actual = "";
    let dentroComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (dentroComillas) {
        if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
        else if (c === '"') dentroComillas = false;
        else actual += c;
      } else {
        if (c === '"') dentroComillas = true;
        else if (c === ",") { valores.push(actual); actual = ""; }
        else actual += c;
      }
    }
    valores.push(actual);
    return valores;
  });
  return filas;
}

function importarCSV(tipo, archivo) {
  const campos = CAMPOS[tipo];
  const lector = new FileReader();
  lector.onload = () => {
    const filas = parseCSV(lector.result);
    const registros = cargarRegistros();
    filas.forEach((valores) => {
      const registro = { id: generarId(), tipo, creado: new Date().toISOString() };
      campos.forEach((c, i) => (registro[c] = valores[i] || ""));
      registros.push(registro);
    });
    guardarRegistros(registros);
    mostrarToast(`${filas.length} registros importados`);
    renderRegistros();
  };
  lector.readAsText(archivo, "utf-8");
}

document.getElementById("import-recorrida").addEventListener("change", (e) => {
  if (e.target.files[0]) importarCSV("recorrida", e.target.files[0]);
  e.target.value = "";
});
document.getElementById("import-siembra").addEventListener("change", (e) => {
  if (e.target.files[0]) importarCSV("siembra", e.target.files[0]);
  e.target.value = "";
});

// --- Service worker para uso offline ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

renderRegistros();

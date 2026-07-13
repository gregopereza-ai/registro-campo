const STORAGE_KEY = "zogoibi-registros";

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Navegación de pestañas (Mapa / Registros) ---
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "mapa") dibujarMapa();
});

// --- Lotes (KML) ---
let lotesCache = [];
let ultimaUbicacion = null;

cargarLotes()
  .then((lotes) => {
    lotesCache = lotes;
    dibujarMapa();
  })
  .catch(() => mostrarToast("No se pudo cargar el mapa de lotes"));

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
      const lote = lotesCache[Number(poly.dataset.idx)];
      abrirFicha(lote.nombre);
    });
  });
}

// --- Exportar CSV ---
function valorCampoCSV(r, campo) {
  if (campo === "productosTexto") return productosATexto(r.productos);
  return r[campo];
}

function exportarCSV(tipo) {
  const registros = cargarRegistros().filter((r) => r.tipo === tipo);
  const campos = CAMPOS_CATEGORIA[tipo];
  const encabezado = campos.map((c) => ETIQUETAS_CAMPO[c] || c).join(",");
  const filas = registros.map((r) => campos.map((c) => csvEscape(valorCampoCSV(r, c))).join(","));
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

document.querySelectorAll(".btn-export").forEach((btn) => {
  btn.addEventListener("click", () => exportarCSV(btn.dataset.tipo));
});

// --- Importar CSV ---
function parseCSV(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lineas.length < 2) return [];
  return lineas.slice(1).map((linea) => {
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
}

function importarCSV(tipo, archivo) {
  const campos = CAMPOS_CATEGORIA[tipo];
  const lector = new FileReader();
  lector.onload = () => {
    const filas = parseCSV(lector.result);
    const registros = cargarRegistros();
    filas.forEach((valores) => {
      const registro = { id: generarId(), tipo, creado: new Date().toISOString() };
      campos.forEach((c, i) => {
        const valor = valores[i] || "";
        if (c === "productosTexto") registro.productos = textoAProductos(valor);
        else registro[c] = valor;
      });
      registros.push(registro);
    });
    guardarRegistros(registros);
    mostrarToast(`${filas.length} registros importados`);
  };
  lector.readAsText(archivo, "utf-8");
}

document.querySelectorAll(".input-import").forEach((input) => {
  input.addEventListener("change", (e) => {
    if (e.target.files[0]) importarCSV(input.dataset.tipo, e.target.files[0]);
    e.target.value = "";
  });
});

// --- Service worker para uso offline ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const CAMPOS_CATEGORIA = {
  malezas: ["fecha", "lote", "cultivo", "temporada", "malezas", "insectos", "enfermedades", "observaciones"],
  pulverizacion: ["fecha", "lote", "cultivo", "temporada", "momento", "productosTexto", "observaciones"],
  siembra: ["fecha", "lote", "cultivo", "temporada", "variedad", "hectareas", "origen", "pg", "dosisKgHa", "pmg", "semillasPorMetro", "distanciaCm", "semillasHaBruto", "semillasHaViables", "fertilizantesTexto"],
  emergencia: ["fecha", "lote", "cultivo", "temporada", "plantasM2", "coeficienteLogro"],
  cosecha: ["fecha", "lote", "cultivo", "temporada", "fechaFloracion", "rendimientoKgHa", "humedad"],
};

const ETIQUETAS_CAMPO = {
  fecha: "Fecha", lote: "Lote", cultivo: "Cultivo", temporada: "Temporada",
  malezas: "Malezas", insectos: "Insectos", enfermedades: "Enfermedades",
  momento: "Momento", productosTexto: "Productos", observaciones: "Observaciones",
  fertilizantesTexto: "Fertilización (kg/ha)",
  variedad: "Variedad/Híbrido", hectareas: "Hectáreas", origen: "Origen", pg: "PG (%)",
  dosisKgHa: "Dosis (kg/ha)", pmg: "PMG (g)", semillasPorMetro: "Semillas/metro", distanciaCm: "Distancia (cm)",
  semillasHaBruto: "Semillas/ha (bruto)", semillasHaViables: "Semillas/ha (viables)",
  plantasM2: "Plantas/m²", coeficienteLogro: "Coeficiente de logro (%)",
  fechaFloracion: "Fecha floración", rendimientoKgHa: "Rendimiento (kg/ha)", humedad: "Humedad (%)",
};

const NOMBRES_CATEGORIA = {
  malezas: "Monitoreo", pulverizacion: "Pulverización", siembra: "Siembra",
  emergencia: "Emergencia", cosecha: "Floración/Cosecha",
};

let loteActual = null;

// --- Campaña activa por lote: sincronizada en vivo con Firestore ---
let campanasLoteCache = {};
let unsubscribeCampanas = null;

function iniciarListenerCampanas() {
  if (unsubscribeCampanas) return;
  unsubscribeCampanas = db.collection("campanasLote").onSnapshot(
    (snapshot) => {
      const nuevoMapa = {};
      snapshot.forEach((doc) => (nuevoMapa[doc.id] = doc.data()));
      campanasLoteCache = nuevoMapa;
      onCampanasActualizadas();
    },
    () => mostrarToast("No se pudo sincronizar las campañas con la nube")
  );
}

function onCampanasActualizadas() {
  if (!loteActual || !document.getElementById("tab-ficha").classList.contains("active")) return;
  actualizarEtiquetaCampana();
  renderTimeline();
}

function campanaActivaDe(lote) {
  return campanasLoteCache[lote] || null;
}

// --- Productos de pulverización (serialización simple para CSV) ---
function productosATexto(productos) {
  return (productos || []).map((p) => `${p.nombre}|${p.dosis}|${p.unidad}`).join(";");
}

function textoAProductos(texto) {
  if (!texto) return [];
  return texto.split(";").filter(Boolean).map((parte) => {
    const [nombre, dosis, unidad] = parte.split("|");
    return { nombre: nombre || "", dosis: dosis || "", unidad: unidad || "" };
  });
}

function agregarFilaProducto(valores = {}) {
  const cont = document.getElementById("productos-lista");
  const fila = document.createElement("div");
  fila.className = "producto-fila";
  fila.innerHTML = `
    <input type="text" class="producto-nombre" placeholder="Producto (ej: Glifosato)" value="${(valores.nombre || "").replace(/"/g, "&quot;")}">
    <input type="number" class="producto-dosis" placeholder="Dosis" step="0.01" value="${valores.dosis || ""}">
    <select class="producto-unidad">
      <option value="lt" ${valores.unidad === "lt" ? "selected" : ""}>lt</option>
      <option value="kg" ${valores.unidad === "kg" ? "selected" : ""}>kg</option>
      <option value="cc" ${valores.unidad === "cc" ? "selected" : ""}>cc</option>
      <option value="gr" ${valores.unidad === "gr" ? "selected" : ""}>gr</option>
    </select>
    <button type="button" class="btn-quitar-producto">✕</button>
  `;
  cont.appendChild(fila);
}

document.getElementById("btn-agregar-producto").addEventListener("click", () => agregarFilaProducto());

document.getElementById("productos-lista").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-quitar-producto");
  if (!btn) return;
  btn.closest(".producto-fila").remove();
});

// --- Fertilizantes de Siembra (misma serialización simple, sin unidad porque siempre es kg/ha) ---
function fertilizantesATexto(fertilizantes) {
  return (fertilizantes || []).map((f) => `${f.nombre}|${f.dosis}`).join(";");
}

function textoAFertilizantes(texto) {
  if (!texto) return [];
  return texto.split(";").filter(Boolean).map((parte) => {
    const [nombre, dosis] = parte.split("|");
    return { nombre: nombre || "", dosis: dosis || "" };
  });
}

function agregarFilaFertilizante(valores = {}) {
  const cont = document.getElementById("fertilizantes-lista");
  const fila = document.createElement("div");
  fila.className = "producto-fila";
  fila.innerHTML = `
    <input type="text" class="fertilizante-nombre" placeholder="Fertilizante (ej: Urea)" value="${(valores.nombre || "").replace(/"/g, "&quot;")}">
    <input type="number" class="fertilizante-dosis" placeholder="Kg/ha" step="0.1" value="${valores.dosis || ""}">
    <button type="button" class="btn-quitar-producto">✕</button>
  `;
  cont.appendChild(fila);
}

document.getElementById("btn-agregar-fertilizante").addEventListener("click", () => agregarFilaFertilizante());

document.getElementById("fertilizantes-lista").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-quitar-producto");
  if (!btn) return;
  btn.closest(".producto-fila").remove();
});

// --- Abrir / cerrar Ficha del lote ---
function abrirFicha(nombreLote) {
  loteActual = nombreLote;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-ficha").classList.add("active");

  const lote = lotesCache.find((l) => l.nombre === nombreLote);
  document.getElementById("ficha-nombre").textContent = nombreLote;
  document.getElementById("ficha-meta").textContent = lote
    ? `${lote.ambiente} — ${lote.hectareas ? lote.hectareas.toFixed(1) + " ha" : "sin datos de ha"}`
    : "";

  document.querySelectorAll(".form-categoria").forEach((f) => {
    f.hidden = true;
    f.reset();
  });
  document.getElementById("productos-lista").innerHTML = "";
  document.getElementById("fertilizantes-lista").innerHTML = "";
  document.getElementById("siembra-resultado").textContent = "";
  document.getElementById("emergencia-resultado").textContent = "";
  document.getElementById("ficha-historial").hidden = true;

  const campana = campanaActivaDe(nombreLote);
  document.getElementById("campana-cultivo").value = campana ? campana.cultivo : "Trigo";
  document.getElementById("campana-temporada").value = campana ? campana.temporada : "";

  actualizarEtiquetaCampana();
  actualizarCamposSiembraSegunCultivo();
  renderTimeline();
}

document.getElementById("btn-volver-mapa").addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="mapa"]').classList.add("active");
  document.getElementById("tab-mapa").classList.add("active");
});

document.getElementById("btn-ir-a-mi-lote").addEventListener("click", () => {
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
        abrirFicha(lote.nombre);
      } else {
        mostrarToast("No se encontró un lote en tu ubicación actual");
        dibujarMapa();
      }
    },
    () => mostrarToast("No se pudo obtener tu ubicación"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// --- Campaña: guardar y adaptar campos de Siembra según cultivo ---
function actualizarEtiquetaCampana() {
  const campana = campanaActivaDe(loteActual);
  document.getElementById("campana-actual-label").textContent = campana
    ? `Campaña activa: ${campana.cultivo} ${campana.temporada}`
    : "Todavía no asignaste una campaña a este lote.";
}

document.getElementById("btn-guardar-campana").addEventListener("click", () => {
  const cultivo = document.getElementById("campana-cultivo").value;
  const temporada = document.getElementById("campana-temporada").value.trim();
  if (!temporada) {
    mostrarToast("Ingresá la temporada (ej: 26/27)");
    return;
  }
  db.collection("campanasLote")
    .doc(loteActual)
    .set({ cultivo, temporada })
    .then(() => {
      actualizarEtiquetaCampana();
      renderTimeline();
      mostrarToast("Campaña guardada");
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("campana-cultivo").addEventListener("change", actualizarCamposSiembraSegunCultivo);

function actualizarCamposSiembraSegunCultivo() {
  const cultivo = document.getElementById("campana-cultivo").value;
  const esTrigo = cultivo === "Trigo";
  document.getElementById("siembra-campo-trigo").hidden = !esTrigo;
  document.getElementById("siembra-campo-otros").hidden = esTrigo;
}

// --- Chips de categoría: acordeón (solo un formulario abierto a la vez) ---
let edicionActual = null; // { id, tipo } del registro que se está editando, o null si es carga nueva

function salirModoEdicion(form) {
  edicionActual = null;
  form.reset();
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar";
}

document.getElementById("chips-categorias").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip-categoria");
  if (!btn) return;
  const form = document.getElementById("form-" + btn.dataset.cat);
  const estabaAbierto = !form.hidden;
  document.querySelectorAll(".form-categoria").forEach((f) => (f.hidden = true));
  form.hidden = estabaAbierto;
  if (form.id === "form-pulverizacion") document.getElementById("productos-lista").innerHTML = "";
  if (form.id === "form-siembra") document.getElementById("fertilizantes-lista").innerHTML = "";
  salirModoEdicion(form);
  if (!form.hidden) {
    const fechaInput = form.querySelector('[name="fecha"]');
    if (fechaInput && !fechaInput.value) fechaInput.valueAsDate = new Date();
    if (form.id === "form-pulverizacion") agregarFilaProducto();
    if (form.id === "form-siembra") {
      agregarFilaFertilizante({ nombre: "Urea" });
      agregarFilaFertilizante({ nombre: "Superfosfato Simple" });
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

// --- Editar un registro existente ---
function editarRegistro(id) {
  const registro = cargarRegistros().find((r) => r.id === id);
  if (!registro) return;
  const form = document.getElementById("form-" + registro.tipo);

  document.querySelectorAll(".form-categoria").forEach((f) => {
    if (f !== form) f.hidden = true;
  });
  form.hidden = false;

  form.reset();
  document.getElementById("productos-lista").innerHTML = "";
  document.getElementById("fertilizantes-lista").innerHTML = "";

  Object.keys(registro).forEach((campo) => {
    if (form.elements[campo]) form.elements[campo].value = registro[campo];
  });

  if (registro.tipo === "pulverizacion") {
    (registro.productos || []).forEach((p) => agregarFilaProducto(p));
    if (!document.getElementById("productos-lista").children.length) agregarFilaProducto();
  }
  if (registro.tipo === "siembra") {
    document.getElementById("campana-cultivo").value = registro.cultivo;
    actualizarCamposSiembraSegunCultivo();
    (registro.fertilizantes || []).forEach((f) => agregarFilaFertilizante(f));
    if (!document.getElementById("fertilizantes-lista").children.length) {
      agregarFilaFertilizante({ nombre: "Urea" });
      agregarFilaFertilizante({ nombre: "Superfosfato Simple" });
    }
    actualizarResultadoSiembra();
  }
  if (registro.tipo === "emergencia") actualizarResultadoEmergencia();

  edicionActual = { id: registro.id, tipo: registro.tipo };
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar cambios";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- Cálculo de semillas/ha (Siembra) ---
function calcularSemillasSiembra(datos, cultivo) {
  let semillasHaBruto = null;
  if (cultivo === "Trigo") {
    const dosis = parseFloat(datos.dosisKgHa);
    const pmg = parseFloat(datos.pmg);
    if (dosis > 0 && pmg > 0) semillasHaBruto = (dosis * 1000000) / pmg;
  } else {
    const semMetro = parseFloat(datos.semillasPorMetro);
    const distCm = parseFloat(datos.distanciaCm);
    if (semMetro > 0 && distCm > 0) semillasHaBruto = semMetro * (1000000 / distCm);
  }
  const pg = parseFloat(datos.pg);
  const semillasHaViables = semillasHaBruto != null && pg > 0 ? semillasHaBruto * (pg / 100) : null;
  return { semillasHaBruto, semillasHaViables };
}

function actualizarResultadoSiembra() {
  const form = document.getElementById("form-siembra");
  const datos = Object.fromEntries(new FormData(form).entries());
  const cultivo = document.getElementById("campana-cultivo").value;
  const { semillasHaBruto, semillasHaViables } = calcularSemillasSiembra(datos, cultivo);
  const p = document.getElementById("siembra-resultado");
  if (semillasHaViables != null) {
    p.textContent = `Semillas/ha viables (con PG): ≈ ${Math.round(semillasHaViables).toLocaleString("es-AR")}`;
  } else if (semillasHaBruto != null) {
    p.textContent = `Semillas/ha (cargá el PG para ajustar): ≈ ${Math.round(semillasHaBruto).toLocaleString("es-AR")}`;
  } else {
    p.textContent = "";
  }
}

document.getElementById("form-siembra").addEventListener("input", actualizarResultadoSiembra);

// --- Cálculo de coeficiente de logro (Emergencia) ---
function buscarSiembraActual() {
  const campana = campanaActivaDe(loteActual);
  if (!campana) return null;
  const registros = cargarRegistros()
    .filter((r) => r.tipo === "siembra" && r.lote === loteActual && r.cultivo === campana.cultivo && r.temporada === campana.temporada)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return registros[0] || null;
}

function actualizarResultadoEmergencia() {
  const form = document.getElementById("form-emergencia");
  const plantasM2 = parseFloat(form.elements["plantasM2"].value);
  const siembra = buscarSiembraActual();
  const p = document.getElementById("emergencia-resultado");
  if (!siembra || !siembra.semillasHaViables) {
    p.textContent = "Cargá primero una Siembra con PG y densidad para calcular el logro.";
    return;
  }
  if (!(plantasM2 > 0)) {
    p.textContent = "";
    return;
  }
  const logro = ((plantasM2 * 10000) / siembra.semillasHaViables) * 100;
  p.textContent = `Coeficiente de logro: ≈ ${logro.toFixed(1)}%`;
}

document.getElementById("form-emergencia").addEventListener("input", actualizarResultadoEmergencia);

// --- Guardar registros de cada categoría ---
function requiereCampana() {
  const campana = campanaActivaDe(loteActual);
  if (!campana) {
    mostrarToast("Primero asigná una campaña a este lote");
    return null;
  }
  return campana;
}

function guardarRegistroCategoria(tipo, datosExtra) {
  if (edicionActual && edicionActual.tipo === tipo) {
    return db.collection("registros").doc(edicionActual.id).update(datosExtra);
  }
  const campana = requiereCampana();
  if (!campana) return null;
  const registro = {
    tipo,
    lote: loteActual,
    cultivo: campana.cultivo,
    temporada: campana.temporada,
    creado: new Date().toISOString(),
    ...datosExtra,
  };
  return db.collection("registros").add(registro);
}

document.getElementById("form-malezas").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const promesa = guardarRegistroCategoria("malezas", datos);
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      form.hidden = true;
      mostrarToast(editando ? "Malezas actualizadas" : "Malezas guardadas");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-pulverizacion").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const productos = [...document.querySelectorAll("#productos-lista .producto-fila")]
    .map((fila) => ({
      nombre: fila.querySelector(".producto-nombre").value.trim(),
      dosis: fila.querySelector(".producto-dosis").value,
      unidad: fila.querySelector(".producto-unidad").value,
    }))
    .filter((p) => p.nombre);
  const promesa = guardarRegistroCategoria("pulverizacion", { ...datos, productos });
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      document.getElementById("productos-lista").innerHTML = "";
      form.hidden = true;
      mostrarToast(editando ? "Pulverización actualizada" : "Pulverización guardada");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-siembra").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const cultivo = document.getElementById("campana-cultivo").value;
  const { semillasHaBruto, semillasHaViables } = calcularSemillasSiembra(datos, cultivo);
  const fertilizantes = [...document.querySelectorAll("#fertilizantes-lista .producto-fila")]
    .map((fila) => ({
      nombre: fila.querySelector(".fertilizante-nombre").value.trim(),
      dosis: fila.querySelector(".fertilizante-dosis").value,
    }))
    .filter((f) => f.nombre && f.dosis);
  const promesa = guardarRegistroCategoria("siembra", { ...datos, semillasHaBruto, semillasHaViables, fertilizantes });
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      document.getElementById("siembra-resultado").textContent = "";
      document.getElementById("fertilizantes-lista").innerHTML = "";
      form.hidden = true;
      mostrarToast(editando ? "Siembra actualizada" : "Siembra guardada");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-emergencia").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const siembra = buscarSiembraActual();
  let coeficienteLogro = "";
  if (siembra && siembra.semillasHaViables && datos.plantasM2) {
    coeficienteLogro = (((parseFloat(datos.plantasM2) * 10000) / siembra.semillasHaViables) * 100).toFixed(1);
  }
  const promesa = guardarRegistroCategoria("emergencia", { ...datos, coeficienteLogro });
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      document.getElementById("emergencia-resultado").textContent = "";
      form.hidden = true;
      mostrarToast(editando ? "Emergencia actualizada" : "Emergencia guardada");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-cosecha").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const promesa = guardarRegistroCategoria("cosecha", datos);
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      form.hidden = true;
      mostrarToast(editando ? "Cosecha actualizada" : "Cosecha guardada");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Línea de tiempo ---
function renderTimeline() {
  const cont = document.getElementById("ficha-timeline");
  const campana = campanaActivaDe(loteActual);
  if (!campana) {
    cont.innerHTML = '<p class="vacio">Asigná una campaña para empezar a cargar datos.</p>';
    return;
  }
  const registros = cargarRegistros()
    .filter((r) => r.lote === loteActual && r.cultivo === campana.cultivo && r.temporada === campana.temporada)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  cont.innerHTML = registros.length
    ? registros.map(renderTarjetaTimeline).join("")
    : '<p class="vacio">Todavía no hay datos cargados en esta campaña.</p>';
}

function renderTarjetaTimeline(r) {
  const detalle = detalleParaMostrar(r);
  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(NOMBRES_CATEGORIA[r.tipo] || r.tipo)}</span>
        <span class="lote-fecha">${escapeHtml(r.fecha || "")}</span>
      </div>
      <dl>${detalle}</dl>
      <div class="tarjeta-acciones">
        <button class="btn-editar" data-id="${r.id}">Editar</button>
        <button class="btn-eliminar" data-id="${r.id}">Eliminar</button>
      </div>
    </div>
  `;
}

function detalleParaMostrar(r) {
  if (r.tipo === "pulverizacion") {
    const productosTexto = (r.productos || []).map((p) => `${p.nombre} — ${p.dosis} ${p.unidad}`).join("; ");
    const filas = [
      ["Momento", r.momento],
      ["Productos", productosTexto],
      ["Observaciones", r.observaciones],
    ];
    return filas.filter(([, v]) => v).map(([label, v]) => `<dt>${label}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  }
  const campos = CAMPOS_CATEGORIA[r.tipo] || [];
  let html = campos
    .filter((c) => !["fecha", "lote", "cultivo", "temporada", "fertilizantesTexto"].includes(c) && r[c])
    .map((c) => `<dt>${ETIQUETAS_CAMPO[c] || c}</dt><dd>${escapeHtml(String(r[c]))}</dd>`)
    .join("");
  if (r.tipo === "siembra") {
    const fertTexto = (r.fertilizantes || []).map((f) => `${f.nombre} — ${f.dosis} kg/ha`).join("; ");
    if (fertTexto) html += `<dt>Fertilización</dt><dd>${escapeHtml(fertTexto)}</dd>`;
  }
  return html;
}

document.getElementById("ficha-timeline").addEventListener("click", (e) => {
  const btnEditar = e.target.closest(".btn-editar");
  if (btnEditar) {
    editarRegistro(btnEditar.dataset.id);
    return;
  }
  const btn = e.target.closest(".btn-eliminar");
  if (!btn) return;
  if (!confirm("¿Eliminar este registro?")) return;
  db.collection("registros")
    .doc(btn.dataset.id)
    .delete()
    .then(() => renderTimeline())
    .catch(() => mostrarToast("No se pudo eliminar (revisá tu conexión)"));
});

// --- Historial de campañas anteriores ---
document.getElementById("btn-ver-historial").addEventListener("click", () => {
  const cont = document.getElementById("ficha-historial");
  cont.hidden = !cont.hidden;
  if (!cont.hidden) renderHistorial();
});

function renderHistorial() {
  const cont = document.getElementById("ficha-historial");
  const campanaActiva = campanaActivaDe(loteActual);
  const registros = cargarRegistros().filter((r) => r.lote === loteActual);
  const combos = new Map();
  registros.forEach((r) => {
    if (campanaActiva && r.cultivo === campanaActiva.cultivo && r.temporada === campanaActiva.temporada) return;
    const clave = `${r.cultivo}__${r.temporada}`;
    if (!combos.has(clave)) combos.set(clave, { cultivo: r.cultivo, temporada: r.temporada, cantidad: 0 });
    combos.get(clave).cantidad++;
  });
  if (combos.size === 0) {
    cont.innerHTML = '<p class="vacio">No hay campañas anteriores para este lote.</p>';
    return;
  }
  cont.innerHTML = [...combos.values()]
    .map(
      (c) =>
        `<button type="button" class="btn-secundario btn-historial-item" data-cultivo="${escapeHtml(c.cultivo)}" data-temporada="${escapeHtml(c.temporada)}">${escapeHtml(c.cultivo)} ${escapeHtml(c.temporada)} (${c.cantidad})</button>`
    )
    .join("");
}

document.getElementById("ficha-historial").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-historial-item");
  if (!btn) return;
  renderTimelineDeCampana(btn.dataset.cultivo, btn.dataset.temporada);
});

function renderTimelineDeCampana(cultivo, temporada) {
  const cont = document.getElementById("ficha-timeline");
  const registros = cargarRegistros()
    .filter((r) => r.lote === loteActual && r.cultivo === cultivo && r.temporada === temporada)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  cont.innerHTML =
    `<p class="campana-actual-label">Viendo campaña anterior: ${escapeHtml(cultivo)} ${escapeHtml(temporada)}
      <button type="button" id="btn-volver-campana-activa" class="btn-secundario">Volver a la actual</button>
    </p>` + (registros.length ? registros.map(renderTarjetaTimeline).join("") : '<p class="vacio">Sin registros.</p>');
  document.getElementById("btn-volver-campana-activa").addEventListener("click", renderTimeline);
}

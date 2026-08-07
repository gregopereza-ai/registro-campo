const CAMPOS_CATEGORIA = {
  malezas: ["fecha", "lote", "cultivo", "temporada", "malezas", "insectos", "enfermedades", "observaciones", "rendimientoEstimado"],
  pulverizacion: ["fecha", "lote", "cultivo", "temporada", "momento", "observaciones", "contratista"],
  siembra: ["fecha", "lote", "cultivo", "temporada", "variedad", "hectareas", "origen", "pg", "dosisKgHa", "pmg", "semillasPorMetro", "distanciaCm", "semillasHaBruto", "semillasHaViables", "contratista"],
  emergencia: ["fecha", "lote", "cultivo", "temporada", "plantasM2", "coeficienteLogro"],
  cosecha: ["fecha", "lote", "cultivo", "temporada", "fechaFloracion", "hectareas", "rendimientoKgHa", "humedad", "contratista"],
  laboreo: ["fecha", "lote", "cultivo", "temporada", "tipoLaboreo", "contratista", "observaciones"],
};

const ETIQUETAS_CAMPO = {
  fecha: "Fecha", lote: "Lote", cultivo: "Cultivo", temporada: "Temporada",
  malezas: "Malezas", insectos: "Insectos", enfermedades: "Enfermedades",
  momento: "Momento", observaciones: "Observaciones",
  variedad: "Variedad/Híbrido", hectareas: "Hectáreas", origen: "Origen", pg: "PG (%)",
  dosisKgHa: "Dosis (kg/ha)", pmg: "PMG (g)", semillasPorMetro: "Semillas/metro", distanciaCm: "Distancia (cm)",
  semillasHaBruto: "Semillas/ha (bruto)", semillasHaViables: "Semillas/ha (viables)",
  plantasM2: "Plantas/m²", coeficienteLogro: "Coeficiente de logro (%)",
  fechaFloracion: "Fecha floración", rendimientoKgHa: "Rendimiento (kg/ha)", humedad: "Humedad (%)",
  contratista: "Contratista", tipoLaboreo: "Tipo de laboreo", rendimientoEstimado: "Rendimiento estimado (kg/ha)",
};

const NOMBRES_CATEGORIA = {
  malezas: "Monitoreo", pulverizacion: "Pulverización", siembra: "Siembra",
  emergencia: "Emergencia", cosecha: "Floración/Cosecha", laboreo: "Laboreo",
};

let loteActual = null;

// --- Campaña activa por lote: sincronizada en vivo con Firestore ---
let campanasLoteCache = {};
let unsubscribeCampanas = null;

// Los nombres de lote pueden traer "/" (ej. "33/34 A1"), y Firestore no permite
// "/" dentro de un id de documento (lo interpreta como separador de ruta).
// Por eso el id de documento va saneado, pero el nombre real del lote se guarda
// siempre como campo "lote" adentro del doc, y el cache se arma a partir de ese
// campo (con doc.id como respaldo para docs viejos que no lo tenían).
function idDocLote(lote) {
  return lote.replace(/\//g, "__");
}

function iniciarListenerCampanas() {
  if (unsubscribeCampanas) return;
  unsubscribeCampanas = db.collection("campanasLote").onSnapshot(
    (snapshot) => {
      const nuevoMapa = {};
      snapshot.forEach((doc) => {
        const datos = doc.data();
        nuevoMapa[datos.lote || doc.id] = datos;
      });
      campanasLoteCache = nuevoMapa;
      onCampanasActualizadas();
    },
    () => mostrarToast("No se pudo sincronizar las campañas con la nube")
  );
}

function onCampanasActualizadas() {
  if (typeof renderPanelAvanceGeneral === "function") renderPanelAvanceGeneral();
  if (!loteActual || !document.getElementById("tab-ficha").classList.contains("active")) return;
  actualizarEtiquetaCampana();
  actualizarMetaFicha();
  renderTimeline();
}

function campanaActivaDe(lote) {
  // Un doc puede existir solo por tener hectareasOficiales cargadas, sin campaña asignada
  // todavía (cultivo/temporada) — en ese caso no cuenta como "campaña activa".
  const campana = campanasLoteCache[lote];
  return campana && campana.cultivo ? campana : null;
}

// Hectáreas "oficiales" cargadas a mano por el usuario para este lote (su planilla),
// que reemplazan a las hectáreas calculadas del polígono del mapa en toda la app.
function hectareasOficialesDe(lote) {
  const campana = campanasLoteCache[lote];
  const valor = campana && campana.hectareasOficiales;
  return valor != null && valor !== "" ? parseFloat(valor) : null;
}

function hectareasDeLote(lote, loteInfo) {
  const oficial = hectareasOficialesDe(lote);
  if (oficial != null) return oficial;
  return loteInfo && loteInfo.hectareasTotales != null ? loteInfo.hectareasTotales : null;
}

function agregarFilaProducto(valores = {}) {
  const cont = document.getElementById("productos-lista");
  const fila = document.createElement("div");
  fila.className = "producto-fila";
  fila.innerHTML = `
    <div class="autocomplete-wrap">
      <input type="text" class="producto-nombre" placeholder="Producto (ej: Glifosato)" value="${(valores.nombre || "").replace(/"/g, "&quot;")}" autocomplete="off">
      <div class="autocomplete-lista" hidden></div>
    </div>
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

// --- Catálogo de insumos: autocompletar con lo ya usado antes (sin colección aparte) ---
function nombresUsados(campo) {
  const nombres = new Set();
  cargarRegistros().forEach((r) => {
    if (campo === "productos" && r.tipo === "pulverizacion") {
      (r.productos || []).forEach((p) => { if (p.nombre) nombres.add(p.nombre); });
    }
    if (campo === "fertilizantes" && r.tipo === "siembra") {
      (r.fertilizantes || []).forEach((f) => { if (f.nombre) nombres.add(f.nombre); });
    }
    if (campo === "contratistas" && r.contratista) {
      nombres.add(r.contratista);
    }
    if (campo === "tiposLaboreo" && r.tipo === "laboreo" && r.tipoLaboreo) {
      nombres.add(r.tipoLaboreo);
    }
  });
  return [...nombres].sort((a, b) => a.localeCompare(b));
}

function unidadUsadaPara(nombreProducto) {
  const regs = cargarRegistros()
    .filter((r) => r.tipo === "pulverizacion")
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  for (const r of regs) {
    const p = (r.productos || []).find((p) => p.nombre === nombreProducto);
    if (p) return p.unidad;
  }
  return null;
}

function mostrarAutocompletar(input, opciones) {
  const lista = input.closest(".autocomplete-wrap").querySelector(".autocomplete-lista");
  const texto = input.value.trim().toLowerCase();
  if (!texto) {
    lista.innerHTML = "";
    lista.hidden = true;
    return;
  }
  const coincidencias = opciones
    .filter((o) => o.toLowerCase().includes(texto) && o.toLowerCase() !== texto)
    .slice(0, 6);
  if (!coincidencias.length) {
    lista.innerHTML = "";
    lista.hidden = true;
    return;
  }
  lista.innerHTML = coincidencias.map((o) => `<div class="autocomplete-item">${escapeHtml(o)}</div>`).join("");
  lista.hidden = false;
}

function ocultarAutocompletar(input) {
  input.closest(".autocomplete-wrap").querySelector(".autocomplete-lista").hidden = true;
}

document.getElementById("productos-lista").addEventListener("input", (e) => {
  if (!e.target.classList.contains("producto-nombre")) return;
  mostrarAutocompletar(e.target, nombresUsados("productos"));
});

document.getElementById("productos-lista").addEventListener("focusout", (e) => {
  if (!e.target.classList.contains("producto-nombre")) return;
  setTimeout(() => ocultarAutocompletar(e.target), 150);
});

document.getElementById("productos-lista").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-quitar-producto");
  if (!btn) return;
  btn.closest(".producto-fila").remove();
});

// --- Autocompletar: un solo listener global para cualquier sugerencia (filas dinámicas o campos simples) ---
document.addEventListener("click", (e) => {
  const sugerencia = e.target.closest(".autocomplete-item");
  if (!sugerencia) return;
  const input = sugerencia.closest(".autocomplete-wrap").querySelector("input");
  if (!input) return;
  input.value = sugerencia.textContent;
  ocultarAutocompletar(input);
  if (input.classList.contains("producto-nombre")) {
    const unidad = unidadUsadaPara(sugerencia.textContent);
    const selectUnidad = input.closest(".producto-fila").querySelector(".producto-unidad");
    if (unidad && selectUnidad) selectUnidad.value = unidad;
  }
});

// --- Autocompletar en un campo de texto simple (no repetible), ej. Contratista o Tipo de laboreo ---
function iniciarAutocompletarCampo(inputId, obtenerOpciones) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("input", () => mostrarAutocompletar(input, obtenerOpciones()));
  input.addEventListener("focusout", () => setTimeout(() => ocultarAutocompletar(input), 150));
}

iniciarAutocompletarCampo("pulverizacion-contratista", () => nombresUsados("contratistas"));
iniciarAutocompletarCampo("siembra-contratista", () => nombresUsados("contratistas"));
iniciarAutocompletarCampo("cosecha-contratista", () => nombresUsados("contratistas"));
iniciarAutocompletarCampo("laboreo-contratista", () => nombresUsados("contratistas"));
iniciarAutocompletarCampo("laboreo-tipo", () => nombresUsados("tiposLaboreo"));

function agregarFilaFertilizante(valores = {}) {
  const cont = document.getElementById("fertilizantes-lista");
  const fila = document.createElement("div");
  fila.className = "producto-fila";
  fila.innerHTML = `
    <div class="autocomplete-wrap">
      <input type="text" class="fertilizante-nombre" placeholder="Fertilizante (ej: Urea)" value="${(valores.nombre || "").replace(/"/g, "&quot;")}" autocomplete="off">
      <div class="autocomplete-lista" hidden></div>
    </div>
    <input type="number" class="fertilizante-dosis" placeholder="Kg/ha" step="0.1" value="${valores.dosis || ""}">
    <button type="button" class="btn-quitar-producto">✕</button>
  `;
  cont.appendChild(fila);
}

document.getElementById("btn-agregar-fertilizante").addEventListener("click", () => agregarFilaFertilizante());

document.getElementById("fertilizantes-lista").addEventListener("input", (e) => {
  if (!e.target.classList.contains("fertilizante-nombre")) return;
  mostrarAutocompletar(e.target, nombresUsados("fertilizantes"));
});

document.getElementById("fertilizantes-lista").addEventListener("focusout", (e) => {
  if (!e.target.classList.contains("fertilizante-nombre")) return;
  setTimeout(() => ocultarAutocompletar(e.target), 150);
});

document.getElementById("fertilizantes-lista").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-quitar-producto");
  if (!btn) return;
  btn.closest(".producto-fila").remove();
});

// --- Foto de Monitoreo: se comprime en el celular antes de guardarla ---
let fotoActual = null; // dataURL (string) de la foto lista para guardar, o null

function comprimirImagen(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Archivo de imagen inválido"));
      img.onload = () => {
        const maxLado = 1000;
        let { width, height } = img;
        if (width > height && width > maxLado) {
          height = Math.round((height * maxLado) / width);
          width = maxLado;
        } else if (height > maxLado) {
          width = Math.round((width * maxLado) / height);
          height = maxLado;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function mostrarPreviewFoto(dataUrl) {
  fotoActual = dataUrl;
  const preview = document.getElementById("malezas-foto-preview");
  const img = document.getElementById("malezas-foto-img");
  const boton = document.getElementById("btn-elegir-foto");
  if (dataUrl) {
    img.src = dataUrl;
    preview.hidden = false;
    boton.hidden = true;
  } else {
    img.src = "";
    preview.hidden = true;
    boton.hidden = false;
  }
}

document.getElementById("btn-elegir-foto").addEventListener("click", () => {
  document.getElementById("malezas-foto-input").click();
});

document.getElementById("malezas-foto-input").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  const estado = document.getElementById("malezas-foto-estado");
  estado.textContent = "Preparando foto...";
  comprimirImagen(archivo)
    .then((dataUrl) => {
      estado.textContent = "";
      mostrarPreviewFoto(dataUrl);
    })
    .catch(() => {
      estado.textContent = "";
      mostrarToast("No se pudo procesar la foto");
    });
});

document.getElementById("btn-quitar-foto").addEventListener("click", () => mostrarPreviewFoto(null));

// --- Meta del lote: nombre, ambiente, hectáreas (oficiales u obtenidas del mapa) ---
function actualizarMetaFicha() {
  const lote = lotesCache.find((l) => l.nombre === loteActual);
  const haOficial = hectareasOficialesDe(loteActual);
  document.getElementById("ficha-nombre").textContent = loteActual || "";
  document.getElementById("ficha-meta").textContent = lote
    ? `${lote.ambiente} — ${
        haOficial != null
          ? haOficial.toFixed(1) + " ha"
          : lote.hectareasTotales != null
          ? lote.hectareasTotales.toFixed(1) + " ha (del mapa)"
          : "sin datos de ha"
      }`
    : "";
  document.getElementById("hectareas-oficiales").value = haOficial != null ? haOficial : "";
  document.getElementById("hectareas-oficiales-nota").textContent =
    lote && lote.hectareasTotales != null ? `Según el mapa: ${lote.hectareasTotales.toFixed(1)} ha` : "";
  // Colapsado por defecto para evitar toques accidentales: hay que tocar "Cambiar" para editarlo.
  document.getElementById("bloque-hectareas-oficiales").hidden = true;
}

document.getElementById("btn-mostrar-hectareas-oficiales").addEventListener("click", () => {
  const bloque = document.getElementById("bloque-hectareas-oficiales");
  bloque.hidden = !bloque.hidden;
  if (!bloque.hidden) document.getElementById("hectareas-oficiales").focus();
});

document.getElementById("btn-guardar-hectareas-oficiales").addEventListener("click", () => {
  if (!loteActual) return;
  const valor = document.getElementById("hectareas-oficiales").value;
  const hectareasOficiales = valor ? parseFloat(valor) : null;
  db.collection("campanasLote")
    .doc(idDocLote(loteActual))
    .set({ lote: loteActual, hectareasOficiales }, { merge: true })
    .then(() => {
      mostrarToast("Hectáreas oficiales guardadas");
      document.getElementById("bloque-hectareas-oficiales").hidden = true;
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Abrir / cerrar Ficha del lote ---
function abrirFicha(nombreLote) {
  loteActual = nombreLote;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-ficha").classList.add("active");

  actualizarMetaFicha();

  document.querySelectorAll(".form-categoria").forEach((f) => {
    f.hidden = true;
    f.reset();
  });
  document.getElementById("productos-lista").innerHTML = "";
  document.getElementById("fertilizantes-lista").innerHTML = "";
  document.getElementById("siembra-resultado").textContent = "";
  document.getElementById("emergencia-resultado").textContent = "";
  document.getElementById("ficha-historial").hidden = true;
  mostrarPreviewFoto(null);

  const campana = campanaActivaDe(nombreLote);
  document.getElementById("campana-cultivo").value = campana ? campana.cultivo : "Trigo";
  document.getElementById("campana-temporada").value = campana ? campana.temporada : "";
  document.getElementById("campana-hectareas-plan").value = campana && campana.hectareasPlan ? campana.hectareasPlan : "";

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

// --- Avance de campaña: planificado / sembrado / cosechado / producción ---
function sumarCampo(tipo, campo, lote, cultivo, temporada) {
  return cargarRegistros()
    .filter((r) => r.tipo === tipo && r.lote === lote && r.cultivo === cultivo && r.temporada === temporada && r.estado !== "planificada")
    .reduce((suma, r) => suma + (parseFloat(r[campo]) || 0), 0);
}

function calcularAvanceCampana(lote, campana) {
  const sembrado = sumarCampo("siembra", "hectareas", lote, campana.cultivo, campana.temporada);
  const cosechado = sumarCampo("cosecha", "hectareas", lote, campana.cultivo, campana.temporada);
  const produccion = cargarRegistros()
    .filter((r) => r.tipo === "cosecha" && r.lote === lote && r.cultivo === campana.cultivo && r.temporada === campana.temporada)
    .reduce((suma, r) => {
      const ha = parseFloat(r.hectareas) || 0;
      const rinde = parseFloat(r.rendimientoKgHa) || 0;
      return suma + (ha * rinde) / 1000; // toneladas
    }, 0);
  const hectareasPlan = campana.hectareasPlan ? parseFloat(campana.hectareasPlan) : null;
  return { sembrado, cosechado, produccion, hectareasPlan };
}

function actualizarAvanceCampana() {
  const cont = document.getElementById("campana-avance");
  const campana = campanaActivaDe(loteActual);
  if (!campana) {
    cont.hidden = true;
    return;
  }
  const { sembrado, cosechado, produccion, hectareasPlan } = calcularAvanceCampana(loteActual, campana);
  if (!sembrado && !hectareasPlan) {
    cont.hidden = true;
    return;
  }
  cont.hidden = false;

  document.getElementById("avance-sembrado").textContent = `${sembrado.toFixed(1)} ha`;
  document.getElementById("avance-sembrado-etq").textContent = hectareasPlan
    ? `Sembrado (${Math.round((sembrado / hectareasPlan) * 100)}% del plan)`
    : "Sembrado";

  document.getElementById("avance-cosechado").textContent = `${cosechado.toFixed(1)} ha`;
  document.getElementById("avance-cosechado-etq").textContent = sembrado
    ? `Cosechado (${Math.round((cosechado / sembrado) * 100)}%)`
    : "Cosechado";

  document.getElementById("avance-produccion").textContent = `${produccion.toFixed(1)} t`;
}

document.getElementById("btn-guardar-campana").addEventListener("click", () => {
  const cultivo = document.getElementById("campana-cultivo").value;
  const temporada = document.getElementById("campana-temporada").value.trim();
  const hectareasPlanValor = document.getElementById("campana-hectareas-plan").value;
  const hectareasPlan = hectareasPlanValor ? parseFloat(hectareasPlanValor) : null;
  if (!temporada) {
    mostrarToast("Ingresá la temporada (ej: 26/27)");
    return;
  }
  db.collection("campanasLote")
    .doc(idDocLote(loteActual))
    .set({ cultivo, temporada, hectareasPlan, lote: loteActual }, { merge: true })
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
  if (form.id === "form-malezas") mostrarPreviewFoto(null);
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

  if (registro.tipo === "malezas") {
    mostrarPreviewFoto(registro.foto || null);
  }
  if (form.elements["esPlan"]) {
    form.elements["esPlan"].checked = registro.estado === "planificada";
  }
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
    .filter((r) => r.tipo === "siembra" && r.lote === loteActual && r.cultivo === campana.cultivo && r.temporada === campana.temporada && r.estado !== "planificada")
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
  datos.foto = fotoActual || "";
  const promesa = guardarRegistroCategoria("malezas", datos);
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      mostrarPreviewFoto(null);
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
  const estado = datos.esPlan ? "planificada" : "confirmada";
  delete datos.esPlan;
  const productos = [...document.querySelectorAll("#productos-lista .producto-fila")]
    .map((fila) => ({
      nombre: fila.querySelector(".producto-nombre").value.trim(),
      dosis: fila.querySelector(".producto-dosis").value,
      unidad: fila.querySelector(".producto-unidad").value,
    }))
    .filter((p) => p.nombre);
  const promesa = guardarRegistroCategoria("pulverizacion", { ...datos, productos, estado });
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      document.getElementById("productos-lista").innerHTML = "";
      form.hidden = true;
      mostrarToast(editando ? (estado === "planificada" ? "Plan actualizado" : "Pulverización actualizada") : (estado === "planificada" ? "Plan guardado" : "Pulverización guardada"));
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-siembra").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const estado = datos.esPlan ? "planificada" : "confirmada";
  delete datos.esPlan;
  const cultivo = document.getElementById("campana-cultivo").value;
  const { semillasHaBruto, semillasHaViables } = calcularSemillasSiembra(datos, cultivo);
  const fertilizantes = [...document.querySelectorAll("#fertilizantes-lista .producto-fila")]
    .map((fila) => ({
      nombre: fila.querySelector(".fertilizante-nombre").value.trim(),
      dosis: fila.querySelector(".fertilizante-dosis").value,
    }))
    .filter((f) => f.nombre && f.dosis);
  const promesa = guardarRegistroCategoria("siembra", { ...datos, semillasHaBruto, semillasHaViables, fertilizantes, estado });
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      document.getElementById("siembra-resultado").textContent = "";
      document.getElementById("fertilizantes-lista").innerHTML = "";
      form.hidden = true;
      mostrarToast(editando ? (estado === "planificada" ? "Plan actualizado" : "Siembra actualizada") : (estado === "planificada" ? "Plan guardado" : "Siembra guardada"));
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

document.getElementById("form-laboreo").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const promesa = guardarRegistroCategoria("laboreo", datos);
  if (!promesa) return;
  promesa
    .then(() => {
      salirModoEdicion(form);
      form.hidden = true;
      mostrarToast(editando ? "Laboreo actualizado" : "Laboreo guardado");
      renderTimeline();
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Línea de tiempo ---
function renderTimeline() {
  actualizarAvanceCampana();
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
  const esPlan = r.estado === "planificada";
  return `
    <div class="registro-card${esPlan ? " es-plan" : ""}">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(NOMBRES_CATEGORIA[r.tipo] || r.tipo)}</span>
        <span class="lote-fecha">${escapeHtml(r.fecha || "")}</span>
      </div>
      ${esPlan ? '<span class="badge-plan">📋 PLANIFICADA</span>' : ""}
      <dl>${detalle}</dl>
      <div class="tarjeta-acciones">
        ${esPlan ? `<button class="btn-confirmar" data-id="${r.id}">✓ Confirmar</button>` : ""}
        <button class="btn-editar" data-id="${r.id}">Editar</button>
        <button class="btn-eliminar" data-id="${r.id}">Eliminar</button>
      </div>
    </div>
  `;
}

// --- Estimador de rendimiento: compara la estimación cargada en Monitoreo contra el rendimiento real de Cosecha ---
function buscarEstimacionRendimiento(r) {
  return cargarRegistros()
    .filter((x) => x.tipo === "malezas" && x.lote === r.lote && x.cultivo === r.cultivo && x.temporada === r.temporada && x.rendimientoEstimado)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0] || null;
}

function detalleParaMostrar(r) {
  if (r.tipo === "pulverizacion") {
    const productosTexto = (r.productos || []).map((p) => `${p.nombre} — ${p.dosis} ${p.unidad}`).join("; ");
    const filas = [
      ["Momento", r.momento],
      ["Productos", productosTexto],
      ["Contratista", r.contratista],
      ["Observaciones", r.observaciones],
    ];
    return filas.filter(([, v]) => v).map(([label, v]) => `<dt>${label}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  }
  const campos = CAMPOS_CATEGORIA[r.tipo] || [];
  let html = campos
    .filter((c) => !["fecha", "lote", "cultivo", "temporada"].includes(c) && r[c])
    .map((c) => `<dt>${ETIQUETAS_CAMPO[c] || c}</dt><dd>${escapeHtml(String(r[c]))}</dd>`)
    .join("");
  if (r.tipo === "siembra") {
    const fertTexto = (r.fertilizantes || []).map((f) => `${f.nombre} — ${f.dosis} kg/ha`).join("; ");
    if (fertTexto) html += `<dt>Fertilización</dt><dd>${escapeHtml(fertTexto)}</dd>`;
  }
  if (r.tipo === "malezas" && r.foto) {
    html += `<dd><img src="${r.foto}" class="foto-timeline" alt="Foto del monitoreo"></dd>`;
  }
  if (r.tipo === "cosecha" && r.rendimientoKgHa) {
    const estimacion = buscarEstimacionRendimiento(r);
    if (estimacion) {
      const estimado = parseFloat(estimacion.rendimientoEstimado);
      const real = parseFloat(r.rendimientoKgHa);
      if (estimado > 0) {
        const diffPct = ((real - estimado) / estimado) * 100;
        const signo = diffPct >= 0 ? "+" : "";
        html += `<dt>Vs. estimación</dt><dd>Estimabas ${Math.round(estimado).toLocaleString("es-AR")} kg/ha (${signo}${diffPct.toFixed(1)}%)</dd>`;
      }
    }
  }
  return html;
}

document.getElementById("ficha-timeline").addEventListener("click", (e) => {
  const foto = e.target.closest(".foto-timeline");
  if (foto) {
    const ventana = window.open();
    if (ventana) ventana.document.write(`<img src="${foto.src}" style="max-width:100%">`);
    return;
  }
  const btnConfirmar = e.target.closest(".btn-confirmar");
  if (btnConfirmar) {
    db.collection("registros")
      .doc(btnConfirmar.dataset.id)
      .update({ estado: "confirmada" })
      .then(() => mostrarToast("Confirmado"))
      .catch(() => mostrarToast("No se pudo confirmar (revisá tu conexión)"));
    return;
  }
  const btnEditar = e.target.closest(".btn-editar");
  if (btnEditar) {
    editarRegistro(btnEditar.dataset.id);
    return;
  }
  const btn = e.target.closest(".btn-eliminar");
  if (!btn) return;
  if (!confirm("¿Eliminar este registro? Vas a poder recuperarlo desde la Papelera.")) return;
  db.collection("registros")
    .doc(btn.dataset.id)
    .update({ eliminado: true, eliminadoEn: new Date().toISOString() })
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

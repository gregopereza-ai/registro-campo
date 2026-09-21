// --- Planificaciones: planificar y confirmar labores en varios lotes a la vez ---

// Selección que se conserva aunque la pantalla se redibuje (por ejemplo cuando llega un cambio de la nube)
const planLotesTildados = new Set(); // nombres de lote tildados en "Planificar"
const planHectareas = {}; // lote -> hectáreas escritas a mano (solo Siembra)
const planCampanasAbiertas = new Set(); // claves "cultivo__temporada" desplegadas en "Planificar"
const confTildadas = new Set(); // ids de registro tildados en "Confirmar"
const confCampanasAbiertas = new Set(); // idem, en "Confirmar"

function claveCampana(cultivo, temporada) {
  return `${cultivo}__${temporada}`;
}

function ordenarLotes(a, b) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

// Campañas activas hoy y los lotes que tiene asignados cada una.
function campanasActivasConLotes() {
  const grupos = new Map();
  Object.entries(campanasLoteCache).forEach(([lote, campana]) => {
    if (!campana || !campana.cultivo || !campana.temporada) return;
    const clave = claveCampana(campana.cultivo, campana.temporada);
    if (!grupos.has(clave)) grupos.set(clave, { clave, cultivo: campana.cultivo, temporada: campana.temporada, lotes: [] });
    grupos.get(clave).lotes.push(lote);
  });
  const lista = [...grupos.values()];
  lista.forEach((g) => g.lotes.sort(ordenarLotes));
  lista.sort((a, b) => b.temporada.localeCompare(a.temporada) || a.cultivo.localeCompare(b.cultivo));
  return lista;
}

function hectareasSugeridasDeLote(lote) {
  const campana = campanasLoteCache[lote] || {};
  const plan = parseFloat(campana.hectareasPlan);
  if (plan > 0) return plan;
  const info = typeof lotesCache !== "undefined" ? lotesCache.find((l) => l.nombre === lote) : null;
  const ha = hectareasDeLote(lote, info);
  return ha != null ? Math.round(ha * 10) / 10 : "";
}

function nombreTareaPlan(r) {
  return `${NOMBRES_CATEGORIA[r.tipo] || r.tipo}${r.tipo === "pulverizacion" && r.momento ? " — " + r.momento : ""}`;
}

// --- Pestañas internas: Planificar / Confirmar ---
document.querySelectorAll(".subtab-plan").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab-plan").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("plan-vista-planificar").hidden = btn.dataset.sub !== "planificar";
    document.getElementById("plan-vista-confirmar").hidden = btn.dataset.sub !== "confirmar";
  });
});

// --- Planificar: campos del formulario ---
function actualizarCamposPlan() {
  const tipo = document.getElementById("plan-tipo").value;
  document.getElementById("plan-momento-label").hidden = tipo !== "pulverizacion";
  document.getElementById("plan-campos-pulverizacion").hidden = tipo !== "pulverizacion";
  document.getElementById("plan-campos-siembra").hidden = tipo !== "siembra";
  document.getElementById("plan-fecha").required = true;
  renderPlanCampanas();
}
document.getElementById("plan-tipo").addEventListener("change", actualizarCamposPlan);

const listaProductosPlan = document.getElementById("plan-productos-lista");
document.getElementById("btn-plan-agregar-producto").addEventListener("click", () => agregarFilaProducto({}, listaProductosPlan));
listaProductosPlan.addEventListener("input", (e) => {
  if (e.target.classList.contains("producto-nombre")) mostrarAutocompletar(e.target, nombresUsados("productos"));
});
listaProductosPlan.addEventListener("focusout", (e) => {
  if (e.target.classList.contains("producto-nombre")) setTimeout(() => ocultarAutocompletar(e.target), 150);
});
listaProductosPlan.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-quitar-producto");
  if (btn) btn.closest(".producto-fila").remove();
});
iniciarAutocompletarCampo("plan-contratista", () => nombresUsados("contratistas"));
iniciarAutocompletarCampo("plan-variedad", () => nombresUsados("variedades"));

// --- Planificar: lista de campañas y lotes ---
function renderPlanCampanas() {
  const cont = document.getElementById("plan-campanas");
  const esSiembra = document.getElementById("plan-tipo").value === "siembra";
  const grupos = campanasActivasConLotes();
  const lotesVigentes = new Set(grupos.flatMap((g) => g.lotes));
  [...planLotesTildados].forEach((l) => { if (!lotesVigentes.has(l)) planLotesTildados.delete(l); });

  if (!grupos.length) {
    cont.innerHTML = '<p class="vacio">Todavía no hay campañas asignadas a ningún lote.</p>';
    return;
  }
  cont.innerHTML = grupos
    .map((g) => {
      const tildados = g.lotes.filter((l) => planLotesTildados.has(l)).length;
      const abierta = planCampanasAbiertas.has(g.clave);
      const todos = tildados === g.lotes.length;
      const filas = g.lotes
        .map((l) => {
          const ha = planHectareas[l] != null ? planHectareas[l] : hectareasSugeridasDeLote(l);
          return `
            <div class="plan-lote-fila">
              <label class="plan-lote-check">
                <input type="checkbox" data-lote="${escapeHtml(l)}" ${planLotesTildados.has(l) ? "checked" : ""}>
                <span>${escapeHtml(l)}</span>
              </label>
              ${esSiembra ? `<input type="number" class="plan-lote-ha" min="0" step="0.1" data-lote="${escapeHtml(l)}" value="${ha}" aria-label="Hectáreas de ${escapeHtml(l)}"><span class="opcional">ha</span>` : `<span class="opcional">${ha !== "" ? ha + " ha" : ""}</span>`}
            </div>`;
        })
        .join("");
      return `
        <div class="plan-campana">
          <button type="button" class="plan-campana-cab" data-clave="${escapeHtml(g.clave)}">
            <span>${abierta ? "▾" : "▸"} ${escapeHtml(g.cultivo)} ${escapeHtml(g.temporada)}</span>
            <span class="plan-campana-cuenta">${tildados > 0 ? `<b>${tildados}</b> de ` : ""}${g.lotes.length} lote${g.lotes.length === 1 ? "" : "s"}</span>
          </button>
          <div class="plan-campana-cuerpo" ${abierta ? "" : "hidden"}>
            <label class="plan-todos">
              <input type="checkbox" data-todos="${escapeHtml(g.clave)}" ${todos ? "checked" : ""}>
              Tildar todos los lotes de ${escapeHtml(g.cultivo)} ${escapeHtml(g.temporada)}
            </label>
            ${filas}
          </div>
        </div>`;
    })
    .join("");
  const total = planLotesTildados.size;
  document.getElementById("btn-plan-guardar").textContent = total > 0 ? `Crear planes (${total} lote${total === 1 ? "" : "s"})` : "Crear planes";
}

document.getElementById("plan-campanas").addEventListener("click", (e) => {
  const cab = e.target.closest(".plan-campana-cab");
  if (!cab) return;
  const clave = cab.dataset.clave;
  if (planCampanasAbiertas.has(clave)) planCampanasAbiertas.delete(clave);
  else planCampanasAbiertas.add(clave);
  renderPlanCampanas();
});

document.getElementById("plan-campanas").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.todos) {
    const grupo = campanasActivasConLotes().find((g) => g.clave === t.dataset.todos);
    if (grupo) grupo.lotes.forEach((l) => (t.checked ? planLotesTildados.add(l) : planLotesTildados.delete(l)));
    renderPlanCampanas();
  } else if (t.type === "checkbox" && t.dataset.lote) {
    if (t.checked) planLotesTildados.add(t.dataset.lote);
    else planLotesTildados.delete(t.dataset.lote);
    renderPlanCampanas();
  }
});

document.getElementById("plan-campanas").addEventListener("input", (e) => {
  if (e.target.classList.contains("plan-lote-ha")) planHectareas[e.target.dataset.lote] = e.target.value;
});

// --- Planificar: crear los planes ---
document.getElementById("form-plan-multi").addEventListener("submit", (e) => {
  e.preventDefault();
  const tipo = document.getElementById("plan-tipo").value;
  const fecha = document.getElementById("plan-fecha").value;
  const momento = document.getElementById("plan-momento").value;
  const contratista = document.getElementById("plan-contratista").value.trim();
  const tarifaUsdHa = document.getElementById("plan-tarifa").value;
  const observaciones = document.getElementById("plan-observaciones").value.trim();

  const productos = [...listaProductosPlan.querySelectorAll(".producto-fila")]
    .map((fila) => ({
      nombre: fila.querySelector(".producto-nombre").value.trim(),
      dosis: fila.querySelector(".producto-dosis").value,
      unidad: fila.querySelector(".producto-unidad").value,
    }))
    .filter((p) => p.nombre);

  if (!fecha) return mostrarToast("Falta la fecha planificada");
  if (tipo === "pulverizacion" && !productos.length) return mostrarToast("Agregá al menos un producto");

  const grupos = campanasActivasConLotes();
  const lotes = grupos.flatMap((g) => g.lotes.filter((l) => planLotesTildados.has(l)).map((l) => ({ lote: l, cultivo: g.cultivo, temporada: g.temporada })));
  if (!lotes.length) return mostrarToast("Tildá al menos un lote");

  // No duplicar: si el lote ya tiene un plan igual (mismo tipo, fecha y momento), se saltea.
  const yaExiste = (l) =>
    cargarRegistros().some(
      (r) =>
        r.estado === "planificada" &&
        r.tipo === tipo &&
        r.lote === l.lote &&
        r.cultivo === l.cultivo &&
        r.temporada === l.temporada &&
        r.fecha === fecha &&
        (tipo !== "pulverizacion" || r.momento === momento)
    );
  const nuevos = lotes.filter((l) => !yaExiste(l));
  const salteados = lotes.length - nuevos.length;
  if (!nuevos.length) return mostrarToast("Esos lotes ya tienen este plan cargado");

  const nombreLabor = tipo === "pulverizacion" ? `Pulverización — ${momento}` : "Siembra";
  const detalleSalteo = salteados ? `\n(${salteados} lote${salteados === 1 ? "" : "s"} ya tenía${salteados === 1 ? "" : "n"} este plan y se saltea${salteados === 1 ? "" : "n"}.)` : "";
  if (!confirm(`Vas a crear ${nuevos.length} plan${nuevos.length === 1 ? "" : "es"} de ${nombreLabor} para el ${formatearFecha(fecha)}.${detalleSalteo}\n\n¿Seguir?`)) return;

  const boton = document.getElementById("btn-plan-guardar");
  boton.disabled = true;
  const batch = db.batch();
  const ahora = new Date().toISOString();
  nuevos.forEach((l) => {
    const base = { tipo, lote: l.lote, cultivo: l.cultivo, temporada: l.temporada, creado: ahora, estado: "planificada", fecha, contratista, tarifaUsdHa, observaciones };
    const registro =
      tipo === "pulverizacion"
        ? { ...base, momento, hectareasReales: "", productos }
        : {
            ...base,
            variedad: document.getElementById("plan-variedad").value.trim(),
            origen: document.getElementById("plan-origen").value,
            hectareas: String(planHectareas[l.lote] != null ? planHectareas[l.lote] : hectareasSugeridasDeLote(l.lote)),
            fertilizantes: [],
          };
    batch.set(db.collection("registros").doc(), registro);
  });
  batch
    .commit()
    .then(() => {
      mostrarToast(`Se crearon ${nuevos.length} plan${nuevos.length === 1 ? "" : "es"}`);
      planLotesTildados.clear();
      renderPlanificaciones();
    })
    .catch(() => mostrarToast("No se pudieron crear los planes (revisá tu conexión)"))
    .finally(() => (boton.disabled = false));
});

// --- Confirmar: lista de labores pendientes ---
function laboresPendientes() {
  return cargarRegistros().filter((r) => {
    if (r.estado !== "planificada" || !r.fecha) return false;
    const campana = campanaActivaDe(r.lote);
    return campana && campana.cultivo === r.cultivo && campana.temporada === r.temporada;
  });
}

function renderConfirmar() {
  const cont = document.getElementById("conf-campanas");
  const hoy = fechaHoyLocal();
  const pendientes = laboresPendientes();
  const idsVigentes = new Set(pendientes.map((r) => r.id));
  [...confTildadas].forEach((id) => { if (!idsVigentes.has(id)) confTildadas.delete(id); });

  const porCampana = new Map();
  pendientes.forEach((r) => {
    const clave = claveCampana(r.cultivo, r.temporada);
    if (!porCampana.has(clave)) porCampana.set(clave, { clave, cultivo: r.cultivo, temporada: r.temporada, filas: [] });
    porCampana.get(clave).filas.push(r);
  });
  const grupos = [...porCampana.values()].sort((a, b) => b.temporada.localeCompare(a.temporada) || a.cultivo.localeCompare(b.cultivo));
  grupos.forEach((g) => g.filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || ordenarLotes(a.lote, b.lote)));

  const boton = document.getElementById("btn-conf-guardar");
  boton.textContent = confTildadas.size > 0 ? `Confirmar ${confTildadas.size} labor${confTildadas.size === 1 ? "" : "es"}` : "Confirmar labores";
  boton.disabled = confTildadas.size === 0;

  if (!grupos.length) {
    cont.innerHTML = '<p class="vacio">No hay labores planificadas pendientes de confirmar. ✅</p>';
    return;
  }
  cont.innerHTML = grupos
    .map((g) => {
      const tildadas = g.filas.filter((r) => confTildadas.has(r.id)).length;
      const abierta = confCampanasAbiertas.has(g.clave);
      const vencidas = g.filas.filter((r) => r.fecha < hoy).length;
      const filas = g.filas
        .map((r) => {
          const dias = r.fecha < hoy ? diasEntreFechas(r.fecha, hoy) : 0;
          return `
            <div class="plan-lote-fila${dias > 0 ? " plan-vencida" : ""}">
              <label class="plan-lote-check">
                <input type="checkbox" data-id="${escapeHtml(r.id)}" ${confTildadas.has(r.id) ? "checked" : ""}>
                <span>${escapeHtml(r.lote)}<br><span class="opcional">${escapeHtml(nombreTareaPlan(r))}</span></span>
              </label>
              <span class="plan-fecha-txt">${dias > 0 ? `⚠️ ${dias} día${dias === 1 ? "" : "s"}<br>` : ""}<span class="opcional">${formatearFecha(r.fecha)}</span></span>
            </div>`;
        })
        .join("");
      return `
        <div class="plan-campana">
          <button type="button" class="plan-campana-cab" data-clave="${escapeHtml(g.clave)}">
            <span>${abierta ? "▾" : "▸"} ${escapeHtml(g.cultivo)} ${escapeHtml(g.temporada)}</span>
            <span class="plan-campana-cuenta">${tildadas > 0 ? `<b>${tildadas}</b> de ` : ""}${g.filas.length} pendiente${g.filas.length === 1 ? "" : "s"}${vencidas ? ` · ⚠️ ${vencidas}` : ""}</span>
          </button>
          <div class="plan-campana-cuerpo" ${abierta ? "" : "hidden"}>
            <label class="plan-todos">
              <input type="checkbox" data-todos="${escapeHtml(g.clave)}" ${tildadas === g.filas.length ? "checked" : ""}>
              Tildar todas las de ${escapeHtml(g.cultivo)} ${escapeHtml(g.temporada)}
            </label>
            ${filas}
          </div>
        </div>`;
    })
    .join("");
}

document.getElementById("conf-campanas").addEventListener("click", (e) => {
  const cab = e.target.closest(".plan-campana-cab");
  if (!cab) return;
  const clave = cab.dataset.clave;
  if (confCampanasAbiertas.has(clave)) confCampanasAbiertas.delete(clave);
  else confCampanasAbiertas.add(clave);
  renderConfirmar();
});

document.getElementById("conf-campanas").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.todos) {
    laboresPendientes()
      .filter((r) => claveCampana(r.cultivo, r.temporada) === t.dataset.todos)
      .forEach((r) => (t.checked ? confTildadas.add(r.id) : confTildadas.delete(r.id)));
    renderConfirmar();
  } else if (t.type === "checkbox" && t.dataset.id) {
    if (t.checked) confTildadas.add(t.dataset.id);
    else confTildadas.delete(t.dataset.id);
    renderConfirmar();
  }
});

document.getElementById("conf-mantener-fecha").addEventListener("change", (e) => {
  document.getElementById("conf-fecha").disabled = e.target.checked;
});

document.getElementById("btn-conf-guardar").addEventListener("click", () => {
  const ids = [...confTildadas];
  if (!ids.length) return;
  const mantener = document.getElementById("conf-mantener-fecha").checked;
  const fecha = document.getElementById("conf-fecha").value;
  if (!mantener && !fecha) return mostrarToast("Elegí la fecha en que se hicieron");

  const textoFecha = mantener ? "con la fecha planificada de cada una" : `con fecha ${formatearFecha(fecha)}`;
  if (!confirm(`Vas a confirmar ${ids.length} labor${ids.length === 1 ? "" : "es"} ${textoFecha}.\n\n¿Seguir?`)) return;

  const boton = document.getElementById("btn-conf-guardar");
  boton.disabled = true;
  const batch = db.batch();
  ids.forEach((id) => batch.update(db.collection("registros").doc(id), mantener ? { estado: "confirmada" } : { estado: "confirmada", fecha }));
  batch
    .commit()
    .then(() => {
      mostrarToast(`Se confirmaron ${ids.length} labor${ids.length === 1 ? "" : "es"}`);
      confTildadas.clear();
      renderPlanificaciones();
    })
    .catch(() => {
      mostrarToast("No se pudo confirmar (revisá tu conexión)");
      renderPlanificaciones();
    });
});

// --- Redibujar todo (se llama al abrir la pestaña y cuando llegan cambios de la nube) ---
function renderPlanificaciones() {
  const fechaConf = document.getElementById("conf-fecha");
  if (fechaConf && !fechaConf.value) fechaConf.value = fechaHoyLocal();
  renderPlanCampanas();
  renderConfirmar();
}

// Un plan nuevo arranca con un producto vacío, igual que el formulario de Pulverización de la ficha.
agregarFilaProducto({}, listaProductosPlan);

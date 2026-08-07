// --- Poscosecha: Planta de Silos (fija) + Silobolsa (van y vienen) ---
// No está atado a lote ni campaña. No importa de qué lote vino el cereal.

const SILOS = [
  { numero: 1, capacidad: 800 },
  { numero: 2, capacidad: 800 },
  { numero: 3, capacidad: 800 },
  { numero: 4, capacidad: 800 },
  { numero: 5, capacidad: 500 },
  { numero: 6, capacidad: 500 },
  { numero: 7, capacidad: 500 },
  { numero: 8, capacidad: 500 },
  { numero: 9, capacidad: 2000 },
  { numero: 10, capacidad: 250 },
  { numero: 11, capacidad: 250 },
  { numero: 12, capacidad: 250 },
  { numero: 13, capacidad: 250 },
];

// siloMovCacheCompleto/silobolsasCacheCompleto incluyen los borrados (para la Papelera);
// las versiones sin "Completo" son las que usa el resto de la app.
let siloMovCacheCompleto = [];
let siloMovCache = [];
let unsubscribeSiloMov = null;

let silobolsasCacheCompleto = [];
let silobolsasCache = [];
let unsubscribeSilobolsas = null;

let siloSeleccionado = null; // número del silo con el detalle abierto, o null
let edicionSilobolsaActual = null; // id de la silobolsa en edición, o null
let bolsaSalidaAbierta = null; // id de la silobolsa con el formulario de salida abierto, o null

const CULTIVOS_POSCOSECHA = ["Soja", "Trigo", "Maíz", "Girasol"];

function iniciarListenerPoscosecha() {
  if (unsubscribeSiloMov) return;
  unsubscribeSiloMov = db.collection("siloMovimientos").onSnapshot(
    (snapshot) => {
      siloMovCacheCompleto = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      siloMovCache = siloMovCacheCompleto.filter((m) => !m.eliminado);
      renderPoscosecha();
      if (document.getElementById("tab-papelera").classList.contains("active") && typeof renderPapelera === "function") {
        renderPapelera();
      }
    },
    () => mostrarToast("No se pudo sincronizar los silos con la nube")
  );
  unsubscribeSilobolsas = db.collection("silobolsas").onSnapshot(
    (snapshot) => {
      silobolsasCacheCompleto = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      silobolsasCache = silobolsasCacheCompleto.filter((b) => !b.eliminado);
      renderPoscosecha();
      if (document.getElementById("tab-papelera").classList.contains("active") && typeof renderPapelera === "function") {
        renderPapelera();
      }
    },
    () => mostrarToast("No se pudo sincronizar las silobolsas con la nube")
  );
}

// --- Planta de Silos ---
function calcularStockSilo(numero) {
  const movs = siloMovCache.filter((m) => m.silo === numero);
  let toneladas = 0;
  let cultivo = null;
  movs
    .slice()
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    .forEach((m) => {
      if (m.tipo === "entrada") {
        toneladas += parseFloat(m.toneladas) || 0;
        if (m.cultivo) cultivo = m.cultivo;
      } else {
        toneladas -= parseFloat(m.toneladas) || 0;
      }
    });
  toneladas = Math.max(0, Math.round(toneladas * 10) / 10);
  return { toneladas, cultivo: toneladas > 0 ? cultivo : null };
}

// Toneladas que le quedan a una silobolsa: lo cargado menos las salidas parciales ya registradas.
function restanteSilobolsa(b) {
  const salidas = (b.salidas || []).reduce((suma, s) => suma + (parseFloat(s.toneladas) || 0), 0);
  return Math.max(0, Math.round(((parseFloat(b.toneladas) || 0) - salidas) * 10) / 10);
}

// Stock disponible por cereal: suma silos + silobolsas activas de Acopio.
// La semilla propia NO se suma acá — es para sembrar, no está disponible para venta.
function calcularStockPorCultivo() {
  const stock = {};
  CULTIVOS_POSCOSECHA.forEach((c) => (stock[c] = 0));
  SILOS.forEach((s) => {
    const { toneladas, cultivo } = calcularStockSilo(s.numero);
    if (cultivo && stock[cultivo] != null) stock[cultivo] += toneladas;
  });
  let haySemillaPropia = false;
  silobolsasCache
    .filter((b) => !b.cerrada)
    .forEach((b) => {
      if (b.tipo === "Semilla propia") {
        haySemillaPropia = true;
        return;
      }
      if (b.cultivo && stock[b.cultivo] != null) stock[b.cultivo] += restanteSilobolsa(b);
    });
  return { stock, haySemillaPropia };
}

function renderResumenCereales() {
  const { stock, haySemillaPropia } = calcularStockPorCultivo();
  const total = Object.values(stock).reduce((a, b) => a + b, 0);
  const filas = CULTIVOS_POSCOSECHA.map(
    (c) => `
      <div class="fila-cereal">
        <span>${escapeHtml(c)}</span>
        <span>${stock[c].toFixed(1)} tn</span>
      </div>
    `
  ).join("");
  document.getElementById("poscosecha-resumen-cereales").innerHTML =
    filas +
    `
      <div class="fila-cereal fila-cereal-total">
        <span>Total</span>
        <span>${total.toFixed(1)} tn</span>
      </div>
    `;
  document.getElementById("poscosecha-nota-semilla").hidden = !haySemillaPropia;
}

function renderPoscosecha() {
  const grid = document.getElementById("silos-grid");
  if (!grid) return;

  grid.innerHTML = SILOS.map((s) => {
    const { toneladas, cultivo } = calcularStockSilo(s.numero);
    const pct = Math.min(100, Math.round((toneladas / s.capacidad) * 100));
    const seleccionado = siloSeleccionado === s.numero;
    return `
      <div class="silo-card${seleccionado ? " seleccionado" : ""}" data-silo="${s.numero}">
        <span class="silo-numero">Silo ${s.numero}</span>
        <span class="silo-cultivo">${cultivo ? escapeHtml(cultivo) : "Vacío"}</span>
        <div class="barra-fondo"><div class="barra-relleno barra-silo" style="width:${pct}%"></div></div>
        <span class="silo-toneladas">${toneladas.toFixed(1)} / ${s.capacidad} tn</span>
      </div>
    `;
  }).join("");

  renderResumenCereales();
  renderDetalleSilo();
  renderSilobolsas();
}

document.getElementById("silos-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".silo-card");
  if (!card) return;
  const numero = parseInt(card.dataset.silo, 10);
  siloSeleccionado = siloSeleccionado === numero ? null : numero;
  renderDetalleSilo();
});

function renderDetalleSilo() {
  const cont = document.getElementById("detalle-silo");
  document.querySelectorAll(".silo-card").forEach((c) => {
    c.classList.toggle("seleccionado", parseInt(c.dataset.silo, 10) === siloSeleccionado);
  });
  if (!siloSeleccionado) {
    cont.hidden = true;
    return;
  }
  const silo = SILOS.find((s) => s.numero === siloSeleccionado);
  const { toneladas, cultivo } = calcularStockSilo(siloSeleccionado);
  const movs = siloMovCache
    .filter((m) => m.silo === siloSeleccionado)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  cont.hidden = false;
  cont.innerHTML = `
    <h3 class="detalle-dia-titulo">Silo ${silo.numero} — ${toneladas.toFixed(1)} / ${silo.capacidad} tn${cultivo ? " — " + escapeHtml(cultivo) : ""}</h3>
    <form id="form-movimiento-silo" class="form-categoria">
      <input type="hidden" name="silo" value="${silo.numero}">
      <label>Tipo
        <select name="tipo" id="movimiento-tipo">
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
        </select>
      </label>
      <label>Fecha
        <input type="date" name="fecha" required>
      </label>
      <label id="movimiento-campo-cultivo">Cultivo
        <select name="cultivo">
          <option value="Soja">Soja</option>
          <option value="Trigo">Trigo</option>
          <option value="Maíz">Maíz</option>
          <option value="Girasol">Girasol</option>
        </select>
      </label>
      <label>Toneladas
        <input type="number" name="toneladas" min="0" step="0.1" required>
      </label>
      <label>Observaciones <span class="opcional">(opcional)</span>
        <textarea name="observaciones" rows="2"></textarea>
      </label>
      <button type="submit" class="btn-primary">Guardar movimiento</button>
    </form>
    <div id="lista-movimientos-silo">
      ${movs.length ? movs.map(renderTarjetaMovimientoSilo).join("") : '<p class="vacio">Todavía no hay movimientos en este silo.</p>'}
    </div>
  `;
  const fechaInput = cont.querySelector('[name="fecha"]');
  if (fechaInput) fechaInput.valueAsDate = new Date();
  actualizarCampoCultivoMovimiento();
}

function actualizarCampoCultivoMovimiento() {
  const tipoSelect = document.getElementById("movimiento-tipo");
  const campoCultivo = document.getElementById("movimiento-campo-cultivo");
  if (!tipoSelect || !campoCultivo) return;
  campoCultivo.hidden = tipoSelect.value !== "entrada";
}

function renderTarjetaMovimientoSilo(m) {
  const esEntrada = m.tipo === "entrada";
  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${esEntrada ? "⬆️ Entrada" : "⬇️ Salida"}</span>
        <span class="lote-fecha">${escapeHtml(m.fecha || "")}</span>
      </div>
      <dl>
        <dt>Toneladas</dt><dd>${parseFloat(m.toneladas || 0).toFixed(1)} tn</dd>
        ${esEntrada && m.cultivo ? `<dt>Cultivo</dt><dd>${escapeHtml(m.cultivo)}</dd>` : ""}
        ${m.observaciones ? `<dt>Observaciones</dt><dd>${escapeHtml(m.observaciones)}</dd>` : ""}
      </dl>
      <div class="tarjeta-acciones">
        <button class="btn-eliminar btn-eliminar-mov" data-id="${m.id}">Eliminar</button>
      </div>
    </div>
  `;
}

document.getElementById("detalle-silo").addEventListener("change", (e) => {
  if (e.target.name === "tipo") actualizarCampoCultivoMovimiento();
});

document.getElementById("detalle-silo").addEventListener("submit", (e) => {
  if (e.target.id !== "form-movimiento-silo") return;
  e.preventDefault();
  const form = e.target;
  const datos = Object.fromEntries(new FormData(form).entries());
  const registro = {
    silo: parseInt(datos.silo, 10),
    tipo: datos.tipo,
    fecha: datos.fecha,
    toneladas: parseFloat(datos.toneladas) || 0,
    observaciones: datos.observaciones || "",
    creado: new Date().toISOString(),
  };
  if (datos.tipo === "entrada") registro.cultivo = datos.cultivo;
  db.collection("siloMovimientos")
    .add(registro)
    .then(() => mostrarToast(datos.tipo === "entrada" ? "Entrada guardada" : "Salida guardada"))
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Silobolsa ---
function renderSilobolsas() {
  const activas = silobolsasCache.filter((b) => !b.cerrada).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const cerradas = silobolsasCache
    .filter((b) => b.cerrada)
    .sort((a, b) => (b.fechaCierre || b.fecha || "").localeCompare(a.fechaCierre || a.fecha || ""));

  document.getElementById("lista-silobolsas-activas").innerHTML = activas.length
    ? activas.map(renderTarjetaSilobolsa).join("")
    : '<p class="vacio">No hay silobolsas activas.</p>';

  document.getElementById("btn-ver-silobolsas-cerradas").textContent = `Ver silobolsas cerradas (${cerradas.length})`;
  document.getElementById("lista-silobolsas-cerradas").innerHTML = cerradas.length
    ? cerradas.map(renderTarjetaSilobolsa).join("")
    : '<p class="vacio">Todavía no cerraste ninguna silobolsa.</p>';

  const fechaSalidaInput = document.querySelector(".form-salida-silobolsa [name='fecha']");
  if (fechaSalidaInput) fechaSalidaInput.valueAsDate = new Date();
}

function renderTarjetaSilobolsa(b) {
  const restante = restanteSilobolsa(b);
  const salidas = b.salidas || [];
  const mostrarFormSalida = !b.cerrada && bolsaSalidaAbierta === b.id;
  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(b.cultivo || "")} — ${escapeHtml(b.tipo || "")}</span>
        <span class="lote-fecha">${escapeHtml(b.fecha || "")}</span>
      </div>
      <dl>
        <dt>Ubicación</dt><dd>${escapeHtml(b.ubicacion || "—")}</dd>
        <dt>Toneladas cargadas</dt><dd>${parseFloat(b.toneladas || 0).toFixed(1)} tn</dd>
        <dt>Toneladas restantes</dt><dd>${restante.toFixed(1)} tn</dd>
        ${
          salidas.length
            ? `<dt>Salidas</dt><dd>${salidas
                .map(
                  (s) =>
                    `${escapeHtml(s.fecha || "")}: ${parseFloat(s.toneladas || 0).toFixed(1)} tn${
                      s.observaciones ? " — " + escapeHtml(s.observaciones) : ""
                    }`
                )
                .join("<br>")}</dd>`
            : ""
        }
        ${b.cerrada ? `<dt>Cerrada el</dt><dd>${escapeHtml(b.fechaCierre || "")}</dd>` : ""}
        ${b.observaciones ? `<dt>Observaciones</dt><dd>${escapeHtml(b.observaciones)}</dd>` : ""}
      </dl>
      <div class="tarjeta-acciones">
        ${!b.cerrada ? `<button class="btn-editar btn-toggle-salida-silobolsa" data-id="${b.id}">+ Salida</button>` : ""}
        ${!b.cerrada ? `<button class="btn-editar btn-cerrar-silobolsa" data-id="${b.id}">Cerrar</button>` : ""}
        <button class="btn-editar btn-editar-silobolsa" data-id="${b.id}">Editar</button>
        <button class="btn-eliminar btn-eliminar-silobolsa" data-id="${b.id}">Eliminar</button>
      </div>
      ${
        mostrarFormSalida
          ? `
        <form class="form-categoria form-salida-silobolsa" data-id="${b.id}">
          <label>Fecha
            <input type="date" name="fecha" required>
          </label>
          <label>Toneladas que salen
            <input type="number" name="toneladas" min="0" max="${restante}" step="0.1" required>
          </label>
          <label>Observaciones <span class="opcional">(opcional)</span>
            <input type="text" name="observaciones" placeholder="Ej: camión a acopio Tandil">
          </label>
          <button type="submit" class="btn-primary">Guardar salida</button>
        </form>
      `
          : ""
      }
    </div>
  `;
}

function actualizarTipoSilobolsaSegunCultivo() {
  const form = document.getElementById("form-silobolsa");
  const cultivo = form.elements["cultivo"].value;
  const tipoSelect = form.elements["tipo"];
  const permiteSemillaPropia = cultivo === "Soja" || cultivo === "Trigo";
  [...tipoSelect.options].forEach((opt) => {
    if (opt.value === "Semilla propia") opt.hidden = !permiteSemillaPropia;
  });
  if (!permiteSemillaPropia && tipoSelect.value === "Semilla propia") tipoSelect.value = "Acopio";
}

function salirModoEdicionSilobolsa(form) {
  edicionSilobolsaActual = null;
  form.reset();
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar";
  actualizarTipoSilobolsaSegunCultivo();
}

document.getElementById("btn-nueva-silobolsa").addEventListener("click", () => {
  const form = document.getElementById("form-silobolsa");
  const estabaAbierto = !form.hidden;
  form.hidden = estabaAbierto;
  salirModoEdicionSilobolsa(form);
  if (!form.hidden) {
    const fechaInput = form.querySelector('[name="fecha"]');
    if (fechaInput && !fechaInput.value) fechaInput.valueAsDate = new Date();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.getElementById("form-silobolsa").addEventListener("change", (e) => {
  if (e.target.name === "cultivo") actualizarTipoSilobolsaSegunCultivo();
});

document.getElementById("form-silobolsa").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionSilobolsaActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  const promesa = editando
    ? db.collection("silobolsas").doc(edicionSilobolsaActual).update(datos)
    : db.collection("silobolsas").add({
        ...datos,
        cerrada: false,
        fechaCierre: null,
        salidas: [],
        creado: new Date().toISOString(),
      });
  promesa
    .then(() => {
      salirModoEdicionSilobolsa(form);
      form.hidden = true;
      mostrarToast(editando ? "Silobolsa actualizada" : "Silobolsa guardada");
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

function editarSilobolsa(id) {
  const b = silobolsasCache.find((x) => x.id === id);
  if (!b) return;
  const form = document.getElementById("form-silobolsa");
  form.hidden = false;
  form.reset();
  Object.keys(b).forEach((campo) => {
    if (form.elements[campo]) form.elements[campo].value = b[campo];
  });
  actualizarTipoSilobolsaSegunCultivo();
  edicionSilobolsaActual = id;
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar cambios";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("btn-ver-silobolsas-cerradas").addEventListener("click", () => {
  const cont = document.getElementById("lista-silobolsas-cerradas");
  cont.hidden = !cont.hidden;
});

document.getElementById("lista-silobolsas-activas").addEventListener("submit", (e) => {
  const form = e.target.closest(".form-salida-silobolsa");
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.id;
  const bolsa = silobolsasCache.find((b) => b.id === id);
  if (!bolsa) return;
  const datos = Object.fromEntries(new FormData(form).entries());
  const nuevaSalida = {
    fecha: datos.fecha,
    toneladas: parseFloat(datos.toneladas) || 0,
    observaciones: datos.observaciones || "",
  };
  const salidas = [...(bolsa.salidas || []), nuevaSalida];
  db.collection("silobolsas")
    .doc(id)
    .update({ salidas })
    .then(() => {
      bolsaSalidaAbierta = null;
      mostrarToast("Salida guardada");
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Clicks de silobolsas y movimientos de silo (delegado en toda la pestaña) ---
document.getElementById("tab-poscosecha").addEventListener("click", (e) => {
  const btnToggleSalida = e.target.closest(".btn-toggle-salida-silobolsa");
  if (btnToggleSalida) {
    bolsaSalidaAbierta = bolsaSalidaAbierta === btnToggleSalida.dataset.id ? null : btnToggleSalida.dataset.id;
    renderSilobolsas();
    return;
  }
  const btnCerrar = e.target.closest(".btn-cerrar-silobolsa");
  if (btnCerrar) {
    if (!confirm("¿Cerrar esta silobolsa? Se considera vacía.")) return;
    db.collection("silobolsas")
      .doc(btnCerrar.dataset.id)
      .update({ cerrada: true, fechaCierre: new Date().toISOString().slice(0, 10) })
      .then(() => mostrarToast("Silobolsa cerrada"))
      .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
    return;
  }
  const btnEditarBolsa = e.target.closest(".btn-editar-silobolsa");
  if (btnEditarBolsa) {
    editarSilobolsa(btnEditarBolsa.dataset.id);
    return;
  }
  const btnEliminarBolsa = e.target.closest(".btn-eliminar-silobolsa");
  if (btnEliminarBolsa) {
    if (!confirm("¿Eliminar esta silobolsa? Vas a poder recuperarla desde la Papelera.")) return;
    db.collection("silobolsas")
      .doc(btnEliminarBolsa.dataset.id)
      .update({ eliminado: true, eliminadoEn: new Date().toISOString() })
      .catch(() => mostrarToast("No se pudo eliminar (revisá tu conexión)"));
    return;
  }
  const btnEliminarMov = e.target.closest(".btn-eliminar-mov");
  if (btnEliminarMov) {
    if (!confirm("¿Eliminar este movimiento? Vas a poder recuperarlo desde la Papelera.")) return;
    db.collection("siloMovimientos")
      .doc(btnEliminarMov.dataset.id)
      .update({ eliminado: true, eliminadoEn: new Date().toISOString() })
      .catch(() => mostrarToast("No se pudo eliminar (revisá tu conexión)"));
    return;
  }
});

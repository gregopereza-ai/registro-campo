// --- Clima (Lluvia / Helada): general para todo el campo, no está atado a lote ni campaña ---
const NOMBRES_CLIMA = { lluvia: "Lluvia", helada: "Helada" };
const ICONOS_CLIMA = { lluvia: "🌧️", helada: "❄️" };

// climaCacheCompleto incluye los borrados (para la Papelera); climaCache es lo que usa el resto de la app.
let climaCacheCompleto = [];
let climaCache = [];
let unsubscribeClima = null;
let edicionClimaActual = null; // { id, tipo } del registro en edición, o null

function iniciarListenerClima() {
  if (unsubscribeClima) return;
  unsubscribeClima = db.collection("clima").onSnapshot(
    (snapshot) => {
      climaCacheCompleto = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      climaCache = climaCacheCompleto.filter((c) => !c.eliminado);
      renderClima();
      if (document.getElementById("tab-papelera").classList.contains("active") && typeof renderPapelera === "function") {
        renderPapelera();
      }
    },
    () => mostrarToast("No se pudo sincronizar el clima con la nube")
  );
}

// --- Chips: acordeón, un formulario a la vez ---
function salirModoEdicionClima(form) {
  edicionClimaActual = null;
  form.reset();
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar";
}

document.getElementById("chips-clima").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip-categoria");
  if (!btn) return;
  const form = document.getElementById("form-" + btn.dataset.cat);
  const estabaAbierto = !form.hidden;
  document.querySelectorAll("#tab-clima .form-categoria").forEach((f) => (f.hidden = true));
  form.hidden = estabaAbierto;
  salirModoEdicionClima(form);
  if (!form.hidden) {
    const fechaInput = form.querySelector('[name="fecha"]');
    if (fechaInput && !fechaInput.value) fechaInput.valueAsDate = new Date();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

// --- Guardar (lluvia / helada) ---
function guardarClima(tipo, datos) {
  if (edicionClimaActual && edicionClimaActual.tipo === tipo) {
    return db.collection("clima").doc(edicionClimaActual.id).update(datos);
  }
  return db.collection("clima").add({ tipo, ...datos, creado: new Date().toISOString() });
}

document.getElementById("form-lluvia").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionClimaActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  guardarClima("lluvia", datos)
    .then(() => {
      salirModoEdicionClima(form);
      form.hidden = true;
      mostrarToast(editando ? "Lluvia actualizada" : "Lluvia guardada");
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

document.getElementById("form-helada").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const editando = !!edicionClimaActual;
  const datos = Object.fromEntries(new FormData(form).entries());
  guardarClima("helada", datos)
    .then(() => {
      salirModoEdicionClima(form);
      form.hidden = true;
      mostrarToast(editando ? "Helada actualizada" : "Helada guardada");
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

// --- Resumen: mm del mes/año, heladas del año ---
function renderResumenClima() {
  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const inicioAnio = `${hoy.getFullYear()}-01-01`;

  const mmDesde = (desde) =>
    climaCache
      .filter((c) => c.tipo === "lluvia" && (c.fecha || "") >= desde)
      .reduce((suma, c) => suma + (parseFloat(c.mm) || 0), 0);

  const heladasAnio = climaCache.filter((c) => c.tipo === "helada" && (c.fecha || "") >= inicioAnio);

  document.getElementById("lluvia-mes").textContent = `${mmDesde(inicioMes).toFixed(1)} mm`;
  document.getElementById("lluvia-anio").textContent = `${mmDesde(inicioAnio).toFixed(1)} mm`;
  document.getElementById("heladas-anio").textContent = String(heladasAnio.length);
}

// --- Calendario mensual ---
const DIAS_SEMANA_CLIMA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_CLIMA = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

let mesCalendarioClima = new Date();
let diaSeleccionadoClima = null; // "YYYY-MM-DD" del día que se muestra en el detalle, o null

function renderClima() {
  renderResumenClima();
  renderCalendarioClima();
}

function renderCalendarioClima() {
  const cont = document.getElementById("calendario-clima");
  if (!climaCache.length) {
    document.getElementById("calendario-titulo").textContent = "";
    cont.innerHTML = '<p class="vacio">Todavía no hay datos de clima cargados.</p>';
    document.getElementById("detalle-dia-clima").hidden = true;
    return;
  }

  const anio = mesCalendarioClima.getFullYear();
  const mes = mesCalendarioClima.getMonth();
  document.getElementById("calendario-titulo").textContent = `${MESES_CLIMA[mes]} ${anio}`;

  const primerDiaSemana = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const hoyStr = new Date().toISOString().slice(0, 10);

  const porFecha = {};
  climaCache.forEach((c) => {
    if (!porFecha[c.fecha]) porFecha[c.fecha] = [];
    porFecha[c.fecha].push(c);
  });

  let celdas = DIAS_SEMANA_CLIMA.map((d) => `<div class="dia-semana-nombre">${d}</div>`).join("");
  for (let i = 0; i < primerDiaSemana; i++) celdas += `<div class="dia-calendario vacio-relleno"></div>`;

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const registros = porFecha[fecha] || [];
    const lluvia = registros.find((r) => r.tipo === "lluvia");
    const helada = registros.find((r) => r.tipo === "helada");
    const clases = ["dia-calendario"];
    if (fecha === hoyStr) clases.push("es-hoy");
    if (registros.length) clases.push("con-datos");
    if (fecha === diaSeleccionadoClima) clases.push("seleccionado");
    celdas += `
      <div class="${clases.join(" ")}" data-fecha="${fecha}">
        <span class="dia-numero">${d}</span>
        ${lluvia ? `<span class="chip-dia chip-lluvia">🌧️ ${Math.round(lluvia.mm)}mm</span>` : ""}
        ${helada ? `<span class="chip-dia chip-helada">❄️ ${Math.round(helada.tempMin)}°</span>` : ""}
      </div>
    `;
  }
  cont.innerHTML = celdas;

  actualizarDetalleDiaClima();
}

function actualizarDetalleDiaClima() {
  const cont = document.getElementById("detalle-dia-clima");
  if (!diaSeleccionadoClima) {
    cont.hidden = true;
    return;
  }
  const registros = climaCache.filter((c) => c.fecha === diaSeleccionadoClima);
  if (!registros.length) {
    diaSeleccionadoClima = null;
    cont.hidden = true;
    return;
  }
  const [anio, mes, dia] = diaSeleccionadoClima.split("-");
  cont.hidden = false;
  cont.innerHTML = `<h3 class="detalle-dia-titulo">📅 ${dia}/${mes}/${anio}</h3>` + registros.map(renderTarjetaClima).join("");
}

document.getElementById("calendario-clima").addEventListener("click", (e) => {
  const celda = e.target.closest(".dia-calendario.con-datos");
  if (!celda) return;
  diaSeleccionadoClima = celda.dataset.fecha === diaSeleccionadoClima ? null : celda.dataset.fecha;
  renderCalendarioClima();
});

document.getElementById("btn-mes-anterior").addEventListener("click", () => {
  mesCalendarioClima = new Date(mesCalendarioClima.getFullYear(), mesCalendarioClima.getMonth() - 1, 1);
  renderCalendarioClima();
});

document.getElementById("btn-mes-siguiente").addEventListener("click", () => {
  mesCalendarioClima = new Date(mesCalendarioClima.getFullYear(), mesCalendarioClima.getMonth() + 1, 1);
  renderCalendarioClima();
});

function renderTarjetaClima(c) {
  const valor =
    c.tipo === "lluvia"
      ? `${parseFloat(c.mm || 0).toFixed(1)} mm`
      : `${parseFloat(c.tempMin || 0).toFixed(1)} °C`;
  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${ICONOS_CLIMA[c.tipo] || ""} ${escapeHtml(NOMBRES_CLIMA[c.tipo] || c.tipo)}</span>
        <span class="lote-fecha">${escapeHtml(c.fecha || "")}</span>
      </div>
      <dl>
        <dt>${c.tipo === "lluvia" ? "Milímetros" : "Temperatura mínima"}</dt>
        <dd>${valor}</dd>
        ${c.observaciones ? `<dt>Observaciones</dt><dd>${escapeHtml(c.observaciones)}</dd>` : ""}
      </dl>
      <div class="tarjeta-acciones">
        <button class="btn-editar" data-id="${c.id}" data-tipo="${c.tipo}">Editar</button>
        <button class="btn-eliminar" data-id="${c.id}">Eliminar</button>
      </div>
    </div>
  `;
}

function editarClima(id, tipo) {
  const registro = climaCache.find((c) => c.id === id);
  if (!registro) return;
  const form = document.getElementById("form-" + tipo);
  document.querySelectorAll("#tab-clima .form-categoria").forEach((f) => {
    if (f !== form) f.hidden = true;
  });
  form.hidden = false;
  form.reset();
  Object.keys(registro).forEach((campo) => {
    if (form.elements[campo]) form.elements[campo].value = registro[campo];
  });
  edicionClimaActual = { id: registro.id, tipo };
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.textContent = "Guardar cambios";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("detalle-dia-clima").addEventListener("click", (e) => {
  const btnEditar = e.target.closest(".btn-editar");
  if (btnEditar) {
    editarClima(btnEditar.dataset.id, btnEditar.dataset.tipo);
    return;
  }
  const btn = e.target.closest(".btn-eliminar");
  if (!btn) return;
  if (!confirm("¿Eliminar este registro? Vas a poder recuperarlo desde la Papelera.")) return;
  db.collection("clima")
    .doc(btn.dataset.id)
    .update({ eliminado: true, eliminadoEn: new Date().toISOString() })
    .catch(() => mostrarToast("No se pudo eliminar (revisá tu conexión)"));
});

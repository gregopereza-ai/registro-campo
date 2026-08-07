// --- Feed de actividad: lo último de todos los lotes + Clima, en una sola lista ---
const MAX_ITEMS_FEED = 50;

function resumenFeedRegistro(r) {
  switch (r.tipo) {
    case "malezas": {
      const partes = [r.malezas, r.insectos, r.enfermedades].filter(Boolean);
      return partes.length ? partes.join(" · ") : r.observaciones || "Monitoreo cargado";
    }
    case "pulverizacion": {
      const productos = (r.productos || []).map((p) => p.nombre).filter(Boolean);
      let texto = productos.slice(0, 2).join(", ");
      if (productos.length > 2) texto += ` +${productos.length - 2} más`;
      if (r.contratista) texto += ` — ${r.contratista}`;
      return texto || "Pulverización cargada";
    }
    case "siembra": {
      const partes = [r.variedad, r.hectareas ? `${r.hectareas} ha` : null].filter(Boolean);
      return partes.join(" — ") || "Siembra cargada";
    }
    case "emergencia":
      return r.plantasM2
        ? `${r.plantasM2} plantas/m²${r.coeficienteLogro ? ` — logro ${r.coeficienteLogro}%` : ""}`
        : "Emergencia cargada";
    case "cosecha":
      return r.rendimientoKgHa ? `${r.rendimientoKgHa} kg/ha${r.contratista ? ` — ${r.contratista}` : ""}` : "Cosecha cargada";
    case "laboreo":
      return [r.tipoLaboreo, r.contratista].filter(Boolean).join(" — ") || "Laboreo cargado";
    default:
      return "";
  }
}

function resumenFeedClima(c) {
  return c.tipo === "lluvia" ? `${parseFloat(c.mm || 0).toFixed(1)} mm` : `${parseFloat(c.tempMin || 0).toFixed(1)} °C`;
}

function renderTarjetaFeed(item) {
  const esClima = item.coleccion === "clima";
  const nombreTipo = esClima
    ? `${ICONOS_CLIMA[item.tipo] || ""} ${NOMBRES_CLIMA[item.tipo] || item.tipo}`
    : NOMBRES_CATEGORIA[item.tipo] || item.tipo;
  const lugar = esClima ? "Clima general" : item.lote || "";
  const resumen = esClima ? resumenFeedClima(item) : resumenFeedRegistro(item);
  const esPlan = item.estado === "planificada";
  return `
    <div class="registro-card feed-card${esPlan ? " es-plan" : ""}" data-coleccion="${item.coleccion}" data-lote="${escapeHtml(item.lote || "")}" data-fecha="${escapeHtml(item.fecha || "")}">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(nombreTipo)}</span>
        <span class="lote-fecha">${escapeHtml(item.fecha || "")}</span>
      </div>
      <p class="feed-lugar">📍 ${escapeHtml(lugar)}</p>
      ${esPlan ? '<span class="badge-plan">📋 PLANIFICADA</span>' : ""}
      <p class="feed-resumen">${escapeHtml(resumen)}</p>
    </div>
  `;
}

function renderFeed() {
  const cont = document.getElementById("lista-feed");
  if (!cont) return;
  const registros = (typeof cargarRegistros === "function" ? cargarRegistros() : []).map((r) => ({ ...r, coleccion: "registro" }));
  const clima = (typeof climaCache !== "undefined" ? climaCache : []).map((c) => ({ ...c, coleccion: "clima" }));
  const todos = [...registros, ...clima]
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .slice(0, MAX_ITEMS_FEED);

  cont.innerHTML = todos.length ? todos.map(renderTarjetaFeed).join("") : '<p class="vacio">Todavía no hay nada cargado.</p>';
}

document.getElementById("lista-feed").addEventListener("click", (e) => {
  const card = e.target.closest(".feed-card");
  if (!card) return;
  if (card.dataset.coleccion === "registro") {
    abrirFicha(card.dataset.lote);
    return;
  }
  // clima: cambiar a la pestaña Clima y abrir el mes/día correspondiente
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="clima"]').classList.add("active");
  document.getElementById("tab-clima").classList.add("active");
  const fecha = card.dataset.fecha;
  if (fecha && typeof mesCalendarioClima !== "undefined") {
    const [anio, mes] = fecha.split("-").map(Number);
    mesCalendarioClima = new Date(anio, mes - 1, 1);
    diaSeleccionadoClima = fecha;
    renderCalendarioClima();
  }
});

// --- Resumen por contratista: hectáreas trabajadas + monto, por contratista/campaña/categoría ---
// La tarifa (USD/ha) se carga directo en cada registro (como hectáreas reales) — cada tarea puede
// tener su propio precio, incluso dentro de la misma campaña/momento, así que no hay una tarifa fija
// por categoría: el monto se calcula tarea por tarea y se suma.

const CAMPO_HECTAREAS_POR_CATEGORIA = {
  siembra: "hectareas",
  cosecha: "hectareas",
  laboreo: "hectareas",
  pulverizacion: "hectareasReales",
};

function poblarFiltrosContratista() {
  const selContratista = document.getElementById("contratista-filtro-nombre");
  if (selContratista) {
    const valorActual = selContratista.value;
    const nombres = typeof nombresUsados === "function" ? nombresUsados("contratistas") : [];
    selContratista.innerHTML =
      '<option value="">— Elegí un contratista —</option>' + nombres.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    if (nombres.includes(valorActual)) selContratista.value = valorActual;
  }

  const selCampana = document.getElementById("contratista-filtro-campana");
  if (selCampana) {
    const valorActual = selCampana.value;
    const combos = new Map();
    Object.values(campanasLoteCache || {}).forEach((c) => {
      if (!c.cultivo || !c.temporada) return;
      combos.set(`${c.cultivo}__${c.temporada}`, { cultivo: c.cultivo, temporada: c.temporada });
    });
    const lista = [...combos.values()].sort((a, b) => b.temporada.localeCompare(a.temporada) || a.cultivo.localeCompare(b.cultivo));
    selCampana.innerHTML =
      '<option value="">— Elegí una campaña —</option>' +
      lista.map((c) => `<option value="${escapeHtml(c.cultivo)}__${escapeHtml(c.temporada)}">${escapeHtml(c.cultivo)} ${escapeHtml(c.temporada)}</option>`).join("");
    if (valorActual) selCampana.value = valorActual;
  }
}

function obtenerFiltrosContratista() {
  const contratista = document.getElementById("contratista-filtro-nombre").value;
  const campanaValor = document.getElementById("contratista-filtro-campana").value;
  const categoria = document.getElementById("contratista-filtro-categoria").value;
  const desde = document.getElementById("contratista-filtro-desde").value;
  const hasta = document.getElementById("contratista-filtro-hasta").value;
  const [cultivo, temporada] = campanaValor ? campanaValor.split("__") : [null, null];
  return { contratista, categoria, desde, hasta, cultivo, temporada };
}

function calcularResumenContratista() {
  const { contratista, categoria, desde, hasta, cultivo, temporada } = obtenerFiltrosContratista();
  if (!contratista || !categoria || !cultivo || !temporada) return null;
  const campoHa = CAMPO_HECTAREAS_POR_CATEGORIA[categoria];
  const actividades = cargarRegistros()
    .filter(
      (r) =>
        r.tipo === categoria &&
        r.contratista === contratista &&
        r.cultivo === cultivo &&
        r.temporada === temporada &&
        r.estado !== "planificada"
    )
    .filter((r) => !desde || r.fecha >= desde)
    .filter((r) => !hasta || r.fecha <= hasta)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  let totalHa = 0;
  let montoUsd = 0;
  let faltaTarifa = 0;
  actividades.forEach((r) => {
    const ha = parseFloat(r[campoHa]) || 0;
    const tarifa = parseFloat(r.tarifaUsdHa) || 0;
    totalHa += ha;
    montoUsd += ha * tarifa;
    if (!tarifa) faltaTarifa++;
  });

  return { actividades, totalHa, montoUsd, faltaTarifa, contratista, categoria, cultivo, temporada, desde, hasta };
}

function renderResumenContratista() {
  const cont = document.getElementById("contratista-resultado");
  const datos = calcularResumenContratista();
  if (!datos) {
    cont.hidden = true;
    return;
  }
  cont.hidden = false;
  document.getElementById("contratista-total-ha").textContent = `${datos.totalHa.toFixed(1)} ha`;
  document.getElementById("contratista-total-usd").textContent = `US$ ${datos.montoUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  document.getElementById("contratista-total-tareas").textContent = String(datos.actividades.length);

  const lista = document.getElementById("contratista-lista-actividades");
  const avisoTarifa =
    datos.faltaTarifa > 0
      ? `<p class="ayuda-mapa">⚠️ ${datos.faltaTarifa} tarea${datos.faltaTarifa === 1 ? "" : "s"} sin tarifa cargada — no ${
          datos.faltaTarifa === 1 ? "está" : "están"
        } incluida${datos.faltaTarifa === 1 ? "" : "s"} en el monto.</p>`
      : "";
  lista.innerHTML =
    avisoTarifa +
    (datos.actividades.length
      ? datos.actividades
          .map(
            (r) => `
        <div class="registro-card">
          <div class="fila-top">
            <span class="tipo-badge">${escapeHtml(r.lote)}</span>
            <span class="lote-fecha">${escapeHtml(r.fecha || "")}</span>
          </div>
          <dl>${detalleParaMostrar(r)}</dl>
        </div>
      `
          )
          .join("")
      : '<p class="vacio">No hay actividades confirmadas en ese período.</p>');
}

function renderContratistasBloque() {
  poblarFiltrosContratista();
  renderResumenContratista();
}

["contratista-filtro-nombre", "contratista-filtro-campana", "contratista-filtro-categoria", "contratista-filtro-desde", "contratista-filtro-hasta"].forEach(
  (id) => {
    document.getElementById(id).addEventListener("change", renderResumenContratista);
  }
);

// --- PDF del resumen ---
document.getElementById("btn-contratista-pdf").addEventListener("click", () => {
  const datos = calcularResumenContratista();
  if (!datos || !datos.actividades.length) {
    mostrarToast("No hay datos para generar el PDF");
    return;
  }
  generarPDFContratista(datos);
});

function generarPDFContratista(datos) {
  const doc = new jspdf.jsPDF();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const margen = 15;
  const anchoUtil = anchoPagina - margen * 2;
  const margenInferior = 20;
  let y = margen;

  function saltoDePaginaSiHaceFalta(necesario) {
    if (y + necesario > altoPagina - margenInferior) {
      doc.addPage();
      y = margen;
    }
  }
  function lineaTexto(texto, x, tamano, color, negrita) {
    doc.setFontSize(tamano);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont(undefined, negrita ? "bold" : "normal");
    doc.text(texto, x, y);
  }

  lineaTexto("Establecimiento Zogoibi S.A.", margen, 16, [47, 109, 60], true);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Fecha de generación: ${formatearFecha(new Date().toISOString().slice(0, 10))}`, anchoPagina - margen, y, { align: "right" });
  y += 7;
  lineaTexto(`Resumen de Contratista — ${datos.contratista}`, margen, 12, [90, 90, 90], false);
  y += 9;

  doc.setDrawColor(210, 210, 200);
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;

  lineaTexto(`${NOMBRES_CATEGORIA[datos.categoria] || datos.categoria} — ${datos.cultivo} ${datos.temporada}`, margen, 12, [30, 30, 30], true);
  y += 6;
  const rango = datos.desde || datos.hasta ? `Período: ${datos.desde ? formatearFecha(datos.desde) : "—"} al ${datos.hasta ? formatearFecha(datos.hasta) : "hoy"}` : "Período: todo el historial";
  lineaTexto(rango, margen, 10, [90, 90, 90], false);
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  const lineasResumen = [
    `Tareas: ${datos.actividades.length}`,
    `Hectáreas: ${datos.totalHa.toFixed(1)} ha`,
    `Monto total: US$ ${datos.montoUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`,
  ];
  if (datos.faltaTarifa > 0) lineasResumen.push(`(${datos.faltaTarifa} tarea(s) sin tarifa cargada, no incluida(s) en el monto)`);
  lineasResumen.forEach((linea) => {
    saltoDePaginaSiHaceFalta(6);
    doc.setFont(undefined, "bold");
    doc.text(linea, margen, y);
    y += 6;
  });
  y += 6;

  saltoDePaginaSiHaceFalta(14);
  doc.setFillColor(32, 75, 41);
  doc.rect(margen, y, anchoUtil, 8, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.text("DETALLE", margen + 3, y + 5.5);
  y += 14;

  datos.actividades.forEach((r) => {
    const detalle = detalleTextoPDF(r);
    const lineasDetalle = detalle.flatMap((linea) => doc.splitTextToSize(linea, anchoUtil - 6));
    const alturaBloque = 6 + lineasDetalle.length * 4.6 + 4;
    saltoDePaginaSiHaceFalta(alturaBloque);
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.setFont(undefined, "bold");
    doc.text(`${r.lote} — ${formatearFecha(r.fecha)}`, margen, y);
    y += 5.5;
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(70, 70, 70);
    lineasDetalle.forEach((linea) => {
      doc.text(linea, margen + 4, y);
      y += 4.6;
    });
    y += 4;
  });

  doc.save(`contratista-${datos.contratista}-${datos.categoria}-${datos.cultivo}-${datos.temporada}.pdf`);
}

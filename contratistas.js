// --- Resumen por contratista: hectáreas trabajadas + monto, por contratista/campaña/categoría ---
let tarifasCache = {};
let unsubscribeTarifas = null;

const CAMPO_HECTAREAS_POR_CATEGORIA = {
  siembra: "hectareas",
  cosecha: "hectareas",
  laboreo: "hectareas",
  pulverizacion: "hectareasReales",
};

// Las tarifas se guardan por categoría + cultivo + temporada (la temporada trae "/", hay que sanearlo para el id).
function idTarifa(categoria, cultivo, temporada) {
  return `${categoria}__${cultivo}__${temporada}`.replace(/\//g, "-");
}

function iniciarListenerTarifas() {
  if (unsubscribeTarifas) return;
  unsubscribeTarifas = db.collection("tarifas").onSnapshot(
    (snapshot) => {
      const nuevo = {};
      snapshot.forEach((doc) => {
        const d = doc.data();
        nuevo[idTarifa(d.categoria, d.cultivo, d.temporada)] = d;
      });
      tarifasCache = nuevo;
      if (document.getElementById("tab-registros").classList.contains("active")) renderContratistasBloque();
    },
    () => mostrarToast("No se pudo sincronizar las tarifas con la nube")
  );
}

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

function actualizarBloqueTarifa() {
  const bloque = document.getElementById("contratista-tarifa-bloque");
  const { cultivo, temporada, categoria } = obtenerFiltrosContratista();
  if (!cultivo || !temporada || !categoria) {
    bloque.hidden = true;
    document.getElementById("form-tarifa").hidden = true;
    return;
  }
  bloque.hidden = false;
  const tarifaDoc = tarifasCache[idTarifa(categoria, cultivo, temporada)];
  const valor = tarifaDoc ? parseFloat(tarifaDoc.tarifaUsdHa) : null;
  document.getElementById("contratista-tarifa-texto").textContent = `Tarifa ${NOMBRES_CATEGORIA[categoria] || categoria} — ${cultivo} ${temporada}: ${
    valor != null ? valor.toLocaleString("es-AR") + " USD/ha" : "sin definir"
  }`;
}

document.getElementById("btn-editar-tarifa").addEventListener("click", () => {
  const form = document.getElementById("form-tarifa");
  const { cultivo, temporada, categoria } = obtenerFiltrosContratista();
  const tarifaDoc = tarifasCache[idTarifa(categoria, cultivo, temporada)];
  document.getElementById("input-tarifa").value = tarifaDoc ? tarifaDoc.tarifaUsdHa : "";
  form.hidden = !form.hidden;
});

document.getElementById("form-tarifa").addEventListener("submit", (e) => {
  e.preventDefault();
  const { cultivo, temporada, categoria } = obtenerFiltrosContratista();
  if (!cultivo || !temporada || !categoria) return;
  const valor = parseFloat(document.getElementById("input-tarifa").value) || 0;
  db.collection("tarifas")
    .doc(idTarifa(categoria, cultivo, temporada))
    .set({ categoria, cultivo, temporada, tarifaUsdHa: valor, actualizado: new Date().toISOString() }, { merge: true })
    .then(() => {
      mostrarToast("Tarifa guardada");
      document.getElementById("form-tarifa").hidden = true;
    })
    .catch(() => mostrarToast("No se pudo guardar (revisá tu conexión)"));
});

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

  const totalHa = actividades.reduce((suma, r) => suma + (parseFloat(r[campoHa]) || 0), 0);
  const tarifaDoc = tarifasCache[idTarifa(categoria, cultivo, temporada)];
  const tarifa = tarifaDoc ? parseFloat(tarifaDoc.tarifaUsdHa) || 0 : 0;
  const montoUsd = totalHa * tarifa;
  return { actividades, totalHa, tarifa, montoUsd, contratista, categoria, cultivo, temporada, desde, hasta };
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
  lista.innerHTML = datos.actividades.length
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
    : '<p class="vacio">No hay actividades confirmadas en ese período.</p>';
}

function renderContratistasBloque() {
  poblarFiltrosContratista();
  actualizarBloqueTarifa();
  renderResumenContratista();
}

["contratista-filtro-nombre", "contratista-filtro-campana", "contratista-filtro-categoria", "contratista-filtro-desde", "contratista-filtro-hasta"].forEach(
  (id) => {
    document.getElementById(id).addEventListener("change", () => {
      actualizarBloqueTarifa();
      renderResumenContratista();
    });
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
  [
    `Tareas: ${datos.actividades.length}`,
    `Hectáreas: ${datos.totalHa.toFixed(1)} ha`,
    `Tarifa: ${datos.tarifa.toLocaleString("es-AR")} USD/ha`,
    `Monto total: US$ ${datos.montoUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`,
  ].forEach((linea) => {
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

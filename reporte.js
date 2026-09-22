const COLOR_CATEGORIA = {
  malezas: [32, 75, 41],
  pulverizacion: [224, 142, 43],
  siembra: [47, 109, 60],
  emergencia: [91, 127, 209],
  cosecha: [184, 134, 46],
  laboreo: [124, 92, 63],
};

function formatearFecha(iso) {
  if (!iso) return "";
  const [anio, mes, dia] = iso.split("-");
  if (!anio || !mes || !dia) return iso;
  return `${dia}/${mes}/${anio}`;
}

// --- Selectores de Lote / Campaña ---
function poblarSelectorLotes() {
  const select = document.getElementById("reporte-lote");
  if (!select) return;
  const nombres = [...new Set(lotesCache.map((l) => l.nombre))].sort((a, b) => a.localeCompare(b));
  select.innerHTML =
    '<option value="">— Elegí un lote —</option>' +
    nombres.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  poblarSelectorCampanas("");

  const selectHistorial = document.getElementById("historial-filtro-lote");
  if (selectHistorial) {
    const valorActual = selectHistorial.value;
    selectHistorial.innerHTML =
      '<option value="">Todos</option>' +
      nombres.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    if (nombres.includes(valorActual)) selectHistorial.value = valorActual;
  }
}

// --- Lotes sin monitoreo reciente: aviso de lotes que hace tiempo no se recorren ---
const UMBRAL_DIAS_MONITOREO = 10;

function diasEntreFechas(desde, hasta) {
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date(hasta + "T00:00:00");
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function calcularLotesSinMonitoreoReciente() {
  if (!lotesCache.length) return [];
  const hoy = new Date().toISOString().slice(0, 10);
  const nombresUnicos = [...new Set(lotesCache.map((l) => l.nombre))];
  const filas = [];
  nombresUnicos.forEach((nombre) => {
    const campana = campanaActivaDe(nombre);
    if (!campana) return;
    // Solo lotes ya sembrados — no tiene sentido pedir monitoreo de algo que todavía no existe.
    const haySiembra = cargarRegistros().some(
      (r) => r.tipo === "siembra" && r.lote === nombre && r.cultivo === campana.cultivo && r.temporada === campana.temporada && r.estado !== "planificada"
    );
    if (!haySiembra) return;
    // Ni de una campaña ya cosechada — ahí el monitoreo ya no tiene sentido.
    const yaCosechado = cargarRegistros().some(
      (r) => r.tipo === "cosecha" && r.lote === nombre && r.cultivo === campana.cultivo && r.temporada === campana.temporada && r.estado !== "planificada"
    );
    if (yaCosechado) return;
    const monitoreos = cargarRegistros()
      .filter((r) => r.tipo === "malezas" && r.lote === nombre && r.cultivo === campana.cultivo && r.temporada === campana.temporada && r.fecha)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    const ultima = monitoreos[0] ? monitoreos[0].fecha : null;
    const dias = ultima ? diasEntreFechas(ultima, hoy) : null;
    filas.push({ lote: nombre, cultivo: campana.cultivo, temporada: campana.temporada, ultima, dias });
  });
  // Primero los que nunca se monitorearon, después de más días sin recorrer a menos.
  filas.sort((a, b) => {
    if (a.dias == null && b.dias == null) return a.lote.localeCompare(b.lote);
    if (a.dias == null) return -1;
    if (b.dias == null) return 1;
    return b.dias - a.dias;
  });
  return filas;
}

function renderMonitoreoPendiente() {
  const boton = document.getElementById("btn-toggle-monitoreo-pendiente");
  if (!boton) return;
  const resumen = document.getElementById("monitoreo-pendiente-resumen");
  const cuerpo = document.getElementById("monitoreo-pendiente-cuerpo");
  const filas = calcularLotesSinMonitoreoReciente();
  const atencion = filas.filter((f) => f.dias == null || f.dias > UMBRAL_DIAS_MONITOREO).length;
  resumen.textContent =
    atencion > 0 ? `📋 Lotes sin monitoreo reciente (${atencion} necesitan revisión)` : "📋 Lotes sin monitoreo reciente (todo al día ✅)";
  cuerpo.innerHTML = filas.length
    ? filas
        .map((f) => {
          const necesitaAtencion = f.dias == null || f.dias > UMBRAL_DIAS_MONITOREO;
          const textoHace = f.dias == null ? "Nunca" : `${f.dias} día${f.dias === 1 ? "" : "s"}`;
          return `
            <tr${necesitaAtencion ? ' class="fila-atencion"' : ""}>
              <td>${escapeHtml(f.lote)}</td>
              <td>${escapeHtml(f.cultivo)} ${escapeHtml(f.temporada)}</td>
              <td>${f.ultima ? formatearFecha(f.ultima) : "—"}</td>
              <td class="num">${necesitaAtencion ? "⚠️ " : ""}${textoHace}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="4" class="vacio">No hay lotes sembrados todavía en esta campaña.</td></tr>';
}

document.getElementById("btn-toggle-monitoreo-pendiente").addEventListener("click", () => {
  const bloque = document.getElementById("monitoreo-pendiente-bloque");
  bloque.hidden = !bloque.hidden;
});

// --- Planes atrasados: siembras/pulverizaciones planificadas cuya fecha ya pasó sin confirmarse ---
const DIAS_ATRASO_GRAVE = 7; // más de una semana de atraso se resalta

function fechaHoyLocal() {
  // toISOString() usa hora UTC y de noche daría "mañana" en Argentina — acá va la fecha del celular.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcularPlanesAtrasados() {
  const hoy = fechaHoyLocal();
  return cargarRegistros()
    .filter((r) => r.estado === "planificada" && r.fecha && r.fecha < hoy)
    .filter((r) => {
      // Solo planes de la campaña activa del lote: uno viejo de una campaña que ya cambió no es "atraso".
      const campana = campanaActivaDe(r.lote);
      return campana && campana.cultivo === r.cultivo && campana.temporada === r.temporada;
    })
    .map((r) => ({
      lote: r.lote,
      tarea: `${NOMBRES_CATEGORIA[r.tipo] || r.tipo}${r.tipo === "pulverizacion" && r.momento ? " — " + r.momento : ""}`,
      cultivo: r.cultivo,
      temporada: r.temporada,
      fecha: r.fecha,
      dias: diasEntreFechas(r.fecha, hoy),
    }))
    .sort((a, b) => b.dias - a.dias || a.lote.localeCompare(b.lote));
}

function renderPlanesAtrasados() {
  const boton = document.getElementById("btn-toggle-planes-atrasados");
  if (!boton) return;
  const resumen = document.getElementById("planes-atrasados-resumen");
  const cuerpo = document.getElementById("planes-atrasados-cuerpo");
  const filas = calcularPlanesAtrasados();
  resumen.textContent =
    filas.length > 0
      ? `📅 Planes atrasados (${filas.length} sin confirmar)`
      : "📅 Planes atrasados (todo al día ✅)";
  cuerpo.innerHTML = filas.length
    ? filas
        .map(
          (f) => `
            <tr class="fila-plan-atrasado${f.dias > DIAS_ATRASO_GRAVE ? " fila-atencion" : ""}" data-lote="${escapeHtml(f.lote)}">
              <td>${escapeHtml(f.lote)}</td>
              <td>${escapeHtml(f.tarea)}<br><span class="opcional">${escapeHtml(f.cultivo)} ${escapeHtml(f.temporada)}</span></td>
              <td class="num">${f.dias > DIAS_ATRASO_GRAVE ? "⚠️ " : ""}${f.dias} día${f.dias === 1 ? "" : "s"}<br><span class="opcional">era el ${formatearFecha(f.fecha)}</span></td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="3" class="vacio">No hay planes vencidos sin confirmar.</td></tr>';
}

document.getElementById("btn-toggle-planes-atrasados").addEventListener("click", () => {
  const bloque = document.getElementById("planes-atrasados-bloque");
  bloque.hidden = !bloque.hidden;
});

// Tocar un plan atrasado abre la ficha de ese lote, donde está el botón "✓ Confirmar".
document.getElementById("planes-atrasados-cuerpo").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-lote]");
  if (fila) abrirFicha(fila.dataset.lote);
});

// --- Historial de rendimiento: comparar cosechas entre campañas, por lote o por variedad ---
function buscarVariedadDeCosecha(cosecha) {
  // Si la cosecha ya trae su propia variedad (caso de lotes con más de un híbrido en la misma
  // campaña), usarla directamente. Solo para registros viejos sin ese campo se adivina buscando
  // la siembra más reciente del mismo lote+cultivo+temporada — puede estar mal si hubo 2+ siembras.
  if (cosecha.variedad) return cosecha.variedad;
  const siembra = cargarRegistros()
    .filter(
      (r) =>
        r.tipo === "siembra" &&
        r.lote === cosecha.lote &&
        r.cultivo === cosecha.cultivo &&
        r.temporada === cosecha.temporada &&
        r.estado !== "planificada"
    )
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];
  return siembra ? siembra.variedad : null;
}

function obtenerHistorialRendimiento() {
  return cargarRegistros()
    .filter((r) => r.tipo === "cosecha" && r.rendimientoKgHa)
    .map((r) => ({
      lote: r.lote,
      cultivo: r.cultivo,
      temporada: r.temporada,
      fecha: r.fecha,
      rendimiento: parseFloat(r.rendimientoKgHa) || 0,
      variedad: buscarVariedadDeCosecha(r),
    }))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

function poblarFiltroVariedad() {
  const select = document.getElementById("historial-filtro-variedad");
  if (!select) return;
  const valorActual = select.value;
  const variedades = [...new Set(obtenerHistorialRendimiento().map((h) => h.variedad).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  select.innerHTML =
    '<option value="">Todas</option>' + variedades.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (variedades.includes(valorActual)) select.value = valorActual;
}

function renderHistorialRendimiento() {
  const cuerpo = document.getElementById("historial-rendimiento-cuerpo");
  if (!cuerpo) return;
  poblarFiltroVariedad();

  const loteFiltro = document.getElementById("historial-filtro-lote").value;
  const variedadFiltro = document.getElementById("historial-filtro-variedad").value;
  const botonPdf = document.getElementById("btn-historial-pdf");

  if (!loteFiltro && !variedadFiltro) {
    cuerpo.innerHTML = '<tr><td colspan="4" class="vacio">Elegí un lote y/o una variedad para ver el historial.</td></tr>';
    document.getElementById("historial-promedio").hidden = true;
    if (botonPdf) botonPdf.hidden = true;
    return;
  }

  let datos = obtenerHistorialRendimiento();
  if (loteFiltro) datos = datos.filter((d) => d.lote === loteFiltro);
  if (variedadFiltro) datos = datos.filter((d) => d.variedad === variedadFiltro);

  cuerpo.innerHTML = datos.length
    ? datos
        .map(
          (d) => `
        <tr>
          <td>${escapeHtml(d.lote)}</td>
          <td>${escapeHtml(d.cultivo)} ${escapeHtml(d.temporada)}</td>
          <td>${d.variedad ? escapeHtml(d.variedad) : "—"}</td>
          <td class="num">${Math.round(d.rendimiento).toLocaleString("es-AR")}</td>
        </tr>
      `
        )
        .join("")
    : '<tr><td colspan="4" class="vacio">No hay cosechas para ese filtro.</td></tr>';

  const promedioCont = document.getElementById("historial-promedio");
  if (datos.length) {
    const promedio = datos.reduce((suma, d) => suma + d.rendimiento, 0) / datos.length;
    promedioCont.textContent = `Promedio: ${Math.round(promedio).toLocaleString("es-AR")} kg/ha (${datos.length} cosecha${
      datos.length === 1 ? "" : "s"
    })`;
    promedioCont.hidden = false;
    if (botonPdf) botonPdf.hidden = false;
  } else {
    promedioCont.hidden = true;
    if (botonPdf) botonPdf.hidden = true;
  }
}

document.getElementById("historial-filtro-lote").addEventListener("change", renderHistorialRendimiento);
document.getElementById("historial-filtro-variedad").addEventListener("change", renderHistorialRendimiento);

document.getElementById("btn-historial-pdf").addEventListener("click", () => {
  const loteFiltro = document.getElementById("historial-filtro-lote").value;
  const variedadFiltro = document.getElementById("historial-filtro-variedad").value;
  if (!loteFiltro && !variedadFiltro) return;
  let datos = obtenerHistorialRendimiento();
  if (loteFiltro) datos = datos.filter((d) => d.lote === loteFiltro);
  if (variedadFiltro) datos = datos.filter((d) => d.variedad === variedadFiltro);
  if (!datos.length) {
    mostrarToast("No hay datos para generar el PDF");
    return;
  }
  generarPDFHistorialRendimiento(loteFiltro || "Todos los lotes", variedadFiltro || "Todas las variedades", datos, !!loteFiltro);
});

function generarPDFHistorialRendimiento(lote, variedad, datos, mostrarLotePorFila) {
  const doc = new jspdf.jsPDF();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const margen = 15;
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
  lineaTexto("Historial de rendimiento", margen, 12, [90, 90, 90], false);
  y += 9;

  doc.setDrawColor(210, 210, 200);
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;

  lineaTexto(`${lote} — ${variedad}`, margen, 12, [30, 30, 30], true);
  y += 10;

  const promedio = datos.reduce((suma, d) => suma + d.rendimiento, 0) / datos.length;
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.setFont(undefined, "bold");
  doc.text(`Promedio: ${Math.round(promedio).toLocaleString("es-AR")} kg/ha (${datos.length} cosecha${datos.length === 1 ? "" : "s"})`, margen, y);
  y += 10;

  saltoDePaginaSiHaceFalta(14);
  doc.setFillColor(32, 75, 41);
  doc.rect(margen, y, anchoPagina - margen * 2, 8, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.text(mostrarLotePorFila ? "CAMPAÑA" : "LOTE — CAMPAÑA", margen + 3, y + 5.5);
  doc.text("KG/HA", anchoPagina - margen - 25, y + 5.5);
  y += 14;

  datos.forEach((d) => {
    saltoDePaginaSiHaceFalta(7);
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    doc.setFont(undefined, "normal");
    doc.text(mostrarLotePorFila ? `${d.cultivo} ${d.temporada}` : `${d.lote} — ${d.cultivo} ${d.temporada}`, margen, y);
    doc.text(Math.round(d.rendimiento).toLocaleString("es-AR"), anchoPagina - margen, y, { align: "right" });
    y += 7;
  });

  doc.save(`historial-rendimiento-${lote}-${variedad}.pdf`);
}

function poblarSelectorCampanas(lote) {
  const select = document.getElementById("reporte-campana");
  const boton = document.getElementById("btn-reporte-pdf");
  if (!select) return;

  if (!lote) {
    select.innerHTML = '<option value="">Elegí un lote primero</option>';
    select.disabled = true;
    if (boton) boton.disabled = true;
    return;
  }

  const combos = new Map();
  cargarRegistros()
    .filter((r) => r.lote === lote)
    .forEach((r) => {
      const clave = `${r.cultivo}__${r.temporada}`;
      const actual = combos.get(clave);
      if (!actual || (r.fecha || "") > actual.fechaMax) {
        combos.set(clave, { cultivo: r.cultivo, temporada: r.temporada, fechaMax: r.fecha || "" });
      }
    });

  const lista = [...combos.values()].sort((a, b) => b.fechaMax.localeCompare(a.fechaMax));

  if (lista.length === 0) {
    select.innerHTML = '<option value="">Este lote no tiene datos cargados</option>';
    select.disabled = true;
    if (boton) boton.disabled = true;
    return;
  }

  select.disabled = false;
  if (boton) boton.disabled = false;
  select.innerHTML = lista
    .map((c) => `<option value="${escapeHtml(c.cultivo)}__${escapeHtml(c.temporada)}">${escapeHtml(c.cultivo)} ${escapeHtml(c.temporada)}</option>`)
    .join("");
}

document.getElementById("reporte-lote").addEventListener("change", (e) => {
  poblarSelectorCampanas(e.target.value);
});

// --- Reporte de campaña completo: un PDF con todos los lotes de una campaña ---
function poblarSelectorCampanaCompleta() {
  const select = document.getElementById("reporte-campana-completa");
  if (!select) return;
  const valorActual = select.value;
  const combos = new Map();
  cargarRegistros()
    .filter((r) => r.estado !== "planificada" && r.cultivo && r.temporada)
    .forEach((r) => {
      const clave = `${r.cultivo}__${r.temporada}`;
      const actual = combos.get(clave);
      if (!actual || (r.fecha || "") > actual.fechaMax) combos.set(clave, { cultivo: r.cultivo, temporada: r.temporada, fechaMax: r.fecha || "" });
    });
  const lista = [...combos.values()].sort((a, b) => b.fechaMax.localeCompare(a.fechaMax));
  select.innerHTML = lista.length
    ? lista.map((c) => `<option value="${escapeHtml(c.cultivo)}__${escapeHtml(c.temporada)}">${escapeHtml(c.cultivo)} ${escapeHtml(c.temporada)}</option>`).join("")
    : '<option value="">Todavía no hay campañas con datos cargados</option>';
  const boton = document.getElementById("btn-reporte-campana-pdf");
  if (boton) boton.disabled = !lista.length;
  if (lista.some((c) => `${c.cultivo}__${c.temporada}` === valorActual)) select.value = valorActual;
}

// Lotes de una campaña: los que la tienen asignada hoy, más cualquier lote que tenga actividad
// confirmada de esa campaña aunque después haya pasado a otro cultivo (ej: un lote de Maíz que
// se re-planificó a Soja sigue mostrando el barbecho de Maíz que ya se hizo).
function lotesDeCampanaCompleta(cultivo, temporada) {
  const nombres = new Set();
  Object.entries(campanasLoteCache).forEach(([lote, c]) => {
    if (c && c.cultivo === cultivo && c.temporada === temporada) nombres.add(lote);
  });
  cargarRegistros()
    .filter((r) => r.estado !== "planificada" && r.cultivo === cultivo && r.temporada === temporada)
    .forEach((r) => nombres.add(r.lote));
  return [...nombres].sort(ordenarLotes);
}

function calcularFilaCampanaCompleta(lote, cultivo, temporada) {
  const registrosLote = (tipo) => cargarRegistros().filter((r) => r.tipo === tipo && r.lote === lote && r.cultivo === cultivo && r.temporada === temporada && r.estado !== "planificada");
  const siembras = registrosLote("siembra").sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const cosechas = registrosLote("cosecha").sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  const loteInfo = typeof lotesCache !== "undefined" ? lotesCache.find((l) => l.nombre === lote) : null;
  const hectareas = hectareasDeLote(lote, loteInfo);

  const haSembrada = siembras.reduce((s, r) => s + (parseFloat(r.hectareas) || 0), 0);
  const variedades = [...new Set(siembras.map((r) => r.variedad).filter(Boolean))];
  const contratistasSiembra = [...new Set(siembras.map((r) => r.contratista).filter(Boolean))];
  const fechaSiembra = siembras.length ? siembras[siembras.length - 1].fecha : null; // la más reciente

  const haCosechada = cosechas.reduce((s, r) => s + (parseFloat(r.hectareas) || 0), 0);
  const produccionTn = cosechas.reduce((s, r) => s + ((parseFloat(r.hectareas) || 0) * (parseFloat(r.rendimientoKgHa) || 0)) / 1000, 0);
  const rindeProm = haCosechada > 0 ? (produccionTn * 1000) / haCosechada : null;
  const contratistasCosecha = [...new Set(cosechas.map((r) => r.contratista).filter(Boolean))];
  const fechaCosecha = cosechas.length ? cosechas[cosechas.length - 1].fecha : null;

  return {
    lote, hectareas, haSembrada, variedades, contratistasSiembra, fechaSiembra,
    haCosechada, produccionTn, rindeProm, contratistasCosecha, fechaCosecha,
  };
}

function generarPDFCampanaCompleta(cultivo, temporada) {
  const filas = lotesDeCampanaCompleta(cultivo, temporada).map((l) => calcularFilaCampanaCompleta(l, cultivo, temporada));
  if (!filas.length) {
    mostrarToast("No hay datos para esa campaña");
    return;
  }

  const totales = filas.reduce(
    (t, f) => {
      t.hectareas += f.hectareas || 0;
      t.haSembrada += f.haSembrada;
      t.haCosechada += f.haCosechada;
      t.produccionTn += f.produccionTn;
      return t;
    },
    { hectareas: 0, haSembrada: 0, haCosechada: 0, produccionTn: 0 }
  );
  const rindeGeneral = totales.haCosechada > 0 ? (totales.produccionTn * 1000) / totales.haCosechada : null;

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
  function lineaTexto(texto, x, tamano, color, negrita, opts) {
    doc.setFontSize(tamano);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont(undefined, negrita ? "bold" : "normal");
    doc.text(texto, x, y, opts);
  }

  lineaTexto("Establecimiento Zogoibi S.A.", margen, 16, [47, 109, 60], true);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Fecha de generación: ${formatearFecha(new Date().toISOString().slice(0, 10))}`, anchoPagina - margen, y, { align: "right" });
  y += 7;
  lineaTexto("Reporte de campaña completo", margen, 12, [90, 90, 90], false);
  y += 9;
  doc.setDrawColor(210, 210, 200);
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;

  lineaTexto(`${cultivo} ${temporada}`, margen, 14, [30, 30, 30], true);
  y += 10;

  const pctSembrado = totales.hectareas ? Math.min(100, Math.round((totales.haSembrada / totales.hectareas) * 100)) : 0;
  const pctCosechado = totales.haSembrada ? Math.min(100, Math.round((totales.haCosechada / totales.haSembrada) * 100)) : 0;
  const resumen = [
    `Lotes: ${filas.length} — Hectáreas totales: ${totales.hectareas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha`,
    `Sembrado: ${totales.haSembrada.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha (${pctSembrado}%)`,
    `Cosechado: ${totales.haCosechada.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha (${pctCosechado}%)`,
    `Producción: ${totales.produccionTn.toLocaleString("es-AR", { maximumFractionDigits: 1 })} t${rindeGeneral != null ? ` — Rinde promedio: ${rindeGeneral.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg/ha` : ""}`,
  ];
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.setFont(undefined, "bold");
  resumen.forEach((linea) => {
    doc.text(linea, margen, y);
    y += 6.5;
  });
  y += 6;

  // --- Tabla, un lote por fila ---
  const colLote = margen + 3;
  const colSiembra = margen + 40;
  const colCosecha = margen + 98;
  const colContratistas = margen + 143;
  const finTabla = anchoPagina - margen - 3;
  const anchoLote = colSiembra - colLote - 4;
  const anchoSiembra = colCosecha - colSiembra - 4;
  const anchoCosecha = colContratistas - colCosecha - 4;
  const anchoContratistas = finTabla - colContratistas;

  function encabezadoTabla() {
    saltoDePaginaSiHaceFalta(14);
    doc.setFillColor(32, 75, 41);
    doc.rect(margen, y, anchoUtil, 8, "F");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.text("LOTE / HA", colLote, y + 5.5);
    doc.text("SIEMBRA", colSiembra, y + 5.5);
    doc.text("COSECHA", colCosecha, y + 5.5);
    doc.text("CONTRATISTAS", colContratistas, y + 5.5);
    y += 12;
  }
  encabezadoTabla();

  filas.forEach((f, i) => {
    const lineasSiembra = [];
    if (f.haSembrada > 0) {
      lineasSiembra.push(`${f.haSembrada.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha${f.fechaSiembra ? " — " + formatearFecha(f.fechaSiembra) : ""}`);
      if (f.variedades.length) lineasSiembra.push(f.variedades.join(", "));
    } else {
      lineasSiembra.push("Sin sembrar");
    }
    const lineasCosecha = [];
    if (f.haCosechada > 0) {
      lineasCosecha.push(`${f.haCosechada.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha${f.fechaCosecha ? " — " + formatearFecha(f.fechaCosecha) : ""}`);
      lineasCosecha.push(`${f.rindeProm.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg/ha`);
    } else {
      lineasCosecha.push("Sin cosechar");
    }
    const lineasContratistas = [];
    if (f.contratistasSiembra.length) lineasContratistas.push(`Siembra: ${f.contratistasSiembra.join(", ")}`);
    if (f.contratistasCosecha.length) lineasContratistas.push(`Cosecha: ${f.contratistasCosecha.join(", ")}`);
    if (!lineasContratistas.length) lineasContratistas.push("—");

    const lLineas = doc.splitTextToSize(f.lote, anchoLote);
    const haLinea = f.hectareas != null ? [`${f.hectareas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha`] : [];
    const sLineas = lineasSiembra.flatMap((l) => doc.splitTextToSize(l, anchoSiembra));
    const cLineas = lineasCosecha.flatMap((l) => doc.splitTextToSize(l, anchoCosecha));
    const tLineas = lineasContratistas.flatMap((l) => doc.splitTextToSize(l, anchoContratistas));
    const alturaFila = Math.max(lLineas.length + haLinea.length, sLineas.length, cLineas.length, tLineas.length, 1) * 4.6 + 6;

    saltoDePaginaSiHaceFalta(alturaFila);
    if (i % 2 === 1) {
      doc.setFillColor(245, 247, 244);
      doc.rect(margen, y - 5, anchoUtil, alturaFila, "F");
    }
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.setFont(undefined, "bold");
    doc.text(lLineas, colLote, y);
    doc.setFont(undefined, "normal");
    if (haLinea.length) doc.text(haLinea, colLote, y + lLineas.length * 4.6);
    doc.setFontSize(8.5);
    doc.text(sLineas, colSiembra, y);
    doc.text(cLineas, colCosecha, y);
    doc.text(tLineas, colContratistas, y);
    y += alturaFila;
  });

  y += 3;
  doc.setDrawColor(210, 210, 200);
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;
  doc.setFontSize(10.5);
  doc.setTextColor(47, 109, 60);
  doc.setFont(undefined, "bold");
  doc.text(
    `TOTAL — ${totales.hectareas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha — ${totales.produccionTn.toLocaleString("es-AR", { maximumFractionDigits: 1 })} t${
      rindeGeneral != null ? ` — ${rindeGeneral.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg/ha promedio` : ""
    }`,
    margen,
    y
  );

  doc.save(`reporte-campana-${cultivo}-${temporada.replace("/", "-")}.pdf`);
}

document.getElementById("btn-reporte-campana-pdf").addEventListener("click", () => {
  const valor = document.getElementById("reporte-campana-completa").value;
  if (!valor) return;
  const [cultivo, temporada] = valor.split("__");
  generarPDFCampanaCompleta(cultivo, temporada);
});

// --- Detalle en texto plano por categoría (para el PDF) ---
function detalleTextoPDF(r) {
  if (r.tipo === "pulverizacion") {
    const haReales = parseFloat(r.hectareasReales) || 0;
    const tarifa = parseFloat(r.tarifaUsdHa) || 0;
    const productos = (r.productos || [])
      .map((p) => {
        const total = haReales > 0 ? ` (total: ${(parseFloat(p.dosis) * haReales).toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${p.unidad})` : "";
        return `${p.nombre} — ${p.dosis} ${p.unidad}/ha${total}`;
      })
      .join("; ");
    return [
      r.momento && `Momento: ${r.momento}`,
      haReales > 0 && `Hectáreas pulverizadas (real): ${haReales.toLocaleString("es-AR")} ha`,
      productos && `Productos: ${productos}`,
      r.contratista && `Contratista: ${r.contratista}`,
      tarifa > 0 &&
        `Tarifa: ${tarifa.toLocaleString("es-AR")} USD/ha${haReales > 0 ? ` (monto: US$ ${(tarifa * haReales).toLocaleString("es-AR", { maximumFractionDigits: 2 })})` : ""}`,
      r.observaciones && `Observaciones: ${r.observaciones}`,
    ].filter(Boolean);
  }
  const campos = CAMPOS_CATEGORIA[r.tipo] || [];
  const lineas = campos
    .filter((c) => !["fecha", "lote", "cultivo", "temporada"].includes(c) && r[c])
    .map((c) => {
      let valor = r[c];
      if (c === "semillasHaBruto" || c === "semillasHaViables") valor = Math.round(valor).toLocaleString("es-AR");
      if (c === "fechaFloracion") valor = formatearFecha(valor);
      return `${ETIQUETAS_CAMPO[c] || c}: ${valor}`;
    });
  if (r.tipo === "siembra") {
    const fert = (r.fertilizantes || []).map((f) => `${f.nombre} — ${f.dosis} kg/ha`).join("; ");
    if (fert) lineas.push(`Fertilización: ${fert}`);
  }
  if (r.tipo === "cosecha" && r.rendimientoKgHa && typeof buscarEstimacionRendimiento === "function") {
    const estimacion = buscarEstimacionRendimiento(r);
    if (estimacion) {
      const estimado = parseFloat(estimacion.rendimientoEstimado);
      const real = parseFloat(r.rendimientoKgHa);
      if (estimado > 0) {
        const diffPct = ((real - estimado) / estimado) * 100;
        const signo = diffPct >= 0 ? "+" : "";
        lineas.push(`Vs. estimación: estimabas ${Math.round(estimado).toLocaleString("es-AR")} kg/ha (${signo}${diffPct.toFixed(1)}%)`);
      }
    }
  }
  return lineas;
}

// --- Generación del PDF ---
function generarReportePDF(lote, cultivo, temporada) {
  const registros = cargarRegistros()
    .filter((r) => r.lote === lote && r.cultivo === cultivo && r.temporada === temporada && r.estado !== "planificada")
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  if (registros.length === 0) {
    mostrarToast("No hay datos para generar el reporte");
    return;
  }

  const loteInfo = lotesCache.find((l) => l.nombre === lote);
  const siembra = registros.find((r) => r.tipo === "siembra");

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

  // --- Encabezado ---
  lineaTexto("Establecimiento Zogoibi S.A.", margen, 16, [47, 109, 60], true);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Fecha de generación: ${formatearFecha(new Date().toISOString().slice(0, 10))}`, anchoPagina - margen, y, { align: "right" });
  y += 7;
  lineaTexto("Análisis de Lote", margen, 12, [90, 90, 90], false);
  y += 9;

  doc.setDrawColor(210, 210, 200);
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;

  const haOficialLote = typeof hectareasOficialesDe === "function" ? hectareasOficialesDe(lote) : null;
  const haParaMostrar = haOficialLote != null ? haOficialLote : loteInfo && loteInfo.hectareasTotales;
  const ambienteHa = loteInfo ? `${loteInfo.ambiente} — ${haParaMostrar ? haParaMostrar.toFixed(1) + " ha" : "sin datos de ha"}` : "";
  lineaTexto(`Lote - Campaña: ${lote} - ${cultivo} ${temporada}`, margen, 12, [30, 30, 30], true);
  y += 6;
  lineaTexto(ambienteHa, margen, 10, [90, 90, 90], false);
  y += 10;

  // --- Resumen de Siembra ---
  if (siembra) {
    lineaTexto("Resumen de Siembra", margen, 11, [47, 109, 60], true);
    y += 6;
    const filas = [
      `Fecha de siembra: ${formatearFecha(siembra.fecha)}`,
      siembra.variedad && `Variedad: ${siembra.variedad}`,
      siembra.hectareas && `Hectáreas: ${siembra.hectareas}`,
      siembra.origen && `Origen: ${siembra.origen}`,
      siembra.pg && `PG: ${siembra.pg}%`,
      siembra.dosisKgHa && `Dosis: ${siembra.dosisKgHa} kg/ha`,
      siembra.pmg && `PMG: ${siembra.pmg} g`,
      siembra.semillasPorMetro && `Semillas/metro: ${siembra.semillasPorMetro}`,
      siembra.distanciaCm && `Distancia entre líneas: ${siembra.distanciaCm} cm`,
      siembra.semillasHaViables && `Semillas/ha viables: ${Math.round(siembra.semillasHaViables).toLocaleString("es-AR")}`,
    ].filter(Boolean);
    const fertilizacion = (siembra.fertilizantes || []).map((f) => `${f.nombre} — ${f.dosis} kg/ha`).join("; ");
    if (fertilizacion) filas.push(`Fertilización: ${fertilizacion}`);

    if (typeof calcularAvanceCampana === "function") {
      const campanaLote = (typeof campanasLoteCache !== "undefined" && campanasLoteCache[lote]) || {};
      const avance = calcularAvanceCampana(lote, { cultivo, temporada, hectareasPlan: campanaLote.hectareasPlan });
      if (avance.hectareasPlan) {
        filas.push(
          `Avance de siembra: ${avance.sembrado.toFixed(1)} de ${avance.hectareasPlan.toFixed(1)} ha planificadas (${Math.round((avance.sembrado / avance.hectareasPlan) * 100)}%)`
        );
      }
      if (avance.cosechado > 0) {
        const pct = avance.sembrado > 0 ? ` (${Math.round((avance.cosechado / avance.sembrado) * 100)}%)` : "";
        filas.push(`Cosechado: ${avance.cosechado.toFixed(1)} ha${pct}`);
      }
      if (avance.produccion > 0) {
        filas.push(`Producción total: ${avance.produccion.toFixed(1)} t`);
      }
    }

    doc.setFontSize(9.5);
    doc.setTextColor(50, 50, 50);
    doc.setFont(undefined, "normal");
    filas.forEach((f) => {
      const lineas = doc.splitTextToSize(f, anchoUtil);
      saltoDePaginaSiHaceFalta(lineas.length * 5);
      doc.text(lineas, margen, y);
      y += lineas.length * 5;
    });
    y += 6;
  }

  // --- Clima durante el ciclo ---
  if (typeof calcularClimaPorMes === "function") {
    const climaCiclo = calcularClimaPorMes(lote, cultivo, temporada);
    if (climaCiclo && climaCiclo.filas.length) {
      saltoDePaginaSiHaceFalta(10);
      lineaTexto("Clima durante el ciclo", margen, 11, [47, 109, 60], true);
      y += 6;
      doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
      doc.setFont(undefined, "normal");
      climaCiclo.filas.forEach((f) => {
        saltoDePaginaSiHaceFalta(5);
        doc.text(`${NOMBRES_MESES_CORTOS[f.mes - 1]} ${f.anio}: ${f.lluvia.toFixed(1)} mm — ${f.heladas} helada${f.heladas === 1 ? "" : "s"}`, margen, y);
        y += 5;
      });
      saltoDePaginaSiHaceFalta(6);
      doc.setFont(undefined, "bold");
      doc.text(`Total: ${climaCiclo.totalLluvia.toFixed(1)} mm — ${climaCiclo.totalHeladas} helada${climaCiclo.totalHeladas === 1 ? "" : "s"}`, margen, y);
      y += 10;
    }
  }

  // --- Cobertura verde durante el ciclo ---
  if (typeof calcularCoberturaCiclo === "function") {
    const coberturaCiclo = calcularCoberturaCiclo(lote, cultivo, temporada);
    if (coberturaCiclo) {
      saltoDePaginaSiHaceFalta(10);
      lineaTexto("Cobertura verde durante el ciclo", margen, 11, [47, 109, 60], true);
      y += 6;
      doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
      doc.setFont(undefined, "normal");
      coberturaCiclo.forEach((f) => {
        saltoDePaginaSiHaceFalta(5);
        doc.text(`${f.fecha}: ${f.coberturaVerde}%`, margen, y);
        y += 5;
      });
      y += 5;
    }
  }

  // --- Barra ACTIVIDADES ---
  saltoDePaginaSiHaceFalta(14);
  doc.setFillColor(32, 75, 41);
  doc.rect(margen, y, anchoUtil, 8, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.text("ACTIVIDADES", margen + 3, y + 5.5);
  y += 14;

  const colXFecha = margen;
  const colXPunto = margen + 24;
  const colXTexto = margen + 30;
  const anchoTexto = anchoPagina - margen - colXTexto;

  registros.forEach((r) => {
    const detalle = detalleTextoPDF(r);
    const lineasDetalle = detalle.flatMap((linea) => doc.splitTextToSize(linea, anchoTexto));
    const alturaBloque = 6 + lineasDetalle.length * 4.6 + 4;
    saltoDePaginaSiHaceFalta(alturaBloque);

    const color = COLOR_CATEGORIA[r.tipo] || [100, 100, 100];
    doc.setFontSize(8.5);
    doc.setFont(undefined, "italic");
    doc.setTextColor(120, 120, 120);
    doc.text(formatearFecha(r.fecha), colXFecha, y + 4);

    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(colXPunto, y + 3, 2, "F");

    doc.setFontSize(10.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(NOMBRES_CATEGORIA[r.tipo] || r.tipo, colXTexto, y + 4);
    y += 8;

    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(60, 60, 60);
    lineasDetalle.forEach((linea) => {
      doc.text(linea, colXTexto, y);
      y += 4.6;
    });

    if (r.tipo === "malezas" && r.foto) {
      try {
        const props = doc.getImageProperties(r.foto);
        const anchoImg = Math.min(anchoTexto, 60);
        const altoImg = (props.height / props.width) * anchoImg;
        saltoDePaginaSiHaceFalta(altoImg + 4);
        doc.addImage(r.foto, "JPEG", colXTexto, y, anchoImg, altoImg);
        y += altoImg + 4;
      } catch (err) {
        // si la imagen no se puede leer, se omite sin cortar el reporte
      }
    }

    y += 4;
  });

  const nombreArchivo = `reporte-${lote}-${cultivo}-${temporada}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
  doc.save(nombreArchivo);
}

document.getElementById("btn-reporte-pdf").addEventListener("click", () => {
  const lote = document.getElementById("reporte-lote").value;
  const campanaValor = document.getElementById("reporte-campana").value;
  if (!lote || !campanaValor) {
    mostrarToast("Elegí un lote y una campaña");
    return;
  }
  const [cultivo, temporada] = campanaValor.split("__");
  generarReportePDF(lote, cultivo, temporada);
});

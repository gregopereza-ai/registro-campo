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

// --- Historial de rendimiento: comparar cosechas entre campañas, por lote o por variedad ---
function buscarVariedadDeCosecha(cosecha) {
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

  if (!loteFiltro || !variedadFiltro) {
    cuerpo.innerHTML = '<tr><td colspan="4" class="vacio">Elegí un lote y una variedad para ver el historial.</td></tr>';
    document.getElementById("historial-promedio").hidden = true;
    if (botonPdf) botonPdf.hidden = true;
    return;
  }

  const datos = obtenerHistorialRendimiento().filter((d) => d.lote === loteFiltro && d.variedad === variedadFiltro);

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
    : '<tr><td colspan="4" class="vacio">No hay cosechas para ese lote y esa variedad.</td></tr>';

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
  if (!loteFiltro || !variedadFiltro) return;
  const datos = obtenerHistorialRendimiento().filter((d) => d.lote === loteFiltro && d.variedad === variedadFiltro);
  if (!datos.length) {
    mostrarToast("No hay datos para generar el PDF");
    return;
  }
  generarPDFHistorialRendimiento(loteFiltro, variedadFiltro, datos);
});

function generarPDFHistorialRendimiento(lote, variedad, datos) {
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
  doc.text("CAMPAÑA", margen + 3, y + 5.5);
  doc.text("KG/HA", anchoPagina - margen - 25, y + 5.5);
  y += 14;

  datos.forEach((d) => {
    saltoDePaginaSiHaceFalta(7);
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    doc.setFont(undefined, "normal");
    doc.text(`${d.cultivo} ${d.temporada}`, margen, y);
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

// --- Detalle en texto plano por categoría (para el PDF) ---
function detalleTextoPDF(r) {
  if (r.tipo === "pulverizacion") {
    const haReales = parseFloat(r.hectareasReales) || 0;
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

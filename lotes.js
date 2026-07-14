function normalizarNombreLote(nombreOriginal) {
  return nombreOriginal
    .replace(/^\s*potrero\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsearHectareas(descripcion) {
  const match = (descripcion || "").match(/([\d.,]+)\s*ha/i);
  if (!match) return null;
  return parseFloat(match[1].replace(",", "."));
}

function parsearCoordenadas(texto) {
  return texto
    .trim()
    .split(/\s+/)
    .map((punto) => {
      const [lon, lat] = punto.split(",").map(Number);
      return [lat, lon];
    });
}

async function cargarLotes(url = "lotes.kml") {
  const resp = await fetch(url);
  const texto = await resp.text();
  const xml = new DOMParser().parseFromString(texto, "text/xml");

  const lotes = [];
  const folders = xml.querySelectorAll("Folder > Folder");

  folders.forEach((folder) => {
    const ambienteNombre = folder.querySelector(":scope > name")?.textContent.trim() || "";
    const ambiente = /prof/i.test(ambienteNombre) ? "Profundo" : "Superficial";

    folder.querySelectorAll(":scope > Placemark").forEach((placemark) => {
      const nombreOriginal = placemark.querySelector("name")?.textContent.trim() || "";
      const descripcion = placemark.querySelector("description")?.textContent.trim() || "";
      const coordsTexto = placemark.querySelector("coordinates")?.textContent || "";
      if (!coordsTexto.trim()) return;

      lotes.push({
        nombreOriginal,
        nombre: normalizarNombreLote(nombreOriginal),
        ambiente,
        hectareas: parsearHectareas(descripcion),
        poligono: parsearCoordenadas(coordsTexto),
      });
    });
  });

  const totalesPorNombre = {};
  lotes.forEach((l) => {
    if (l.hectareas != null) {
      totalesPorNombre[l.nombre] = (totalesPorNombre[l.nombre] || 0) + l.hectareas;
    }
  });
  lotes.forEach((l) => {
    l.hectareasTotales = totalesPorNombre[l.nombre] ?? null;
  });

  return lotes;
}

function puntoEnPoligono(lat, lon, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lonI] = poligono[i];
    const [latJ, lonJ] = poligono[j];
    const cruza =
      latI > lat !== latJ > lat &&
      lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function buscarLotePorUbicacion(lat, lon, lotes) {
  return lotes.find((l) => puntoEnPoligono(lat, lon, l.poligono)) || null;
}

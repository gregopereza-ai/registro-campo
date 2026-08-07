// --- Papelera: registros y clima borrados quedan acá 30 días antes de eliminarse en serio ---
const DIAS_RETENCION_PAPELERA = 30;

function renderPapelera() {
  const cont = document.getElementById("lista-papelera");
  if (!cont) return;

  const registrosEliminados = (typeof registrosCacheCompleto !== "undefined" ? registrosCacheCompleto : [])
    .filter((r) => r.eliminado)
    .map((r) => ({ ...r, coleccion: "registros" }));
  const climaEliminado = (typeof climaCacheCompleto !== "undefined" ? climaCacheCompleto : [])
    .filter((c) => c.eliminado)
    .map((c) => ({ ...c, coleccion: "clima" }));

  const todos = [...registrosEliminados, ...climaEliminado].sort((a, b) =>
    (b.eliminadoEn || "").localeCompare(a.eliminadoEn || "")
  );

  cont.innerHTML = todos.length
    ? todos.map(renderTarjetaPapelera).join("")
    : '<p class="vacio">La papelera está vacía.</p>';
}

function renderTarjetaPapelera(r) {
  const esClima = r.coleccion === "clima";
  const nombreTipo = esClima
    ? (typeof NOMBRES_CLIMA !== "undefined" ? NOMBRES_CLIMA[r.tipo] : r.tipo) || r.tipo
    : (typeof NOMBRES_CATEGORIA !== "undefined" ? NOMBRES_CATEGORIA[r.tipo] : r.tipo) || r.tipo;
  const contexto = esClima ? "Clima general" : `Lote: ${escapeHtml(r.lote || "")}`;
  return `
    <div class="registro-card">
      <div class="fila-top">
        <span class="tipo-badge">${escapeHtml(nombreTipo)}</span>
        <span class="lote-fecha">${escapeHtml(r.fecha || "")}</span>
      </div>
      <p class="ayuda-mapa">${contexto}</p>
      <div class="tarjeta-acciones">
        <button class="btn-editar btn-restaurar" data-id="${r.id}" data-coleccion="${r.coleccion}">Restaurar</button>
        <button class="btn-eliminar btn-borrar-definitivo" data-id="${r.id}" data-coleccion="${r.coleccion}">Eliminar definitivamente</button>
      </div>
    </div>
  `;
}

document.getElementById("lista-papelera").addEventListener("click", (e) => {
  const btnRestaurar = e.target.closest(".btn-restaurar");
  if (btnRestaurar) {
    db.collection(btnRestaurar.dataset.coleccion)
      .doc(btnRestaurar.dataset.id)
      .update({ eliminado: false, eliminadoEn: null })
      .then(() => mostrarToast("Restaurado"))
      .catch(() => mostrarToast("No se pudo restaurar (revisá tu conexión)"));
    return;
  }
  const btnBorrar = e.target.closest(".btn-borrar-definitivo");
  if (!btnBorrar) return;
  if (!confirm("¿Eliminar definitivamente? Esto no se puede deshacer.")) return;
  db.collection(btnBorrar.dataset.coleccion)
    .doc(btnBorrar.dataset.id)
    .delete()
    .catch(() => mostrarToast("No se pudo eliminar (revisá tu conexión)"));
});

// --- Purga automática: borra en serio lo que ya lleva más de 30 días en la papelera ---
function purgarPapeleraVieja() {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_RETENCION_PAPELERA);
  const limiteISO = limite.toISOString();

  (typeof registrosCacheCompleto !== "undefined" ? registrosCacheCompleto : [])
    .filter((r) => r.eliminado && r.eliminadoEn && r.eliminadoEn < limiteISO)
    .forEach((r) => db.collection("registros").doc(r.id).delete().catch(() => {}));

  (typeof climaCacheCompleto !== "undefined" ? climaCacheCompleto : [])
    .filter((c) => c.eliminado && c.eliminadoEn && c.eliminadoEn < limiteISO)
    .forEach((c) => db.collection("clima").doc(c.id).delete().catch(() => {}));
}

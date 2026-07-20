// ==========================================
// MOVE EVALUACIONES - STANDALONE
// MOVE Dance Academy
// ==========================================

// ⚠️ IMPORTANTE: reemplaza esta URL por la de TU Worker de
// Cloudflare una vez que lo hayas creado (ver instrucciones).
const WORKER_URL = "evaluacionesmove.movedancea.workers.dev";

// -------------------------------------
// CATEGORÍAS (17), agrupadas en 3 pantallas
// -------------------------------------

const CATEGORIES = [
  { key: "tecnica", label: "Técnica", group: 0 },
  { key: "postura", label: "Postura", group: 0 },
  { key: "brazos", label: "Brazos", group: 0 },
  { key: "piernas", label: "Piernas", group: 0 },
  { key: "control", label: "Control y Limpieza", group: 0 },
  { key: "precision", label: "Precisión de Ejercicios", group: 0 },
  { key: "anatomia", label: "Anatomía del Cuerpo", group: 0 },
  { key: "musicalidad", label: "Musicalidad", group: 1 },
  { key: "proyeccion", label: "Proyección Escénica", group: 1 },
  { key: "coordinacion", label: "Coordinación", group: 1 },
  { key: "espacio", label: "Uso del Espacio", group: 1 },
  { key: "memoria", label: "Memoria Coreográfica", group: 1 },
  { key: "esfuerzo", label: "Esfuerzo y Progreso", group: 2 },
  { key: "atencion", label: "Atención y Enfoque", group: 2 },
  { key: "actitud", label: "Actitud", group: 2 },
  { key: "asistencia", label: "Asistencia", group: 2 },
  { key: "puntualidad", label: "Puntualidad", group: 2 },
];

const GROUP_TITLES = ["💪 Técnica Corporal", "🎭 Artístico", "⭐ Actitud y Disciplina"];
const TOTAL_PANTALLAS_POR_ALUMNA = GROUP_TITLES.length + 1; // + pantalla de textos

// -------------------------------------
// ELEMENTOS
// -------------------------------------

const el = (id) => document.getElementById(id);

const pantallas = {
  cargando: el("pantallaCargando"),
  maestra: el("pantallaMaestra"),
  clase: el("pantallaClase"),
  alumnas: el("pantallaAlumnas"),
  evaluando: el("pantallaEvaluando"),
  listo: el("pantallaListo"),
};

const mensajeError = el("mensajeError");

// -------------------------------------
// ESTADO
// -------------------------------------

let catalogos = { maestras: [], clases: [], periodos: [], alumnas: [] };
let maestraSeleccionada = null;
let contextoEvaluacion = {}; // clase, periodo, tipo, anio
let seleccionAlumnas = new Map(); // id -> {id, nombre, codigo}
let cola = [];
let indiceActual = 0;
let grupoActual = 0;
let ratingsActuales = {};
let contadorGuardadas = 0;

// -------------------------------------
// UTILIDADES
// -------------------------------------

function mostrarPantalla(nombre) {
  Object.values(pantallas).forEach((p) => (p.hidden = true));
  pantallas[nombre].hidden = false;
}

function mostrarError(texto) {
  mensajeError.textContent = texto;
  if (texto) {
    setTimeout(() => {
      if (mensajeError.textContent === texto) mensajeError.textContent = "";
    }, 4000);
  }
}

async function llamarWorker(payload) {
  const respuesta = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const datos = await respuesta.json();
  if (!datos.success) throw new Error(datos.error || "Error desconocido");
  return datos;
}

// -------------------------------------
// INICIO: cargar catálogos
// -------------------------------------

async function iniciar() {
  mostrarPantalla("cargando");
  try {
    const datos = await llamarWorker({ accion: "catalogos" });
    catalogos = datos;
    renderMaestras();
    mostrarPantalla("maestra");
  } catch (e) {
    console.error(e);
    mostrarError("⚠ No se pudo conectar. Revisa tu internet e intenta de nuevo.");
  }
}

// -------------------------------------
// PANTALLA 1: MAESTRA
// -------------------------------------

function renderMaestras() {
  const cont = el("listaMaestras");
  cont.innerHTML = "";
  catalogos.maestras.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m.nombre;
    btn.addEventListener("click", () => seleccionarMaestra(m));
    cont.appendChild(btn);
  });
}

function seleccionarMaestra(maestra) {
  maestraSeleccionada = maestra;
  el("saludoMaestra").textContent = `👋 Hola, ${maestra.nombre}`;
  renderSelect("selectClase", catalogos.clases, "Selecciona una clase");
  renderSelect("selectPeriodo", catalogos.periodos, "Selecciona un periodo");
  el("inputAnio").value = new Date().getFullYear();
  mostrarPantalla("clase");
}

function renderSelect(id, items, placeholder) {
  const select = el(id);
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.nombre;
    select.appendChild(opt);
  });
}

el("btnIrAlumnas").addEventListener("click", () => {
  const claseId = el("selectClase").value;
  const periodoId = el("selectPeriodo").value;
  if (!claseId || !periodoId) {
    mostrarError("Selecciona clase y periodo antes de continuar.");
    return;
  }
  contextoEvaluacion = {
    claseId,
    claseNombre: catalogos.clases.find((c) => c.id === claseId)?.nombre || "",
    periodoId,
    periodoNombre: catalogos.periodos.find((p) => p.id === periodoId)?.nombre || "",
    tipo: el("selectTipo").value,
    anio: el("inputAnio").value,
  };
  seleccionAlumnas = new Map();
  renderAlumnas("");
  actualizarContador();
  mostrarPantalla("alumnas");
});

// -------------------------------------
// PANTALLA 3: SELECCIONAR ALUMNAS (multi)
// -------------------------------------

function renderAlumnas(filtro) {
  const cont = el("listaAlumnas");
  cont.innerHTML = "";
  const texto = filtro.trim().toLowerCase();
  const lista = catalogos.alumnas.filter((a) =>
    !texto || a.nombre.toLowerCase().includes(texto) || a.codigo.includes(texto)
  );

  lista.forEach((a) => {
    const div = document.createElement("div");
    div.className = "item-alumna" + (seleccionAlumnas.has(a.id) ? " seleccionada" : "");
    div.innerHTML = `
      <input type="checkbox" ${seleccionAlumnas.has(a.id) ? "checked" : ""} />
      <span>${a.nombre}${a.codigo ? ` <small style="opacity:.6">(${a.codigo})</small>` : ""}</span>
    `;
    div.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (seleccionAlumnas.has(a.id)) {
        seleccionAlumnas.delete(a.id);
      } else {
        seleccionAlumnas.set(a.id, a);
      }
      renderAlumnas(el("buscarAlumna").value);
      actualizarContador();
    });
    cont.appendChild(div);
  });
}

function actualizarContador() {
  const n = seleccionAlumnas.size;
  el("contadorSeleccion").textContent = `${n} seleccionada${n === 1 ? "" : "s"}`;
  el("btnEmpezarEvaluacion").disabled = n === 0;
}

el("buscarAlumna").addEventListener("input", (e) => renderAlumnas(e.target.value));

el("btnEmpezarEvaluacion").addEventListener("click", () => {
  cola = Array.from(seleccionAlumnas.values());
  indiceActual = 0;
  contadorGuardadas = 0;
  iniciarAlumnaActual();
});

// -------------------------------------
// PANTALLA 4: EVALUANDO (por alumna)
// -------------------------------------

function iniciarAlumnaActual() {
  const alumna = cola[indiceActual];
  ratingsActuales = {};
  grupoActual = 0;
  el("nombreAlumnaActual").textContent = alumna.nombre;
  el("progresoCola").textContent = `Alumna ${indiceActual + 1} de ${cola.length}`;
  renderDots();
  renderGrupoActual();
  mostrarPantalla("evaluando");
}

function renderDots() {
  const cont = el("dotsGrupos");
  cont.innerHTML = "";
  for (let i = 0; i < TOTAL_PANTALLAS_POR_ALUMNA; i++) {
    const span = document.createElement("span");
    if (i <= grupoActual) span.classList.add("fill");
    cont.appendChild(span);
  }
}

function renderGrupoActual() {
  const esPantallaTextos = grupoActual === GROUP_TITLES.length;
  el("grupoCategorias").hidden = esPantallaTextos;
  el("pantallaTextos").hidden = !esPantallaTextos;
  el("btnAtrasGrupo").style.visibility = grupoActual === 0 ? "hidden" : "visible";
  el("btnSiguienteGrupo").textContent = esPantallaTextos
    ? (indiceActual === cola.length - 1 ? "Guardar y terminar ✓" : "Guardar y siguiente alumna →")
    : "Siguiente →";

  if (esPantallaTextos) return;

  const cont = el("grupoCategorias");
  cont.innerHTML = `<p class="grupo-titulo">${GROUP_TITLES[grupoActual]}</p>`;

  CATEGORIES.filter((c) => c.group === grupoActual).forEach((cat) => {
    const fila = document.createElement("div");
    fila.className = "categoria-fila";

    const nombre = document.createElement("span");
    nombre.className = "categoria-nombre";
    nombre.textContent = cat.label;

    const estrellasCont = document.createElement("div");
    estrellasCont.className = "estrellas";

    for (let i = 1; i <= 5; i++) {
      const estrella = document.createElement("span");
      estrella.className = "estrella" + (ratingsActuales[cat.key] >= i ? " activa" : "");
      estrella.textContent = "★";
      estrella.addEventListener("click", () => {
        ratingsActuales[cat.key] = i;
        renderGrupoActual();
      });
      estrellasCont.appendChild(estrella);
    }

    fila.appendChild(nombre);
    fila.appendChild(estrellasCont);
    cont.appendChild(fila);
  });
}

el("btnAtrasGrupo").addEventListener("click", () => {
  if (grupoActual === 0) return;
  grupoActual--;
  renderDots();
  renderGrupoActual();
});

el("btnSiguienteGrupo").addEventListener("click", async () => {
  const esPantallaTextos = grupoActual === GROUP_TITLES.length;

  if (!esPantallaTextos) {
    grupoActual++;
    renderDots();
    renderGrupoActual();
    return;
  }

  // Última pantalla: guardar esta alumna
  const alumna = cola[indiceActual];
  el("btnSiguienteGrupo").disabled = true;
  try {
    await llamarWorker({
      accion: "guardar",
      maestraId: maestraSeleccionada.id,
      alumnaId: alumna.id,
      alumnaNombre: alumna.nombre,
      claseId: contextoEvaluacion.claseId,
      claseNombre: contextoEvaluacion.claseNombre,
      periodoId: contextoEvaluacion.periodoId,
      periodoNombre: contextoEvaluacion.periodoNombre,
      anio: contextoEvaluacion.anio,
      tipo: contextoEvaluacion.tipo,
      ratings: ratingsActuales,
      fortalezas: el("txtFortalezas").value,
      aspectos: el("txtAspectos").value,
      objetivo: el("txtObjetivo").value,
      observaciones: el("txtObservaciones").value,
    });

    contadorGuardadas++;
    limpiarTextos();
    indiceActual++;

    if (indiceActual < cola.length) {
      iniciarAlumnaActual();
    } else {
      el("mensajeFinal").textContent = `Evaluaste a ${contadorGuardadas} alumna${contadorGuardadas === 1 ? "" : "s"} 🎉`;
      mostrarPantalla("listo");
    }
  } catch (e) {
    console.error(e);
    mostrarError("⚠ No se pudo guardar. Intenta de nuevo.");
  } finally {
    el("btnSiguienteGrupo").disabled = false;
  }
});

function limpiarTextos() {
  el("txtFortalezas").value = "";
  el("txtAspectos").value = "";
  el("txtObjetivo").value = "";
  el("txtObservaciones").value = "";
}

// -------------------------------------
// PANTALLA 5: LISTO -> nueva tanda
// -------------------------------------

el("btnNuevaTanda").addEventListener("click", () => {
  seleccionAlumnas = new Map();
  renderAlumnas("");
  actualizarContador();
  el("buscarAlumna").value = "";
  mostrarPantalla("alumnas");
});

// -------------------------------------
iniciar();

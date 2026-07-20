// ==========================================
// MOVE EVALUACIONES - STANDALONE
// MOVE Dance Academy
// ==========================================

const WORKER_URL = "https://evaluacionesmove.movedancea.workers.dev";

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

const GROUP_TITLES = ["💪 Técnica Corporal", "🎭 Artístico", "⭐ Actitud y Disciplina", "📝 Comentarios"];

const TEXT_FIELDS = [
  { key: "fortalezas", label: "Fortalezas", group: 3 },
  { key: "aspectos", label: "Aspectos a mejorar", group: 3 },
  { key: "objetivo", label: "Objetivo siguiente periodo", group: 3 },
  { key: "observaciones", label: "Observaciones", group: 3 },
];

// Cada "punto" es UNA categoría (o un comentario) que se califica para
// TODAS las alumnas seleccionadas al mismo tiempo, antes de pasar al
// siguiente punto. Esto es más rápido que terminar una alumna completa
// antes de pasar a la otra.
const PUNTOS = [
  ...CATEGORIES.map((c) => ({ ...c, tipo: "estrellas" })),
  ...TEXT_FIELDS.map((t) => ({ ...t, tipo: "texto" })),
];

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
let indicePunto = 0;
let datosAlumnas = new Map(); // alumnaId -> { ratings: {}, textos: {} }

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
  datosAlumnas = new Map(cola.map((a) => [a.id, { ratings: {}, textos: {} }]));
  indicePunto = 0;
  renderPunto();
  mostrarPantalla("evaluando");
});

// -------------------------------------
// PANTALLA 4: EVALUANDO
// Una categoría (o comentario) a la vez, mostrando a TODAS las
// alumnas seleccionadas juntas, para calificar más rápido.
// -------------------------------------

function renderPunto() {
  const punto = PUNTOS[indicePunto];
  const esUltimo = indicePunto === PUNTOS.length - 1;

  el("progresoCola").textContent = `Punto ${indicePunto + 1} de ${PUNTOS.length}`;
  el("tituloPunto").textContent = `${GROUP_TITLES[punto.group]} · ${punto.label}`;
  el("barraFill").style.width = `${((indicePunto + 1) / PUNTOS.length) * 100}%`;
  el("btnAtrasGrupo").style.visibility = indicePunto === 0 ? "hidden" : "visible";
  el("btnSiguienteGrupo").textContent = esUltimo ? "Guardar todo ✓" : "Siguiente →";

  const cont = el("filasAlumnas");
  cont.innerHTML = "";

  cola.forEach((alumna) => {
    const datos = datosAlumnas.get(alumna.id);
    const fila = document.createElement("div");
    fila.className = "fila-alumna-punto";

    const nombre = document.createElement("span");
    nombre.className = "fila-alumna-nombre";
    nombre.textContent = alumna.nombre;
    fila.appendChild(nombre);

    if (punto.tipo === "estrellas") {
      const estrellasCont = document.createElement("div");
      estrellasCont.className = "estrellas";
      for (let i = 1; i <= 5; i++) {
        const estrella = document.createElement("span");
        estrella.className = "estrella" + (datos.ratings[punto.key] >= i ? " activa" : "");
        estrella.textContent = "★";
        estrella.addEventListener("click", () => {
          datos.ratings[punto.key] = i;
          renderPunto();
        });
        estrellasCont.appendChild(estrella);
      }
      fila.appendChild(estrellasCont);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "input-texto-fila";
      input.placeholder = "(opcional)";
      input.value = datos.textos[punto.key] || "";
      input.addEventListener("input", (e) => {
        datos.textos[punto.key] = e.target.value;
      });
      fila.appendChild(input);
    }

    cont.appendChild(fila);
  });
}

el("btnAtrasGrupo").addEventListener("click", () => {
  if (indicePunto === 0) return;
  indicePunto--;
  renderPunto();
});

el("btnSiguienteGrupo").addEventListener("click", async () => {
  const esUltimo = indicePunto === PUNTOS.length - 1;

  if (!esUltimo) {
    indicePunto++;
    renderPunto();
    return;
  }

  // Último punto: guardar la evaluación de TODAS las alumnas de la cola
  const btn = el("btnSiguienteGrupo");
  btn.disabled = true;
  let guardadas = 0;

  try {
    for (const alumna of cola) {
      btn.textContent = `Guardando ${guardadas + 1}/${cola.length}...`;
      const datos = datosAlumnas.get(alumna.id);
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
        ratings: datos.ratings,
        fortalezas: datos.textos.fortalezas || "",
        aspectos: datos.textos.aspectos || "",
        objetivo: datos.textos.objetivo || "",
        observaciones: datos.textos.observaciones || "",
      });
      guardadas++;
    }

    el("mensajeFinal").textContent = `Evaluaste a ${guardadas} alumna${guardadas === 1 ? "" : "s"} 🎉`;
    mostrarPantalla("listo");
  } catch (e) {
    console.error(e);
    mostrarError(
      `⚠ Se guardaron ${guardadas} de ${cola.length}. Hubo un error al continuar — intenta de nuevo.`
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar todo ✓";
  }
});

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

/* 
   constantes generales del sistema
 */
const KIB = 1024;
const MEMORIA_TOTAL = 16 * 1024 * 1024;
const ENCABEZADO_EXE = 1 * KIB;

/* 
   estado global de la simulación
 */
let config = {};
let particiones = [];
// marcos = memoria física dividida en marcos de tamaño fijo (solo paginación)
let marcos = [];
// programas = plantillas disponibles (lo que se ve en el catálogo)
// procesos  = instancias en ejecución (cada una ocupa una partición)
let programas = [];
let procesos = [];
let idParticiones = 0;
let idProcesos = 0;
let idProgramas = 0;
// definiciones (en KiB) de los programas que agrega el usuario; persisten
// aunque se reinicie la simulación o se cambie el tipo de gestión de memoria
let programasPersonalizados = [];

/* 
   utilidades
 */
function aBytes(kib) {
  return Math.round(kib * KIB);
}

function aKiB(bytes) {
  const v = bytes / KIB;
  return Number.isInteger(v) ? v : v.toFixed(1);
}

function aHex(valor) {
  return "0x" + valor.toString(16).toUpperCase().padStart(6, "0");
}

function mostrarMensaje(texto) {
  const contenedor = document.getElementById("toast");
  if (!contenedor) return;
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = texto;
  contenedor.appendChild(item);
  setTimeout(() => item.remove(), 4000);
}

/* 
   pantalla de configuración: mostrar/ocultar secciones según tipo
 */
const selectorTipo = document.getElementById("tipoGestion");
if (selectorTipo) {
  selectorTipo.addEventListener("change", actualizarSeccionesConfig);
}

function actualizarSeccionesConfig() {
  if (!selectorTipo) return;
  const tipo = selectorTipo.value;
  document
    .getElementById("seccionFija")
    ?.classList.toggle("oculto", tipo !== "fija");
  document
    .getElementById("seccionVariable")
    ?.classList.toggle("oculto", tipo !== "variable");
  document
    .getElementById("seccionDinamica")
    ?.classList.toggle("oculto", tipo !== "dinamica");
  document
    .getElementById("seccionSegmentacion")
    ?.classList.toggle("oculto", tipo !== "segmentacion");
  document
    .getElementById("seccionPaginacion")
    ?.classList.toggle("oculto", tipo !== "paginacion");
  // el algoritmo de ajuste aplica a variable, dinámica y segmentación
  // (no a fija, que son particiones idénticas, ni a paginación, que usa
  // el primer marco libre)
  const sinAlgoritmo = tipo === "fija" || tipo === "paginacion";
  document
    .getElementById("seccionAlgoritmo")
    ?.classList.toggle("oculto", sinAlgoritmo);
}
actualizarSeccionesConfig();

// generar campos de tamaño para particiones de tamaño variable
const camposVariable = [4096, 2048, 1024, 512];
const inputNumVariable = document.getElementById("numParticionesVariable");
if (inputNumVariable) {
  inputNumVariable.addEventListener("input", generarCamposVariable);
}

function generarCamposVariable() {
  if (!inputNumVariable) return;
  const cantidad = parseInt(inputNumVariable.value) || 0;
  const contenedor = document.getElementById("listaTamanosVariable");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  for (let i = 0; i < cantidad; i++) {
    const fila = document.createElement("div");
    fila.className = "tamano-variable-item";
    const valorPredeterminado = camposVariable[i] ?? 512;
    fila.innerHTML = `<span>Partición ${i + 1}</span><input type="number" class="tamanoVariableInput" value="${valorPredeterminado}" min="1">`;
    contenedor.appendChild(fila);
  }
}
generarCamposVariable();

/* 
   iniciar simulación a partir del formulario de configuración
 */
document.getElementById("botonIniciar")?.addEventListener("click", () => {
  const errorBox = document.getElementById("errorConfig");
  if (errorBox) errorBox.textContent = "";

  const tipo = selectorTipo ? selectorTipo.value : "dinamica";
  const memoriaSO = aBytes(
    parseFloat(document.getElementById("memoriaSO")?.value) || 0,
  );
  const pila = aBytes(
    parseFloat(document.getElementById("tamPila")?.value) || 0,
  );
  const monticulo = aBytes(
    parseFloat(document.getElementById("tamMonticulo")?.value) || 0,
  );
  const disponible = MEMORIA_TOTAL - memoriaSO;

  if (memoriaSO < 0 || memoriaSO >= MEMORIA_TOTAL) {
    if (errorBox)
      errorBox.textContent =
        "La memoria reservada para el sistema operativo no es válida.";
    return;
  }

  const elAlgoritmo = document.getElementById("algoritmoAsignacion");
  config = {
    tipo,
    memoriaSO,
    pila,
    monticulo,
    algoritmo: elAlgoritmo ? elAlgoritmo.value : "primer",
  };

  if (tipo === "fija") {
    config.numParticiones =
      parseInt(document.getElementById("numParticionesFija")?.value) || 0;
    config.tamParticion = aBytes(
      parseFloat(document.getElementById("tamParticionFija")?.value) || 0,
    );
    if (config.numParticiones <= 0 || config.tamParticion <= 0) {
      if (errorBox)
        errorBox.textContent =
          "Define un número y tamaño de partición válidos.";
      return;
    }
  } else if (tipo === "variable") {
    const entradas = Array.from(
      document.querySelectorAll(".tamanoVariableInput"),
    );
    config.tamañosParticiones = entradas.map((e) =>
      aBytes(parseFloat(e.value) || 0),
    );
    const suma = config.tamañosParticiones.reduce((a, b) => a + b, 0);
    if (config.tamañosParticiones.some((t) => t <= 0)) {
      if (errorBox)
        errorBox.textContent =
          "Todos los tamaños de partición deben ser mayores a cero.";
      return;
    }
    if (suma > disponible) {
      if (errorBox)
        errorBox.textContent =
          "La suma de las particiones supera la memoria disponible (" +
          aKiB(disponible) +
          " KiB).";
      return;
    }
  } else if (tipo === "dinamica") {
    const radioCompactacion = document.querySelector(
      "input[name=compactacion]:checked",
    );
    config.compactacion = radioCompactacion
      ? radioCompactacion.value === "si"
      : false;
  } else if (tipo === "paginacion") {
    const tamPaginaKiB =
      parseFloat(document.getElementById("tamPagina")?.value) || 0;
    config.tamPagina = aBytes(tamPaginaKiB);
    if (config.tamPagina <= 0) {
      if (errorBox)
        errorBox.textContent = "Define un tamaño de página válido.";
      return;
    }
  }
  // segmentación no requiere parámetros extra: usa memoriaSO, algoritmo,
  // pila y montículo ya leídos arriba

  inicializarSimulacion();
});

/* 
   construir el mapa inicial de particiones
 */
function crearParticionesIniciales() {
  particiones = [];
  marcos = [];
  idParticiones = 0;
  let base = config.memoriaSO;
  const disponible = MEMORIA_TOTAL - config.memoriaSO;

  if (config.tipo === "paginacion") {
    crearMarcos();
    return;
  }

  if (config.tipo === "segmentacion") {
    // segmentación: igual que dinámica, un único bloque libre inicial
    particiones.push(crearParticion(base, disponible));
    return;
  }

  if (config.tipo === "fija") {
    for (let i = 0; i < config.numParticiones; i++) {
      if (base + config.tamParticion > MEMORIA_TOTAL) break;
      particiones.push(crearParticion(base, config.tamParticion));
      base += config.tamParticion;
    }
  } else if (config.tipo === "variable") {
    config.tamañosParticiones.forEach((tam) => {
      if (base + tam > MEMORIA_TOTAL) return;
      particiones.push(crearParticion(base, tam));
      base += tam;
    });
  } else {
    // dinámica: un único bloque libre que cubre toda la memoria disponible
    particiones.push(crearParticion(base, disponible));
    return;
  }

  // el espacio restante, si lo hay, queda como una partición libre adicional
  const restante = MEMORIA_TOTAL - base;
  if (restante > 0) particiones.push(crearParticion(base, restante));
}

function crearParticion(base, tamano) {
  return {
    id: ++idParticiones,
    base,
    tamano,
    estado: "libre",
    procesoId: null,
  };
}

// divide toda la memoria direccionable en marcos de tamaño fijo. Los marcos
// que caen dentro de la región del SO quedan reservados (no asignables).
function crearMarcos() {
  marcos = [];
  const tam = config.tamPagina;
  const total = Math.floor(MEMORIA_TOTAL / tam);
  for (let i = 0; i < total; i++) {
    const base = i * tam;
    const esSO = base < config.memoriaSO;
    marcos.push({
      indice: i,
      base,
      libre: !esSO,
      reservadoSO: esSO,
      procesoId: null,
      pagina: null,
    });
  }
}

/* 
   catálogo de programas (plantillas) precargados
 */
function crearProgramas() {
  programas = [];
  procesos = [];
  idProgramas = 0;
  idProcesos = 0;
  const base = [
    {
      nombre: "explorador.exe",
      codigo: 120,
      datosIni: 30,
      datosNoIni: 50,
    },
    {
      nombre: "bloc_notas.exe",
      codigo: 45,
      datosIni: 10,
      datosNoIni: 15,
    },
    {
      nombre: "calculadora.exe",
      codigo: 30,
      datosIni: 8,
      datosNoIni: 12,
    },
    {
      nombre: "reproductor.exe",
      codigo: 200,
      datosIni: 60,
      datosNoIni: 100,
    },
    {
      nombre: "navegador.exe",
      codigo: 500,
      datosIni: 150,
      datosNoIni: 300,
    },
  ];
  base.forEach((p) =>
    agregarPrograma(p.nombre, p.codigo, p.datosIni, p.datosNoIni, true),
  );

  // recrear los programas que el usuario agregó en sesiones anteriores
  // (se recalcula memAUsar con la pila/montículo de la config actual)
  programasPersonalizados.forEach((p) =>
    agregarPrograma(p.nombre, p.codigo, p.datosIni, p.datosNoIni, false),
  );
}

// crea una plantilla de programa en el catálogo (no la ejecuta)
function agregarPrograma(
  nombre,
  codigoKiB,
  datosIniKiB,
  datosNoIniKiB,
  precargado = false,
) {
  const codigo = aBytes(codigoKiB);
  const datosIni = aBytes(datosIniKiB);
  const datosNoIni = aBytes(datosNoIniKiB);
  const memInicial = codigo + datosIni + datosNoIni;
  const memAUsar = memInicial + config.pila + config.monticulo + ENCABEZADO_EXE;
  programas.push({
    id: ++idProgramas,
    nombre,
    codigo,
    datosIni,
    datosNoIni,
    memInicial,
    memAUsar,
    precargado,
  });
}

// descompone un programa en sus segmentos lógicos (en bytes). Se usa tanto
// para segmentación como para paginación. El encabezado del ejecutable se
// suma al segmento de código.
function obtenerSegmentos(prog) {
  return [
    { nombre: ".text", abrev: "C", tamano: prog.codigo + ENCABEZADO_EXE },
    { nombre: ".data", abrev: "DI", tamano: prog.datosIni },
    { nombre: ".bss", abrev: "DN", tamano: prog.datosNoIni },
    { nombre: ".stack", abrev: "P", tamano: config.pila },
    { nombre: ".heap", abrev: "H", tamano: config.monticulo },
  ].filter((s) => s.tamano > 0);
}

/* 
   algoritmos de asignación
 */
function elegirParticionLibre(candidatas) {
  if (candidatas.length === 0) return null;
  if (config.algoritmo === "mejor")
    return candidatas.reduce((a, b) => (b.tamano < a.tamano ? b : a));
  if (config.algoritmo === "peor")
    return candidatas.reduce((a, b) => (b.tamano > a.tamano ? b : a));
  return candidatas[0]; // primer ajuste
}

/* 
   iniciar / detener procesos
 */
// crea una nueva instancia (proceso) a partir de una plantilla de programa.
// un mismo programa puede iniciarse varias veces: cada llamada genera una
// instancia distinta que ocupa su propia partición.
function iniciarPrograma(idPrograma) {
  const programa = programas.find((p) => p.id === idPrograma);
  if (!programa) return;

  // nueva instancia en ejecución derivada de la plantilla
  const proceso = {
    id: ++idProcesos,
    programaId: programa.id,
    nombre: programa.nombre,
    codigo: programa.codigo,
    datosIni: programa.datosIni,
    datosNoIni: programa.datosNoIni,
    memInicial: programa.memInicial,
    memAUsar: programa.memAUsar,
    particionId: null,
    base: null,
    limite: null,
    segmentos: null, // segmentación
    paginas: null, // paginación
  };

  let ok;
  if (config.tipo === "segmentacion") {
    ok = asignarSegmentacion(proceso, programa);
  } else if (config.tipo === "paginacion") {
    ok = asignarPaginacion(proceso, programa);
  } else {
    ok = asignarContiguo(proceso, programa);
  }

  if (!ok) return; // no se pudo asignar; el mensaje ya se mostró

  procesos.push(proceso);
  renderizarTodo();
}

// asignación contigua clásica (fija / variable / dinámica)
function asignarContiguo(proceso, programa) {
  const candidatas = particiones.filter(
    (p) => p.estado === "libre" && p.tamano >= programa.memAUsar,
  );
  const elegida = elegirParticionLibre(candidatas);
  if (!elegida) {
    mostrarMensaje("No hay espacio suficiente para " + programa.nombre + ".");
    return false;
  }

  if (config.tipo === "dinamica") {
    // Asegurar orden espacial antes de calcular sobrantes e índices
    particiones.sort((a, b) => a.base - b.base);
    const sobrante = elegida.tamano - proceso.memAUsar;
    elegida.tamano = proceso.memAUsar;
    elegida.estado = "ocupada";
    elegida.procesoId = proceso.id;

    if (sobrante > 0) {
      const posicion = particiones.indexOf(elegida) + 1;
      particiones.splice(
        posicion,
        0,
        crearParticion(elegida.base + elegida.tamano, sobrante),
      );
    }
  } else {
    elegida.estado = "ocupada";
    elegida.procesoId = proceso.id;
  }

  proceso.particionId = elegida.id;
  proceso.base = elegida.base;
  proceso.limite = elegida.base + elegida.tamano - 1;
  return true;
}

// SEGMENTACIÓN: cada segmento se ubica por separado en un hueco libre.
// La memoria se modela con el mismo arreglo `particiones` (huecos libres y
// bloques ocupados), igual que en dinámica, pero un proceso ocupa varios
// bloques (uno por segmento).
function asignarSegmentacion(proceso, programa) {
  const segmentos = obtenerSegmentos(programa);

  // Se colocan los segmentos uno a uno sobre el estado real de la memoria,
  // usando el algoritmo de ajuste. Si algún segmento no cabe, se revierte
  // todo lo asignado a este proceso para no dejar una carga parcial.
  proceso.segmentos = [];

  for (const seg of segmentos) {
    particiones.sort((a, b) => a.base - b.base);
    const candidatas = particiones.filter(
      (p) => p.estado === "libre" && p.tamano >= seg.tamano,
    );
    const hueco = elegirParticionLibre(candidatas);

    if (!hueco) {
      // no cabe: revertir los segmentos ya colocados de este proceso
      revertirSegmentos(proceso);
      mostrarMensaje(
        "No hay hueco para el segmento " +
          seg.nombre +
          " de " +
          programa.nombre +
          ".",
      );
      return false;
    }

    const sobrante = hueco.tamano - seg.tamano;
    hueco.tamano = seg.tamano;
    hueco.estado = "ocupada";
    hueco.procesoId = proceso.id;
    hueco.segmento = seg.nombre;

    proceso.segmentos.push({
      nombre: seg.nombre,
      abrev: seg.abrev,
      base: hueco.base,
      limite: hueco.base + seg.tamano - 1,
      tamano: seg.tamano,
      particionId: hueco.id,
    });

    if (sobrante > 0) {
      const posicion = particiones.indexOf(hueco) + 1;
      particiones.splice(
        posicion,
        0,
        crearParticion(hueco.base + hueco.tamano, sobrante),
      );
    }
  }
  return true;
}

// libera los bloques ya asignados a un proceso en segmentación (rollback
// cuando la asignación no se pudo completar)
function revertirSegmentos(proceso) {
  particiones.forEach((p) => {
    if (p.procesoId === proceso.id) {
      p.estado = "libre";
      p.procesoId = null;
      p.segmento = null;
    }
  });
  proceso.segmentos = [];
  fusionarHuecosAdyacentes();
}

// PAGINACIÓN: el proceso se parte en páginas del tamaño de marco y cada
// página va a cualquier marco libre (no contiguo). No usa algoritmo de ajuste.
function asignarPaginacion(proceso, programa) {
  const tamPagina = config.tamPagina;
  // número total de páginas que necesita el proceso completo
  const numPaginas = Math.ceil(programa.memAUsar / tamPagina);

  const marcosLibres = marcos.filter((m) => m.libre);
  if (marcosLibres.length < numPaginas) {
    mostrarMensaje(
      "No hay marcos suficientes para " +
        programa.nombre +
        " (necesita " +
        numPaginas +
        ", libres " +
        marcosLibres.length +
        ").",
    );
    return false;
  }

  proceso.paginas = [];
  for (let i = 0; i < numPaginas; i++) {
    const marco = marcosLibres[i];
    marco.libre = false;
    marco.procesoId = proceso.id;
    marco.pagina = i;
    proceso.paginas.push({ pagina: i, marco: marco.indice, presente: true });
  }
  return true;
}

// detiene una instancia concreta (por id de proceso) y libera su memoria
function detenerProceso(id) {
  const proceso = procesos.find((p) => p.id === id);
  if (!proceso) return;

  if (config.tipo === "paginacion") {
    // liberar todos los marcos ocupados por el proceso
    marcos.forEach((m) => {
      if (m.procesoId === id) {
        m.libre = true;
        m.procesoId = null;
        m.pagina = null;
      }
    });
  } else {
    // fija/variable/dinámica/segmentación: liberar los bloques del proceso.
    // En segmentación un proceso ocupa varios bloques; en el resto, uno.
    particiones.forEach((p) => {
      if (p.procesoId === id) {
        p.estado = "libre";
        p.procesoId = null;
        p.segmento = null;
      }
    });
  }

  // la instancia desaparece al detenerse
  procesos = procesos.filter((p) => p.id !== id);

  if (config.tipo === "dinamica" || config.tipo === "segmentacion") {
    fusionarHuecosAdyacentes();
    if (config.tipo === "dinamica" && config.compactacion) compactarMemoria();
  }

  renderizarTodo();
}

// elimina una plantilla del catálogo y detiene todas sus instancias activas
function eliminarPrograma(idPrograma) {
  const programa = programas.find((p) => p.id === idPrograma);
  if (!programa || programa.precargado) return;

  // detener todas las instancias en ejecución de este programa
  procesos
    .filter((p) => p.programaId === idPrograma)
    .forEach((p) => detenerProceso(p.id));

  // quitar la plantilla del catálogo
  programas = programas.filter((p) => p.id !== idPrograma);

  // quitarlo del almacén persistente para que no reaparezca al reiniciar.
  // se busca por los campos originales en KiB con los que fue creado
  const indice = programasPersonalizados.findIndex(
    (pp) =>
      pp.nombre === programa.nombre &&
      aBytes(pp.codigo) === programa.codigo &&
      aBytes(pp.datosIni) === programa.datosIni &&
      aBytes(pp.datosNoIni) === programa.datosNoIni,
  );
  if (indice !== -1) programasPersonalizados.splice(indice, 1);

  renderizarTodo();
}

function fusionarHuecosAdyacentes() {
  particiones.sort((a, b) => a.base - b.base);
  particiones = particiones.reduce((acc, curr) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.estado === "libre" && curr.estado === "libre") {
      prev.tamano += curr.tamano;
    } else {
      acc.push(curr);
    }
    return acc;
  }, []);
}

function compactarMemoria() {
  particiones.sort((a, b) => a.base - b.base);
  let base = config.memoriaSO;
  const nuevas = [];

  particiones
    .filter((p) => p.estado === "ocupada")
    .forEach((p) => {
      p.base = base;
      nuevas.push(p);
      base += p.tamano;
      const proceso = procesos.find((pr) => pr.id === p.procesoId);
      if (proceso) {
        proceso.base = p.base;
        proceso.limite = p.base + p.tamano - 1;
      }
    });

  const restante = MEMORIA_TOTAL - base;
  if (restante > 0) nuevas.push(crearParticion(base, restante));
  particiones = nuevas;
}

/* 
   render: tabla de procesos
 */
function renderizarProcesos() {
  const cuerpo = document.getElementById("cuerpoTablaProcesos");
  if (!cuerpo) return;
  cuerpo.innerHTML = "";

  programas.forEach((prog) => {
    // instancias en ejecución de este programa
    const instancias = procesos.filter((p) => p.programaId === prog.id);

    // fila de la plantilla
    const fila = document.createElement("tr");
    const insignia =
      instancias.length > 0
        ? `<span class="insignia insignia-ejecutando">${instancias.length} en ejecución</span>`
        : '<span class="insignia insignia-detenido">Detenido</span>';
    const botonIniciar = `<button class="boton-pequeno" onclick="iniciarPrograma(${prog.id})">Iniciar</button>`;
    // solo los programas agregados por el usuario se pueden eliminar
    const botonEliminar = prog.precargado
      ? ""
      : `<button class="boton-pequeno boton-eliminar" onclick="eliminarPrograma(${prog.id})">Eliminar</button>`;
    fila.innerHTML = `
      <td>${prog.nombre}${prog.precargado ? '<div class="etiqueta-precargado">precargado</div>' : ""}</td>
      <td>${aKiB(prog.codigo)}</td>
      <td>${aKiB(prog.datosIni)}</td>
      <td>${aKiB(prog.datosNoIni)}</td>
      <td>${aKiB(prog.memInicial)}</td>
      <td>${aKiB(prog.memAUsar)}</td>
      <td>${insignia}</td>
      <td class="celda-acciones">${botonIniciar}${botonEliminar}</td>`;
    cuerpo.appendChild(fila);

    // sub-filas: una por cada instancia activa
    instancias.forEach((inst, i) => {
      const subfila = document.createElement("tr");
      subfila.className = "fila-instancia";
      // la descripción de ubicación depende del método de gestión
      let ubicacion;
      if (config.tipo === "segmentacion") {
        ubicacion = `${(inst.segmentos || []).length} segmentos`;
      } else if (config.tipo === "paginacion") {
        ubicacion = `${(inst.paginas || []).length} páginas`;
      } else {
        ubicacion = `partición P${inst.particionId} · ${aHex(inst.base)}–${aHex(inst.limite)}`;
      }
      subfila.innerHTML = `
        <td colspan="6">↳ Instancia #${i + 1} (PID ${inst.id}) · ${ubicacion}</td>
        <td><span class="insignia insignia-ocupada">Ejecutando</span></td>
        <td class="celda-acciones"><button class="boton-pequeno" onclick="detenerProceso(${inst.id})">Detener</button></td>`;
      cuerpo.appendChild(subfila);
    });
  });
}

/* 
   render: tabla de particiones
 */
function renderizarParticiones() {
  const cuerpo = document.getElementById("cuerpoTablaParticiones");
  if (!cuerpo) return;
  cuerpo.innerHTML = "";
  particiones
    .slice()
    .sort((a, b) => a.base - b.base)
    .forEach((part) => {
      const proceso = procesos.find((p) => p.id === part.procesoId);
      const insignia =
        part.estado === "ocupada"
          ? '<span class="insignia insignia-ocupada">Ocupada</span>'
          : '<span class="insignia insignia-libre">Libre</span>';
      // en segmentación, el contenido indica el proceso y el segmento
      let contenido = "-";
      if (proceso) {
        contenido = proceso.nombre;
        if (part.segmento) contenido += ` · ${part.segmento}`;
      }
      const fila = document.createElement("tr");
      fila.innerHTML = `
      <td>P${part.id}</td>
      <td class="direccion">${aHex(part.base)}</td>
      <td class="direccion">${aHex(part.base + part.tamano - 1)}</td>
      <td>${aKiB(part.tamano)} KiB</td>
      <td>${insignia}</td>
      <td>${contenido}</td>`;
      cuerpo.appendChild(fila);
    });
}

/* 
   render: tabla de marcos (paginación)
 */
function renderizarMarcos() {
  const cuerpo = document.getElementById("cuerpoTablaMarcos");
  if (!cuerpo) return;
  cuerpo.innerHTML = "";

  const libres = marcos.filter((m) => m.libre).length;
  const ocupados = marcos.filter((m) => !m.libre && !m.reservadoSO).length;
  const reservados = marcos.filter((m) => m.reservadoSO).length;
  const resumen = document.getElementById("resumenMarcos");
  if (resumen)
    resumen.textContent = `${marcos.length} marcos de ${aKiB(config.tamPagina)} KiB · ${libres} libres · ${ocupados} ocupados · ${reservados} del SO`;

  marcos.forEach((m) => {
    const proceso = m.procesoId
      ? procesos.find((p) => p.id === m.procesoId)
      : null;
    let estado, contenido;
    if (m.reservadoSO) {
      estado = '<span class="insignia insignia-detenido">SO</span>';
      contenido = "Sistema operativo";
    } else if (m.libre) {
      estado = '<span class="insignia insignia-libre">Libre</span>';
      contenido = "-";
    } else {
      estado = '<span class="insignia insignia-ocupada">Ocupado</span>';
      contenido = proceso
        ? `${proceso.nombre} · pág ${m.pagina}`
        : `pág ${m.pagina}`;
    }
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${m.indice}</td>
      <td class="direccion">${aHex(m.base)}</td>
      <td>${estado}</td>
      <td>${contenido}</td>`;
    cuerpo.appendChild(fila);
  });
}

/* 
   render: tablas por proceso (segmentos / páginas)
 */
function renderizarTablasProceso() {
  const panel = document.getElementById("panelTablasProceso");
  const contenedor = document.getElementById("contenedorTablasProceso");
  const titulo = document.getElementById("tituloTablasProceso");
  if (!panel || !contenedor) return;

  const esSeg = config.tipo === "segmentacion";
  const esPag = config.tipo === "paginacion";

  if (!esSeg && !esPag) {
    panel.classList.add("oculto");
    return;
  }
  panel.classList.remove("oculto");
  if (titulo)
    titulo.textContent = esSeg
      ? "Tablas de segmentos por proceso"
      : "Tablas de páginas por proceso";

  contenedor.innerHTML = "";
  if (procesos.length === 0) {
    contenedor.innerHTML =
      '<p class="nota-panel">No hay procesos en ejecución.</p>';
    return;
  }

  procesos.forEach((proc) => {
    const bloque = document.createElement("div");
    bloque.className = "tabla-proceso";
    if (esSeg) {
      const filas = (proc.segmentos || [])
        .map(
          (s) => `
          <tr>
            <td>${s.nombre}</td>
            <td>${aKiB(s.tamano)} KiB</td>
            <td class="direccion">${aHex(s.base)}</td>
            <td class="direccion">${aHex(s.limite)}</td>
          </tr>`,
        )
        .join("");
      bloque.innerHTML = `
        <h3 class="titulo-tabla-proceso">${proc.nombre} <span class="pid">(PID ${proc.id})</span></h3>
        <table>
          <thead>
            <tr><th>Segmento</th><th>Tamaño</th><th>Base</th><th>Límite</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`;
    } else {
      const filas = (proc.paginas || [])
        .map((pg) => {
          const marco = marcos.find((m) => m.indice === pg.marco);
          return `
          <tr>
            <td>${pg.pagina} <span class="hex-suave">(0x${pg.pagina.toString(16).toUpperCase()})</span></td>
            <td>${pg.marco} <span class="hex-suave">(0x${pg.marco.toString(16).toUpperCase()})</span></td>
            <td class="direccion">${marco ? aHex(marco.base) : "-"}</td>
            <td><span class="insignia insignia-libre">Presente</span></td>
          </tr>`;
        })
        .join("");
      bloque.innerHTML = `
        <h3 class="titulo-tabla-proceso">${proc.nombre} <span class="pid">(PID ${proc.id})</span></h3>
        <table>
          <thead>
            <tr><th>Página</th><th>Marco</th><th>Dir. base</th><th>Presente</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`;
    }
    contenedor.appendChild(bloque);
  });
}

/* 
   render: mapa de memoria vertical
 */
function renderizarMapaMemoria() {
  const contenedor = document.getElementById("mapaMemoria");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  // paginación: rejilla de marcos de igual tamaño
  if (config.tipo === "paginacion") {
    renderizarMapaMarcos(contenedor);
    return;
  }

  // resto: bloques verticales proporcionales
  contenedor.classList.remove("mapa-rejilla");

  const bloqueSO = document.createElement("div");
  bloqueSO.className = "bloque-mapa bloque-so";
  bloqueSO.style.flex = config.memoriaSO / MEMORIA_TOTAL;
  bloqueSO.innerHTML = `<div class="direcciones"><span>${aHex(0)}</span><span>${aHex(config.memoriaSO - 1)}</span></div><span>SO (${aKiB(config.memoriaSO)} KiB)</span>`;
  contenedor.appendChild(bloqueSO);

  particiones
    .slice()
    .sort((a, b) => a.base - b.base)
    .forEach((part) => {
      const proceso = procesos.find((p) => p.id === part.procesoId);
      const bloque = document.createElement("div");
      bloque.className =
        "bloque-mapa " +
        (part.estado === "ocupada" ? "bloque-ocupado" : "bloque-libre");
      bloque.style.flex = part.tamano / MEMORIA_TOTAL;
      // en segmentación, etiquetar con proceso + segmento
      let etiqueta = "Libre";
      if (part.estado === "ocupada" && proceso) {
        etiqueta = part.segmento
          ? `${proceso.nombre} ${part.segmento}`
          : proceso.nombre;
      }
      bloque.innerHTML = `<div class="direcciones"><span>${aHex(part.base)}</span><span>${aHex(part.base + part.tamano - 1)}</span></div><span>${etiqueta}</span>`;
      contenedor.appendChild(bloque);
    });
}

// mapa en rejilla para paginación: un recuadro por marco
function renderizarMapaMarcos(contenedor) {
  contenedor.classList.add("mapa-rejilla");
  marcos.forEach((m) => {
    const proceso = m.procesoId
      ? procesos.find((p) => p.id === m.procesoId)
      : null;
    const celda = document.createElement("div");
    let clase = "celda-marco";
    if (m.reservadoSO) clase += " marco-so";
    else if (m.libre) clase += " marco-libre";
    else clase += " marco-ocupado";
    celda.className = clase;
    const etiqueta = m.reservadoSO
      ? "SO"
      : m.libre
        ? ""
        : proceso
          ? `${proceso.id}:${m.pagina}`
          : m.pagina;
    celda.title = m.reservadoSO
      ? `Marco ${m.indice} · ${aHex(m.base)} · SO`
      : m.libre
        ? `Marco ${m.indice} · ${aHex(m.base)} · libre`
        : `Marco ${m.indice} · ${aHex(m.base)} · ${proceso ? proceso.nombre : ""} página ${m.pagina}`;
    celda.textContent = etiqueta;
    contenedor.appendChild(celda);
  });
}

// muestra u oculta los paneles según el tipo de gestión activo
function actualizarVisibilidadPaneles() {
  const esPag = config.tipo === "paginacion";
  document.getElementById("panelMarcos")?.classList.toggle("oculto", !esPag);
  // en paginación el panel de particiones/huecos no aplica
  document.getElementById("panelParticiones")?.classList.toggle("oculto", esPag);

  const titulo = document.getElementById("tituloPanelParticiones");
  if (titulo)
    titulo.textContent =
      config.tipo === "segmentacion"
        ? "Huecos y segmentos en memoria"
        : "Estado de particiones";
}

function renderizarTodo() {
  actualizarVisibilidadPaneles();
  renderizarProcesos();
  renderizarParticiones();
  renderizarMarcos();
  renderizarTablasProceso();
  renderizarMapaMemoria();
}

/* 
   modal para agregar un nuevo programa
 */
const modal = document.getElementById("modalAgregarPrograma");
document
  .getElementById("botonAgregarPrograma")
  ?.addEventListener("click", () => {
    const errBox = document.getElementById("errorModal");
    if (errBox) errBox.textContent = "";
    modal?.classList.remove("oculto");
  });

document
  .getElementById("botonCancelarModal")
  ?.addEventListener("click", () => modal?.classList.add("oculto"));

document
  .getElementById("botonConfirmarModal")
  ?.addEventListener("click", () => {
    const nombre = document.getElementById("campoNombrePrograma")?.value.trim();
    const codigo = parseFloat(
      document.getElementById("campoCodigoPrograma")?.value,
    );
    const datosIni = parseFloat(
      document.getElementById("campoDatosIniPrograma")?.value,
    );
    const datosNoIni = parseFloat(
      document.getElementById("campoDatosNoIniPrograma")?.value,
    );
    const errorModal = document.getElementById("errorModal");

    if (!nombre) {
      if (errorModal)
        errorModal.textContent = "Ingresa un nombre para el programa.";
      return;
    }
    if ([codigo, datosIni, datosNoIni].some((v) => isNaN(v) || v < 0)) {
      if (errorModal)
        errorModal.textContent = "Los tamaños deben ser números válidos.";
      return;
    }

    // guardar la definición para que persista al reiniciar o cambiar de tipo
    programasPersonalizados.push({ nombre, codigo, datosIni, datosNoIni });

    agregarPrograma(nombre, codigo, datosIni, datosNoIni, false);
    renderizarProcesos();
    modal?.classList.add("oculto");
  });

/* 
   arranque de la simulación y reinicio
 */
function inicializarSimulacion() {
  crearParticionesIniciales();
  crearProgramas();

  const nombresTipo = {
    fija: "Particiones fijas",
    variable: "Particiones variables",
    dinamica: "Particiones dinámicas",
    segmentacion: "Segmentación",
    paginacion: "Paginación",
  };
  const nombresAlgoritmo = {
    primer: "Primer ajuste",
    mejor: "Mejor ajuste",
    peor: "Peor ajuste",
  };
  // el algoritmo aplica a variable, dinámica y segmentación
  const usaAlgoritmo =
    config.tipo === "variable" ||
    config.tipo === "dinamica" ||
    config.tipo === "segmentacion";
  let resumen = `<strong>${nombresTipo[config.tipo]}</strong> · SO: ${aKiB(config.memoriaSO)} KiB`;
  if (usaAlgoritmo)
    resumen += ` · Algoritmo: ${nombresAlgoritmo[config.algoritmo]}`;
  if (config.tipo === "dinamica")
    resumen += ` · ${config.compactacion ? "Con compactación automática" : "Sin compactación"}`;
  if (config.tipo === "paginacion")
    resumen += ` · Página: ${aKiB(config.tamPagina)} KiB · ${marcos.length} marcos`;

  const resumenElem = document.getElementById("resumenConfig");
  if (resumenElem) resumenElem.innerHTML = resumen;

  document.getElementById("vistaConfiguracion")?.classList.add("oculto");
  document.getElementById("vistaDashboard")?.classList.remove("oculto");
  renderizarTodo();
}

// volver a la pantalla de configuración sin recargar la página, de modo que
// los programas agregados por el usuario (programasPersonalizados) se conserven
function reiniciarSimulacion() {
  particiones = [];
  marcos = [];
  procesos = [];
  programas = [];
  idParticiones = 0;
  idProcesos = 0;
  idProgramas = 0;
  config = {};

  document.getElementById("vistaDashboard")?.classList.add("oculto");
  document.getElementById("vistaConfiguracion")?.classList.remove("oculto");

  const errorBox = document.getElementById("errorConfig");
  if (errorBox) errorBox.textContent = "";
}

document
  .getElementById("botonReiniciar")
  ?.addEventListener("click", reiniciarSimulacion);

/* 
   Exposición explícita al scope global para listeners de HTML
 */
window.iniciarPrograma = iniciarPrograma;
window.detenerProceso = detenerProceso;
window.eliminarPrograma = eliminarPrograma;

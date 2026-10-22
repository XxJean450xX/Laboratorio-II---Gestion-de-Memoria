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
let procesos = [];
let idParticiones = 0;
let idProcesos = 0;
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
    .getElementById("seccionAlgoritmo")
    ?.classList.toggle("oculto", tipo === "fija");
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
  }

  inicializarSimulacion();
});

/* 
   construir el mapa inicial de particiones
 */
function crearParticionesIniciales() {
  particiones = [];
  idParticiones = 0;
  let base = config.memoriaSO;
  const disponible = MEMORIA_TOTAL - config.memoriaSO;

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

/* 
   procesos precargados
 */
function crearProcesosPrecargados() {
  procesos = [];
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
    agregarProceso(p.nombre, p.codigo, p.datosIni, p.datosNoIni, true),
  );

  // recrear los programas que el usuario agregó en sesiones anteriores
  // (se recalcula memAUsar con la pila/montículo de la config actual)
  programasPersonalizados.forEach((p) =>
    agregarProceso(p.nombre, p.codigo, p.datosIni, p.datosNoIni, false),
  );
}

function agregarProceso(
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
  procesos.push({
    id: ++idProcesos,
    nombre,
    codigo,
    datosIni,
    datosNoIni,
    memInicial,
    memAUsar,
    estado: "detenido",
    particionId: null,
    base: null,
    limite: null,
    precargado,
  });
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
function iniciarProceso(id) {
  const proceso = procesos.find((p) => p.id === id);
  if (!proceso || proceso.estado === "ejecutando") return;

  const candidatas = particiones.filter(
    (p) => p.estado === "libre" && p.tamano >= proceso.memAUsar,
  );
  const elegida = elegirParticionLibre(candidatas);
  if (!elegida) {
    mostrarMensaje("No hay espacio suficiente para " + proceso.nombre + ".");
    return;
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

  proceso.estado = "ejecutando";
  proceso.particionId = elegida.id;
  proceso.base = elegida.base;
  proceso.limite = elegida.base + elegida.tamano - 1;

  renderizarTodo();
}

function detenerProceso(id) {
  const proceso = procesos.find((p) => p.id === id);
  if (!proceso || proceso.estado === "detenido") return;

  const particion = particiones.find((p) => p.id === proceso.particionId);
  if (particion) {
    particion.estado = "libre";
    particion.procesoId = null;
  }

  if (config.tipo === "dinamica") {
    fusionarHuecosAdyacentes();
    if (config.compactacion) compactarMemoria();
  }

  proceso.estado = "detenido";
  proceso.particionId = null;
  proceso.base = null;
  proceso.limite = null;

  renderizarTodo();
}

function eliminarProceso(id) {
  const proceso = procesos.find((p) => p.id === id);
  if (!proceso || proceso.precargado) return;

  // si está ejecutando, liberar primero su partición
  if (proceso.estado === "ejecutando") detenerProceso(id);

  // quitarlo de la lista activa
  procesos = procesos.filter((p) => p.id !== id);

  // quitarlo del almacén persistente para que no reaparezca al reiniciar.
  // se busca por los campos originales en KiB con los que fue creado
  const indice = programasPersonalizados.findIndex(
    (pp) =>
      pp.nombre === proceso.nombre &&
      aBytes(pp.codigo) === proceso.codigo &&
      aBytes(pp.datosIni) === proceso.datosIni &&
      aBytes(pp.datosNoIni) === proceso.datosNoIni,
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
  procesos.forEach((p) => {
    const fila = document.createElement("tr");
    const insignia =
      p.estado === "ejecutando"
        ? '<span class="insignia insignia-ejecutando">Ejecutando</span>'
        : '<span class="insignia insignia-detenido">Detenido</span>';
    const boton =
      p.estado === "ejecutando"
        ? `<button class="boton-pequeno" onclick="detenerProceso(${p.id})">Detener</button>`
        : `<button class="boton-pequeno" onclick="iniciarProceso(${p.id})">Iniciar</button>`;
    // solo los programas agregados por el usuario se pueden eliminar
    const botonEliminar = p.precargado
      ? ""
      : `<button class="boton-pequeno boton-eliminar" onclick="eliminarProceso(${p.id})">Eliminar</button>`;
    fila.innerHTML = `
      <td>${p.nombre}${p.precargado ? '<div class="etiqueta-precargado">precargado</div>' : ""}</td>
      <td>${aKiB(p.codigo)}</td>
      <td>${aKiB(p.datosIni)}</td>
      <td>${aKiB(p.datosNoIni)}</td>
      <td>${aKiB(p.memInicial)}</td>
      <td>${aKiB(p.memAUsar)}</td>
      <td>${insignia}</td>
      <td class="celda-acciones">${boton}${botonEliminar}</td>`;
    cuerpo.appendChild(fila);
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
      const fila = document.createElement("tr");
      fila.innerHTML = `
      <td>P${part.id}</td>
      <td class="direccion">${aHex(part.base)}</td>
      <td class="direccion">${aHex(part.base + part.tamano - 1)}</td>
      <td>${aKiB(part.tamano)} KiB</td>
      <td>${insignia}</td>
      <td>${proceso ? proceso.nombre : "-"}</td>`;
      cuerpo.appendChild(fila);
    });
}

/* 
   render: mapa de memoria vertical
 */
function renderizarMapaMemoria() {
  const contenedor = document.getElementById("mapaMemoria");
  if (!contenedor) return;
  contenedor.innerHTML = "";

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
      const etiqueta = part.estado === "ocupada" ? proceso.nombre : "Libre";
      bloque.innerHTML = `<div class="direcciones"><span>${aHex(part.base)}</span><span>${aHex(part.base + part.tamano - 1)}</span></div><span>${etiqueta}</span>`;
      contenedor.appendChild(bloque);
    });
}

function renderizarTodo() {
  renderizarProcesos();
  renderizarParticiones();
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

    agregarProceso(nombre, codigo, datosIni, datosNoIni, false);
    renderizarProcesos();
    modal?.classList.add("oculto");
  });

/* 
   arranque de la simulación y reinicio
 */
function inicializarSimulacion() {
  crearParticionesIniciales();
  crearProcesosPrecargados();

  const nombresTipo = {
    fija: "Particiones fijas",
    variable: "Particiones variables",
    dinamica: "Particiones dinámicas",
  };
  const nombresAlgoritmo = {
    primer: "Primer ajuste",
    mejor: "Mejor ajuste",
    peor: "Peor ajuste",
  };
  let resumen = `<strong>${nombresTipo[config.tipo]}</strong> · SO: ${aKiB(config.memoriaSO)} KiB`;
  if (config.tipo !== "fija")
    resumen += ` · Algoritmo: ${nombresAlgoritmo[config.algoritmo]}`;
  if (config.tipo === "dinamica")
    resumen += ` · ${config.compactacion ? "Con compactación automática" : "Sin compactación"}`;

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
  procesos = [];
  idParticiones = 0;
  idProcesos = 0;
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
window.iniciarProceso = iniciarProceso;
window.detenerProceso = detenerProceso;
window.eliminarProceso = eliminarProceso;

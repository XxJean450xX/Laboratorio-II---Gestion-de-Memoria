// memoria total 16 MiB = 16384 KiB
    const TOTAL_MEMORY_KIB = 16384;

    // 5 Programas predeterminados con distribución interna de segmentos
    const preconfiguredPrograms = [
      { id: 'P1', name: 'Navegador Web', segments: { text: 512, data: 1024, stack: 512 }, totalSize: 2048, running: false, startAddr: null },
      { id: 'P2', name: 'Editor de Texto', segments: { text: 256, data: 256, stack: 512 }, totalSize: 1024, running: false, startAddr: null },
      { id: 'P3', name: 'Reproductor SQL', segments: { text: 1024, data: 2048, stack: 1024 }, totalSize: 4096, running: false, startAddr: null },
      { id: 'P4', name: 'Antivirus CLI', segments: { text: 128, data: 256, stack: 128 }, totalSize: 512, running: false, startAddr: null },
      { id: 'P5', name: 'IDE Desarrollo', segments: { text: 1024, data: 1536, stack: 512 }, totalSize: 3072, running: false, startAddr: null }
    ];

    let config = {};
    let memoryLayout = [];

    function handleTypeChange() {
      const type = document.getElementById('mem-type').value;
      document.querySelectorAll('.dynamic-field').forEach(el => el.style.display = 'none');
      
      if (type === 'fixed-static') {
        document.getElementById('field-fixed-static').style.display = 'block';
      } else if (type === 'variable-static') {
        document.getElementById('field-variable-static').style.display = 'block';
      } else if (type === 'dynamic') {
        document.getElementById('field-dynamic').style.display = 'block';
      }
    }

    function toHex(kibAddress) {
      // Convierte dirección en KiB a representación Hexadecimal (0x000000 - 0xFFFFFF)
      const bytes = kibAddress * 1024;
      return '0x' + bytes.toString(16).padStart(6, '0').toUpperCase();
    }

    function startSimulation() {
      const type = document.getElementById('mem-type').value;
      const osSize = parseInt(document.getElementById('os-size').value) || 2048;
      const algorithm = document.getElementById('fit-algorithm').value;

      config = { type, osSize, algorithm };

      // Cambiar de Etapa
      document.getElementById('setup-stage').style.display = 'none';
      document.getElementById('simulation-stage').style.display = 'grid';
      document.getElementById('current-mode-label').innerText = `Modo: ${type} | Algoritmo: ${algorithm}`;

      // Inicializar tabla/mapa de particiones con la sección del SO
      initMemoryLayout();
      renderTasks();
      renderSimulationUI();
    }

    function initMemoryLayout() {
      memoryLayout = [];
      let currentAddr = 0;

      // Partición reservada para el Sistema Operativo
      memoryLayout.push({
        id: 'OS',
        startAddr: currentAddr,
        size: config.osSize,
        process: 'Sistema Operativo',
        free: false,
        fragInternal: 0
      });

      currentAddr += config.osSize;
      const userMemory = TOTAL_MEMORY_KIB - config.osSize;

      if (config.type === 'fixed-static') {
        const blockSize = parseInt(document.getElementById('block-size').value) || 2048;
        let count = 1;
        while (currentAddr + blockSize <= TOTAL_MEMORY_KIB) {
          memoryLayout.push({
            id: `Partición ${count++}`,
            startAddr: currentAddr,
            size: blockSize,
            process: null,
            free: true,
            fragInternal: 0
          });
          currentAddr += blockSize;
        }
      } else if (config.type === 'variable-static') {
        const sizesInput = document.getElementById('partition-sizes').value;
        const sizes = sizesInput.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
        
        sizes.forEach((sz, idx) => {
          if (currentAddr + sz <= TOTAL_MEMORY_KIB) {
            memoryLayout.push({
              id: `Partición ${idx + 1}`,
              startAddr: currentAddr,
              size: sz,
              process: null,
              free: true,
              fragInternal: 0
            });
            currentAddr += sz;
          }
        });
      } else if (config.type === 'dynamic') {
        // En dinámicas inicia como un gran bloque libre de memoria del usuario
        memoryLayout.push({
          id: 'Bloque Libre',
          startAddr: currentAddr,
          size: userMemory,
          process: null,
          free: true,
          fragInternal: 0
        });
      }
    }

    // Función auxiliar para actualizar en tiempo real el tamaño total mientras escribes los segmentos
    function calculateTotalProgSize() {
      const text = parseInt(document.getElementById('new-prog-text').value) || 0;
      const data = parseInt(document.getElementById('new-prog-data').value) || 0;
      const heap = parseInt(document.getElementById('new-prog-heap').value) || 0;
      const stack = parseInt(document.getElementById('new-prog-stack').value) || 0;
      
      const total = text + data + heap + stack;
      document.getElementById('preview-total-size').innerText = `${total} KiB`;
    }

    function renderTasks() {
      const container = document.getElementById('task-list');
      container.innerHTML = '';

      preconfiguredPrograms.forEach(prog => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.innerHTML = `
          <div class="task-header">
            <span>${prog.name} (${prog.id})</span>
            <span style="font-size: 0.8rem; color: var(--accent);">${prog.totalSize} KiB</span>
          </div>
          <div class="task-details">
            Code (${prog.segments.text}K) | Data (${prog.segments.data}K) | Heap (${prog.segments.heap || 0}K) | Stack (${prog.segments.stack}K)
          </div>
          <div class="task-actions">
            ${!prog.running 
              ? `<button class="btn-sm btn-start" onclick="launchProgram('${prog.id}')">Ejecutar</button>`
              : `<button class="btn-sm btn-stop" onclick="terminateProgram('${prog.id}')">Finalizar</button>`
            }
          </div>
        `;
        container.appendChild(card);
      });
    }

    function launchProgram(progId) {
      const prog = preconfiguredPrograms.find(p => p.id === progId);
      if (!prog) return;

      // Lógica de asignación según el método y el algoritmo (First, Best, Worst Fit)
      // AQUÍ IMPLEMENTARÁS LOS ALGORITMOS ESPECÍFICOS DE ASIGNACIÓN
      
      alert(`Asignando memoria para ${prog.name}... (Implementar algoritmo de asignación seleccionando en memoryLayout)`);
      
      // Simulación rápida de asignación
      prog.running = true;
      renderTasks();
      renderSimulationUI();
    }

    function terminateProgram(progId) {
      const prog = preconfiguredPrograms.find(p => p.id === progId);
      if (!prog) return;

      prog.running = false;
      // Liberar en memoryLayout
      renderTasks();
      renderSimulationUI();
    }

    function renderSimulationUI() {
      // 1. Renderizar Tabla de Particiones
      const tableBody = document.getElementById('partition-table-body');
      tableBody.innerHTML = '';

      memoryLayout.forEach(part => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${part.id} <br><small style="color: var(--text-muted);">${toHex(part.startAddr)}</small></td>
          <td>${part.size} KiB</td>
          <td>${part.process ? part.process : '---'}</td>
          <td>${part.fragInternal > 0 ? part.fragInternal + ' KiB' : '0 KiB'}</td>
          <td>
            <span class="badge ${part.free ? 'badge-free' : 'badge-busy'}">
              ${part.free ? 'LIBRE' : 'OCUPADO'}
            </span>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      // 2. Renderizar Pila/Mapa Físico de Memoria
      const stackContainer = document.getElementById('memory-stack');
      stackContainer.innerHTML = '';

      memoryLayout.forEach(part => {
        const block = document.createElement('div');
        const heightPercent = (part.size / TOTAL_MEMORY_KIB) * 100;
        
        block.className = `memory-block ${part.id === 'OS' ? 'os' : (part.free ? 'free' : 'allocated')}`;
        block.style.height = `${Math.max(heightPercent, 5)}%`; // altura visual proporcional
        
        block.innerHTML = `
          <div>
            <strong>${part.id}</strong> - ${part.process ? part.process : 'Vacío'} (${part.size} KiB)
          </div>
          <div class="hex-addr">${toHex(part.startAddr)}</div>
        `;
        stackContainer.appendChild(block);
      });
    }

    function launchProgram(progId) {
  const prog = preconfiguredPrograms.find(p => p.id === progId);
  if (!prog) return;

  const algorithm = config.algorithm; // 'first-fit', 'best-fit', 'worst-fit'
  let targetPartition = null;

  // 1. Filtrar bloques libres que tengan espacio suficiente para el programa
  const freeBlocks = memoryLayout.filter(part => part.free && part.size >= prog.totalSize);

  if (freeBlocks.length === 0) {
    alert(`No hay suficiente memoria libre (o partición adecuada) para ejecutar ${prog.name}.`);
    return;
  }

  // 2. Aplicar el algoritmo de ajuste seleccionado
  if (algorithm === 'first-fit') {
    // El primero que encuentra
    targetPartition = freeBlocks[0];
  } 
  else if (algorithm === 'best-fit') {
    // El que tenga el tamaño más cercano (menor desperdicio)
    targetPartition = freeBlocks.reduce((prev, curr) => (curr.size < prev.size) ? curr : prev);
  } 
  else if (algorithm === 'worst-fit') {
    // El que tenga el mayor tamaño disponible
    targetPartition = freeBlocks.reduce((prev, curr) => (curr.size > prev.size) ? curr : prev);
  }

  // 3. Asignar el programa a la partición encontrada
  if (targetPartition) {
    targetPartition.free = false;
    targetPartition.process = `${prog.name} (${prog.id})`;
    
    // Calcular fragmentación interna (si sobra espacio en la partición fija)
    if (config.type === 'fixed-static' || config.type === 'variable-static') {
      targetPartition.fragInternal = targetPartition.size - prog.totalSize;
    } else {
      targetPartition.fragInternal = 0;
      // Nota: Si estás en modo dinámico puro, aquí podrías subdividir el bloque libre restante, 
      // pero para empezar, marcar el bloque como ocupado actualizará tu interfaz visualmente.
    }

    prog.running = true;
    renderTasks();
    renderSimulationUI();
  }
}

function terminateProgram(progId) {
  const prog = preconfiguredPrograms.find(p => p.id === progId);
  if (!prog) return;

  // Buscar la partición que contiene este programa y liberarla
  memoryLayout.forEach(part => {
    if (part.process && part.process.includes(`(${prog.id})`)) {
      part.free = true;
      part.process = null;
      part.fragInternal = 0;
    }
  });

  prog.running = false;
  renderTasks();
  renderSimulationUI();
}

function addNewProgram() {
      const nameInput = document.getElementById('new-prog-name');
      const textInput = document.getElementById('new-prog-text');
      const dataInput = document.getElementById('new-prog-data');
      const heapInput = document.getElementById('new-prog-heap');
      const stackInput = document.getElementById('new-prog-stack');

      const name = nameInput.value.trim();
      const text = parseInt(textInput.value) || 0;
      const data = parseInt(dataInput.value) || 0;
      const heap = parseInt(heapInput.value) || 0;
      const stack = parseInt(stackInput.value) || 0;

      const totalSize = text + data + heap + stack;

      // Validaciones robustas
      if (!name) {
        alert('Por favor, ingresa un nombre para el programa.');
        return;
      }
      if (totalSize <= 0) {
        alert('El programa debe tener al menos una sección con tamaño mayor a 0 KiB.');
        return;
      }

      // Generar ID consecutivo
      const newId = `P${preconfiguredPrograms.length + 1}`;

      // Crear el nuevo objeto estructurado con las secciones solicitadas por el profe
      const newProgram = {
        id: newId,
        name: name,
        segments: { 
          text: text, 
          data: data, 
          heap: heap, 
          stack: stack 
        },
        totalSize: totalSize,
        running: false,
        startAddr: null
      };

      // Añadir al arreglo de programas
      preconfiguredPrograms.push(newProgram);

      // Limpiar campos del formulario y previsualización
      nameInput.value = '';
      textInput.value = '';
      dataInput.value = '';
      heapInput.value = '';
      stackInput.value = '';
      document.getElementById('preview-total-size').innerText = '0 KiB';

      // Actualizar interfaz
      renderTasks();
    }

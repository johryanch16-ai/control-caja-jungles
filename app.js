/**
 * SISTEMA DE CONTROL DE CAJA MULTI-SEDE - JUNGLES & LA CHICHERA
 * Lógica reactiva para ingresos, datáfonos con 13% IVA, créditos, pagos y consolidado.
 */

// ==========================================
// CONFIGURACIÓN Y ESTADO INICIAL
// ==========================================
const STORAGE_KEY = 'control_caja_bares_db_v2';

function getCleanDraft() {
  return {
    efectivo: 0,
    datafono1: 0,
    datafono2: 0,
    sinpes: [],
    creditos: [],
    servicioPct: 10,
    servicioMontoManual: null,
    empleados: [],
    notas: ''
  };
}

const VENUES = {
  jungles: {
    id: 'jungles',
    name: 'Jungles Bar',
    subtitle: 'Sede 1 &middot; Bar Tropical',
    logo: 'assets/jungles_logo.jpg',
    themeClass: 'theme-jungles',
    currency: '₡'
  },
  chichera: {
    id: 'chichera',
    name: 'La Chichera',
    subtitle: 'Sede 2 &middot; By Flubers',
    logo: 'assets/chichera_logo.jpg',
    themeClass: 'theme-chichera',
    currency: '₡'
  },
  consolidado: {
    id: 'consolidado',
    name: 'Consolidado de Negocios',
    subtitle: 'Resumen Financiero Global',
    logo: 'assets/jungles_logo.jpg',
    themeClass: 'theme-consolidado',
    currency: '₡'
  },
  recibos: {
    id: 'recibos',
    name: 'Registro de Recibos',
    subtitle: 'Historial de Cierres Diarios',
    logo: 'assets/jungles_logo.jpg',
    themeClass: 'theme-consolidado',
    currency: '₡'
  }
};

// Estado global de la aplicación (inicia completamente en 0)
const AppState = {
  currentVenue: 'jungles', // 'jungles' | 'chichera' | 'consolidado'
  selectedDate: new Date().toISOString().split('T')[0],
  
  // Borradores activos en memoria en ₡0
  drafts: {
    jungles: getCleanDraft(),
    chichera: getCleanDraft()
  },

  // Base de datos de cierres históricos (vacía para producción)
  closures: []
};

// ==========================================
// FORMATEO DE MONEDA Y NÚMEROS
// ==========================================
function formatCurrency(amount) {
  const val = Number(amount) || 0;
  return '₡' + Math.round(val).toLocaleString('es-CR');
}

function parseCurrencyInput(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  return dateStr;
}

// ==========================================
// PERSISTENCIA EN LOCALSTORAGE (ESTADO LIMPIO EN 0)
// ==========================================
function initCleanState() {
  AppState.closures = [];
  AppState.drafts = {
    jungles: getCleanDraft(),
    chichera: getCleanDraft()
  };
  saveToStorage();
}

function loadFromStorage() {
  try {
    // Si quedan rastros de versiones previas con datos demo, limpiarlos
    if (localStorage.getItem('control_caja_bares_db_v1')) {
      localStorage.removeItem('control_caja_bares_db_v1');
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Filtrar posibles residuos de datos de demostración si existieran
      const cleanClosures = (parsed.closures || []).filter(c => 
        !c.id.startsWith('j_20') && !c.id.startsWith('c_20') && !c.id.startsWith('cl_seed')
      );
      AppState.closures = cleanClosures;
      if (parsed.drafts) {
        AppState.drafts = {
          jungles: { ...getCleanDraft(), ...parsed.drafts.jungles },
          chichera: { ...getCleanDraft(), ...parsed.drafts.chichera }
        };
      }
    } else {
      initCleanState();
    }
  } catch (err) {
    console.error('Error al cargar localStorage:', err);
    initCleanState();
  }
}

function saveToStorage() {
  try {
    const dataToSave = {
      closures: AppState.closures,
      drafts: AppState.drafts,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch (err) {
    console.error('Error guardando en localStorage:', err);
  }
}

function seedInitialSampleData() {
  // En producción no se inyectan datos de demostración, el sistema se mantiene en 0
  initCleanState();
}

// ==========================================
// CÁLCULOS MATEMÁTICOS DEL FORMULARIO DE CAJA
// ==========================================
function calculateVenueTotals(venueId) {
  const draft = AppState.drafts[venueId];
  if (!draft) return null;

  const efectivo = Number(draft.efectivo) || 0;
  const d1 = Number(draft.datafono1) || 0;
  const d2 = Number(draft.datafono2) || 0;
  
  // Datáfonos con rebajo del 13% (menos el 13%)
  const subtotalDatafonos = d1 + d2;
  const ivaDatafonos = subtotalDatafonos * 0.13;
  const totalDatafonos = subtotalDatafonos - ivaDatafonos; // (d1 + d2) - 13%

  // SINPE Móvil / Transferencias
  const sinpes = Array.isArray(draft.sinpes) ? draft.sinpes : [];
  const totalSinpes = sinpes.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // Créditos / Fiados
  const creditos = Array.isArray(draft.creditos) ? draft.creditos : [];
  const totalCreditos = creditos.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // Total Ventas del Día = Efectivo + Total Datáfonos (-13%) + Total SINPE + Total Créditos
  const totalVentas = efectivo + totalDatafonos + totalSinpes + totalCreditos;

  // 10% de Servicio / Ley
  const servicioPct = Number(draft.servicioPct) !== undefined ? Number(draft.servicioPct) : 10;
  const servicioProyectado = totalVentas * (servicioPct / 100);
  
  // Monto de servicio final (puede ser sobreescrito manualmente)
  const servicioMontoFinal = draft.servicioMontoManual !== null ? Number(draft.servicioMontoManual) : servicioProyectado;

  // Pagos a Empleados
  const empleados = Array.isArray(draft.empleados) ? draft.empleados : [];
  const totalEmpleados = empleados.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // Total Efectivo en Caja = Efectivo - Total Empleados
  const efectivoNeto = efectivo - totalEmpleados;

  // Total Final Neto = Total Ventas del Día - Total Pagado a Empleados
  const balanceNeto = totalVentas - totalEmpleados;

  return {
    efectivo,
    datafono1: d1,
    datafono2: d2,
    subtotalDatafonos,
    ivaDatafonos,
    totalDatafonos,
    sinpes,
    totalSinpes,
    creditos,
    totalCreditos,
    totalVentas,
    servicioPct,
    servicioProyectado,
    servicioMontoFinal,
    empleados,
    totalEmpleados,
    efectivoNeto,
    balanceNeto
  };
}

// ==========================================
// RENDERIZADO Y ACTUALIZACIÓN DE LA UI
// ==========================================
function updateVenueThemeUI() {
  const venue = VENUES[AppState.currentVenue];
  const body = document.getElementById('app-body');
  const headerLogo = document.getElementById('header-brand-logo');
  const headerTitle = document.getElementById('header-title');
  const venueChip = document.getElementById('venue-chip');
  const venueChipText = document.getElementById('venue-chip-text');

  // Quitar clases previas
  body.classList.remove('theme-jungles', 'theme-chichera', 'theme-consolidado');
  body.classList.add(venue.themeClass);

  // Tabs de navegación activa
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.venue === AppState.currentVenue);
  });

  // Mostrar/ocultar secciones
  const sectionCash = document.getElementById('section-venue-cash');
  const sectionConsolidado = document.getElementById('section-consolidado');
  const sectionRecibos = document.getElementById('section-recibos');

  if (AppState.currentVenue === 'consolidado') {
    sectionCash.style.display = 'none';
    sectionConsolidado.style.display = 'block';
    if (sectionRecibos) sectionRecibos.style.display = 'none';
    headerTitle.textContent = 'Consolidado';
    headerLogo.src = 'assets/jungles_logo.jpg';
    renderConsolidadoView();
  } else if (AppState.currentVenue === 'recibos') {
    sectionCash.style.display = 'none';
    sectionConsolidado.style.display = 'none';
    if (sectionRecibos) sectionRecibos.style.display = 'block';
    headerTitle.textContent = 'Registro de Recibos';
    headerLogo.src = 'assets/jungles_logo.jpg';
    renderRecibosView();
  } else {
    sectionCash.style.display = 'block';
    sectionConsolidado.style.display = 'none';
    if (sectionRecibos) sectionRecibos.style.display = 'none';
    headerTitle.textContent = venue.name;
    headerLogo.src = venue.logo;
    if (venueChipText) {
      venueChipText.textContent = `Sede Activa: ${venue.name}`;
    }
    populateFormWithDraft(AppState.currentVenue);
  }

  updateHeaderBadges();
}

// Rellenar los inputs y tablas con el borrador activo
function populateFormWithDraft(venueId) {
  const draft = AppState.drafts[venueId];
  if (!draft) return;

  const inputEfectivo = document.getElementById('input-efectivo');
  const inputD1 = document.getElementById('input-datafono-1');
  const inputD2 = document.getElementById('input-datafono-2');
  const inputServicioPct = document.getElementById('input-servicio-pct');
  const inputServicioMonto = document.getElementById('input-servicio-monto');
  const inputNotes = document.getElementById('input-closure-notes');

  inputEfectivo.value = draft.efectivo ? draft.efectivo : '';
  inputD1.value = draft.datafono1 ? draft.datafono1 : '';
  inputD2.value = draft.datafono2 ? draft.datafono2 : '';
  inputServicioPct.value = draft.servicioPct || 10;
  
  if (draft.servicioMontoManual !== null) {
    inputServicioMonto.value = draft.servicioMontoManual;
    document.getElementById('badge-service-status').textContent = 'Manual';
    document.getElementById('badge-service-status').style.borderColor = 'var(--color-amber)';
  } else {
    inputServicioMonto.value = '';
    document.getElementById('badge-service-status').textContent = 'Automático';
    document.getElementById('badge-service-status').style.borderColor = 'var(--accent-primary)';
  }

  inputNotes.value = draft.notas || '';

  renderSinpesRows();
  renderCreditosRows();
  renderEmpleadosRows();
  recalculateAndRenderForm();
}

// Recalcular y actualizar todas las etiquetas de la vista de caja
function recalculateAndRenderForm() {
  if (AppState.currentVenue === 'consolidado') return;

  const totals = calculateVenueTotals(AppState.currentVenue);
  if (!totals) return;

  // Datáfonos
  document.getElementById('display-subtotal-datafonos').textContent = formatCurrency(totals.subtotalDatafonos);
  document.getElementById('display-iva-datafonos').textContent = '-' + formatCurrency(totals.ivaDatafonos);
  document.getElementById('display-total-datafonos').textContent = formatCurrency(totals.totalDatafonos);

  // SINPE Móvil
  const currentSinpes = AppState.drafts[AppState.currentVenue].sinpes || [];
  const elTotalSinpes = document.getElementById('display-total-sinpes');
  if (elTotalSinpes) elTotalSinpes.textContent = formatCurrency(totals.totalSinpes);
  const elBadgeSinpes = document.getElementById('badge-count-sinpes');
  if (elBadgeSinpes) elBadgeSinpes.textContent = `${currentSinpes.length} pagos`;

  // Créditos
  document.getElementById('display-total-creditos').textContent = formatCurrency(totals.totalCreditos);
  document.getElementById('badge-count-creditos').textContent = `${AppState.drafts[AppState.currentVenue].creditos.length} cuentas`;

  // Ventas del Día
  document.getElementById('display-total-ventas').textContent = formatCurrency(totals.totalVentas);

  // Servicio
  document.getElementById('display-servicio-proyectado').textContent = formatCurrency(totals.servicioProyectado);
  const inputServicioMonto = document.getElementById('input-servicio-monto');
  if (AppState.drafts[AppState.currentVenue].servicioMontoManual === null) {
    inputServicioMonto.placeholder = Math.round(totals.servicioProyectado);
  }

  // Empleados
  document.getElementById('display-total-empleados').textContent = formatCurrency(totals.totalEmpleados);
  document.getElementById('badge-count-empleados').textContent = `${AppState.drafts[AppState.currentVenue].empleados.length} pagos`;

  // Total Efectivo en Caja (Efectivo menos Empleados)
  const elEfectivoNeto = document.getElementById('display-efectivo-neto');
  if (elEfectivoNeto) elEfectivoNeto.textContent = formatCurrency(totals.efectivoNeto);
  const elSummaryEfectivoNeto = document.getElementById('summary-efectivo-neto');
  if (elSummaryEfectivoNeto) elSummaryEfectivoNeto.textContent = formatCurrency(totals.efectivoNeto);

  // Balance Final Diario
  document.getElementById('summary-ventas').textContent = formatCurrency(totals.totalVentas);
  document.getElementById('summary-empleados').textContent = '-' + formatCurrency(totals.totalEmpleados);
  document.getElementById('summary-servicio').textContent = formatCurrency(totals.servicioMontoFinal);
  document.getElementById('summary-total-neto').textContent = formatCurrency(totals.balanceNeto);

  updateHeaderBadges();
  saveToStorage();
}

// Actualizar badges con las ventas proyectadas de hoy en el menú superior
function updateHeaderBadges() {
  const jTotals = calculateVenueTotals('jungles');
  const cTotals = calculateVenueTotals('chichera');

  const badgeJ = document.getElementById('badge-sales-jungles');
  const badgeC = document.getElementById('badge-sales-chichera');

  if (badgeJ) badgeJ.textContent = formatCurrency(jTotals.totalVentas);
  if (badgeC) badgeC.textContent = formatCurrency(cTotals.totalVentas);

  const badgeRecibos = document.getElementById('badge-count-total-recibos');
  if (badgeRecibos) {
    badgeRecibos.textContent = AppState.closures ? AppState.closures.length : 0;
  }
}

// ==========================================
// MANEJO DE FILAS DINÁMICAS (SINPE, CRÉDITOS & EMPLEADOS)
// ==========================================
function renderSinpesRows() {
  const container = document.getElementById('sinpes-container');
  if (!container) return;
  const draft = AppState.drafts[AppState.currentVenue];
  if (!draft.sinpes) draft.sinpes = [];
  const sinpes = draft.sinpes;

  if (sinpes.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" id="empty-sinpes">
        <p>No hay transferencias de SINPE Móvil registradas hoy.</p>
        <button type="button" class="btn btn-add-action btn-sm" id="btn-add-sinpe-empty" style="margin-top: 10px;">
          <span class="add-icon-badge">➕</span>
          <span>Registrar Primer SINPE</span>
        </button>
      </div>
    `;
    const btnEmpty = document.getElementById('btn-add-sinpe-empty');
    if (btnEmpty) btnEmpty.addEventListener('click', addSinpeRow);
    return;
  }

  container.innerHTML = '';
  sinpes.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text input-sinpe-name" placeholder="Cliente / Ref / Teléfono" value="${item.name || ''}" data-index="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency input-sinpe-amount" placeholder="0" value="${item.amount || ''}" min="0" step="100" data-index="${index}" inputmode="numeric">
      </div>
      <button type="button" class="btn-delete-row" title="Eliminar fila" data-index="${index}" aria-label="Eliminar SINPE">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Eventos de inputs
    row.querySelector('.input-sinpe-name').addEventListener('input', (e) => {
      sinpes[index].name = e.target.value;
      saveToStorage();
    });

    row.querySelector('.input-sinpe-amount').addEventListener('input', (e) => {
      sinpes[index].amount = parseCurrencyInput(e.target.value);
      recalculateAndRenderForm();
    });

    row.querySelector('.btn-delete-row').addEventListener('click', () => {
      sinpes.splice(index, 1);
      renderSinpesRows();
      recalculateAndRenderForm();
    });

    container.appendChild(row);
  });
}

function addSinpeRow() {
  const draft = AppState.drafts[AppState.currentVenue];
  if (!draft.sinpes) draft.sinpes = [];
  draft.sinpes.push({
    id: 'sn_' + Date.now(),
    name: '',
    amount: 0
  });
  renderSinpesRows();
  recalculateAndRenderForm();
  
  setTimeout(() => {
    const names = document.querySelectorAll('.input-sinpe-name');
    if (names.length) names[names.length - 1].focus();
  }, 50);
}

function renderCreditosRows() {
  const container = document.getElementById('creditos-container');
  const creditos = AppState.drafts[AppState.currentVenue].creditos;

  if (!creditos || creditos.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" id="empty-creditos">
        <p>No hay créditos o cuentas fiadas registradas hoy.</p>
        <button type="button" class="btn btn-add-action btn-sm" id="btn-add-credito-empty" style="margin-top: 10px;">
          <span class="add-icon-badge">➕</span>
          <span>Registrar Primer Cliente Fiado</span>
        </button>
      </div>
    `;
    const btnEmpty = document.getElementById('btn-add-credito-empty');
    if (btnEmpty) btnEmpty.addEventListener('click', addCreditoRow);
    return;
  }

  container.innerHTML = '';
  creditos.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text input-credito-name" placeholder="Nombre del cliente" value="${item.name || ''}" data-index="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency input-credito-amount" placeholder="0" value="${item.amount || ''}" min="0" step="100" data-index="${index}" inputmode="numeric">
      </div>
      <button type="button" class="btn-delete-row" title="Eliminar fila" data-index="${index}" aria-label="Eliminar cliente">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Eventos de inputs
    row.querySelector('.input-credito-name').addEventListener('input', (e) => {
      creditos[index].name = e.target.value;
      saveToStorage();
    });

    row.querySelector('.input-credito-amount').addEventListener('input', (e) => {
      creditos[index].amount = parseCurrencyInput(e.target.value);
      recalculateAndRenderForm();
    });

    row.querySelector('.btn-delete-row').addEventListener('click', () => {
      creditos.splice(index, 1);
      renderCreditosRows();
      recalculateAndRenderForm();
    });

    container.appendChild(row);
  });
}

function addCreditoRow() {
  const creditos = AppState.drafts[AppState.currentVenue].creditos;
  creditos.push({
    id: 'cr_' + Date.now(),
    name: '',
    amount: 0
  });
  renderCreditosRows();
  recalculateAndRenderForm();
  
  // Dar foco al nuevo input
  setTimeout(() => {
    const names = document.querySelectorAll('.input-credito-name');
    if (names.length) names[names.length - 1].focus();
  }, 50);
}

function renderEmpleadosRows() {
  const container = document.getElementById('empleados-container');
  const empleados = AppState.drafts[AppState.currentVenue].empleados;

  if (!empleados || empleados.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" id="empty-empleados">
        <p>No hay pagos a empleados registrados hoy.</p>
        <button type="button" class="btn btn-add-action btn-sm" id="btn-add-empleado-empty" style="margin-top: 10px;">
          <span class="add-icon-badge">➕</span>
          <span>Registrar Primer Pago de Personal</span>
        </button>
      </div>
    `;
    const btnEmpty = document.getElementById('btn-add-empleado-empty');
    if (btnEmpty) btnEmpty.addEventListener('click', addEmpleadoRow);
    return;
  }

  container.innerHTML = '';
  empleados.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text input-empleado-name" placeholder="Nombre / Puesto (ej. Bartender)" value="${item.name || ''}" data-index="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency input-empleado-amount" placeholder="0" value="${item.amount || ''}" min="0" step="100" data-index="${index}" inputmode="numeric">
      </div>
      <button type="button" class="btn-delete-row" title="Eliminar fila" data-index="${index}" aria-label="Eliminar pago">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    row.querySelector('.input-empleado-name').addEventListener('input', (e) => {
      empleados[index].name = e.target.value;
      saveToStorage();
    });

    row.querySelector('.input-empleado-amount').addEventListener('input', (e) => {
      empleados[index].amount = parseCurrencyInput(e.target.value);
      recalculateAndRenderForm();
    });

    row.querySelector('.btn-delete-row').addEventListener('click', () => {
      empleados.splice(index, 1);
      renderEmpleadosRows();
      recalculateAndRenderForm();
    });

    container.appendChild(row);
  });
}

function addEmpleadoRow() {
  const empleados = AppState.drafts[AppState.currentVenue].empleados;
  empleados.push({
    id: 'em_' + Date.now(),
    name: '',
    amount: 0
  });
  renderEmpleadosRows();
  recalculateAndRenderForm();

  setTimeout(() => {
    const names = document.querySelectorAll('.input-empleado-name');
    if (names.length) names[names.length - 1].focus();
  }, 50);
}

// ==========================================
// CIERRE Y GUARDADO DE CAJA DIARIA
// ==========================================
function saveDailyClosure() {
  const venueId = AppState.currentVenue;
  const totals = calculateVenueTotals(venueId);
  if (!totals) return;

  if (totals.totalVentas === 0 && totals.totalEmpleados === 0) {
    if (!confirm('Los valores de caja están en ₡0. ¿Deseas guardar el cierre de todas formas?')) {
      return;
    }
  }

  const inputDate = document.getElementById('input-closure-date').value || AppState.selectedDate;
  const notes = document.getElementById('input-closure-notes').value.trim();
  const draft = AppState.drafts[venueId];

  const closureRecord = {
    id: `${venueId}_${inputDate}_${Date.now()}`,
    date: inputDate,
    venue: venueId,
    venueName: VENUES[venueId].name,
    efectivo: totals.efectivo,
    datafono1: totals.datafono1,
    datafono2: totals.datafono2,
    subtotalDatafonos: totals.subtotalDatafonos,
    ivaDatafonos: totals.ivaDatafonos,
    totalDatafonos: totals.totalDatafonos,
    sinpes: JSON.parse(JSON.stringify(draft.sinpes || [])),
    totalSinpes: totals.totalSinpes,
    creditos: JSON.parse(JSON.stringify(draft.creditos)),
    totalCreditos: totals.totalCreditos,
    totalVentas: totals.totalVentas,
    servicioPct: totals.servicioPct,
    servicioMonto: totals.servicioMontoFinal,
    empleados: JSON.parse(JSON.stringify(draft.empleados)),
    totalEmpleados: totals.totalEmpleados,
    efectivoNeto: totals.efectivoNeto,
    balanceNeto: totals.balanceNeto,
    notas: notes,
    timestamp: new Date().toISOString()
  };

  // Reemplazar o insertar registro
  const existingIdx = AppState.closures.findIndex(c => c.date === inputDate && c.venue === venueId);
  if (existingIdx >= 0) {
    AppState.closures[existingIdx] = closureRecord;
  } else {
    AppState.closures.unshift(closureRecord);
  }

  saveToStorage();
  showToast(`¡Cierre de ${VENUES[venueId].name} guardado con éxito!`);

  // Sincronizar automáticamente en la nube si Supabase está conectado
  if (typeof SupabaseService !== 'undefined' && SupabaseService.isConfigured()) {
    SupabaseService.saveClosure(closureRecord).then(success => {
      if (success) showToast('☁️ Cierre sincronizado con Supabase');
    });
  }

  // Abrir ticket comprobante
  showReceiptModal(closureRecord);
}

// ==========================================
// VISTA 3: PANEL CONSOLIDADO DE NEGOCIOS
// ==========================================
let currentConsolidadoFilter = 'hoy'; // 'hoy' | 'semana' | 'mes' | 'todo'

function renderConsolidadoView() {
  const periodPillBadge = document.getElementById('consolidado-period-badge');
  const periodTextMap = {
    hoy: 'Período: Hoy',
    semana: 'Período: Esta Semana',
    mes: 'Período: Este Mes',
    todo: 'Período: Todo el Historial'
  };
  if (periodPillBadge) {
    periodPillBadge.textContent = periodTextMap[currentConsolidadoFilter] || 'Período Seleccionado';
  }

  // Filtrar registros según período
  const todayStr = AppState.selectedDate;
  const today = new Date(todayStr);

  const getWeekStart = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Lunes
    return new Date(date.setDate(diff));
  };

  const weekStart = getWeekStart(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Incluir borradores actuales en las ventas de "Hoy"
  const jTodayTotals = calculateVenueTotals('jungles');
  const cTodayTotals = calculateVenueTotals('chichera');

  // Métricas de Jungles
  let jVentasDia = jTodayTotals.totalVentas;
  let jVentasSemana = jTodayTotals.totalVentas;
  let jVentasMes = jTodayTotals.totalVentas;
  let jEmpleadosPeriodo = 0;
  let jNetoPeriodo = 0;

  // Métricas de La Chichera
  let cVentasDia = cTodayTotals.totalVentas;
  let cVentasSemana = cTodayTotals.totalVentas;
  let cVentasMes = cTodayTotals.totalVentas;
  let cEmpleadosPeriodo = 0;
  let cNetoPeriodo = 0;

  // Iterar cierres históricos guardados
  AppState.closures.forEach(c => {
    const cDate = new Date(c.date + 'T00:00:00');
    const isToday = c.date === todayStr;
    const isThisWeek = cDate >= weekStart && cDate <= today;
    const isThisMonth = cDate >= monthStart && cDate <= today;

    if (c.venue === 'jungles') {
      if (isThisWeek && !isToday) jVentasSemana += c.totalVentas;
      if (isThisMonth && !isToday) jVentasMes += c.totalVentas;
      
      // Aplicar filtro activo para totales del período
      if (
        (currentConsolidadoFilter === 'hoy' && isToday) ||
        (currentConsolidadoFilter === 'semana' && isThisWeek) ||
        (currentConsolidadoFilter === 'mes' && isThisMonth) ||
        (currentConsolidadoFilter === 'todo')
      ) {
        jEmpleadosPeriodo += c.totalEmpleados;
      }
    }

    if (c.venue === 'chichera') {
      if (isThisWeek && !isToday) cVentasSemana += c.totalVentas;
      if (isThisMonth && !isToday) cVentasMes += c.totalVentas;

      if (
        (currentConsolidadoFilter === 'hoy' && isToday) ||
        (currentConsolidadoFilter === 'semana' && isThisWeek) ||
        (currentConsolidadoFilter === 'mes' && isThisMonth) ||
        (currentConsolidadoFilter === 'todo')
      ) {
        cEmpleadosPeriodo += c.totalEmpleados;
      }
    }
  });

  // Si hoy no hay cierres guardados aún, sumar el borrador en empleados del período
  if (currentConsolidadoFilter === 'hoy') {
    jEmpleadosPeriodo = jTodayTotals.totalEmpleados;
    cEmpleadosPeriodo = cTodayTotals.totalEmpleados;
  }

  // Totales de Ventas según filtro para el Gran Total
  let jFilterVentas = jVentasDia;
  let cFilterVentas = cVentasDia;

  if (currentConsolidadoFilter === 'semana') {
    jFilterVentas = jVentasSemana;
    cFilterVentas = cVentasSemana;
  } else if (currentConsolidadoFilter === 'mes') {
    jFilterVentas = jVentasMes;
    cFilterVentas = cVentasMes;
  } else if (currentConsolidadoFilter === 'todo') {
    jFilterVentas = AppState.closures.filter(c => c.venue === 'jungles').reduce((acc, c) => acc + c.totalVentas, 0) + jTodayTotals.totalVentas;
    cFilterVentas = AppState.closures.filter(c => c.venue === 'chichera').reduce((acc, c) => acc + c.totalVentas, 0) + cTodayTotals.totalVentas;
  }

  jNetoPeriodo = jFilterVentas - jEmpleadosPeriodo;
  cNetoPeriodo = cFilterVentas - cEmpleadosPeriodo;

  const grandTotalVentas = jFilterVentas + cFilterVentas;
  const grandTotalEmpleados = jEmpleadosPeriodo + cEmpleadosPeriodo;
  const grandTotalNeto = grandTotalVentas - grandTotalEmpleados;

  // Actualizar Gran Total Card
  document.getElementById('grand-total-ventas').textContent = formatCurrency(grandTotalVentas);
  document.getElementById('grand-jungles-ventas').textContent = formatCurrency(jFilterVentas);
  document.getElementById('grand-chichera-ventas').textContent = formatCurrency(cFilterVentas);
  document.getElementById('grand-total-empleados').textContent = '-' + formatCurrency(grandTotalEmpleados);
  document.getElementById('grand-total-neto').textContent = formatCurrency(grandTotalNeto);

  // Barra de participación porcentual
  const jShare = grandTotalVentas > 0 ? Math.round((jFilterVentas / grandTotalVentas) * 100) : 50;
  const cShare = 100 - jShare;

  document.getElementById('label-share-jungles').textContent = `🌴 Jungles: ${jShare}% (${formatCurrency(jFilterVentas)})`;
  document.getElementById('label-share-chichera').textContent = `🍺 La Chichera: ${cShare}% (${formatCurrency(cFilterVentas)})`;
  document.getElementById('fill-share-jungles').style.width = `${jShare}%`;
  document.getElementById('fill-share-chichera').style.width = `${cShare}%`;

  // Desglose de Jungles
  document.getElementById('j-metric-dia').textContent = formatCurrency(jVentasDia);
  document.getElementById('j-metric-semana').textContent = formatCurrency(jVentasSemana);
  document.getElementById('j-metric-mes').textContent = formatCurrency(jVentasMes);
  document.getElementById('j-metric-empleados').textContent = '-' + formatCurrency(jEmpleadosPeriodo);
  document.getElementById('j-metric-neto').textContent = formatCurrency(jNetoPeriodo);

  // Desglose de La Chichera
  document.getElementById('c-metric-dia').textContent = formatCurrency(cVentasDia);
  document.getElementById('c-metric-semana').textContent = formatCurrency(cVentasSemana);
  document.getElementById('c-metric-mes').textContent = formatCurrency(cVentasMes);
  document.getElementById('c-metric-empleados').textContent = '-' + formatCurrency(cEmpleadosPeriodo);
  document.getElementById('c-metric-neto').textContent = formatCurrency(cNetoPeriodo);

  renderHistoryTable();
}

// Helper: Formato de fecha día/mes/año (DD/MM/AAAA)
function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return dateStr;
}

// Renderizado del Historial de Cierres (Dual: Tabla para escritorio y Acordeón Táctil para celular)
function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  const mobileAccordion = document.getElementById('history-mobile-accordion');
  const venueFilter = document.getElementById('select-history-venue') ? document.getElementById('select-history-venue').value : 'all';

  let filtered = AppState.closures || [];
  if (venueFilter !== 'all') {
    filtered = filtered.filter(c => c.venue === venueFilter);
  }

  if (filtered.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay registros de cierre en el historial para la selección.</td></tr>`;
    }
    if (mobileAccordion) {
      mobileAccordion.innerHTML = `
        <div class="empty-state-card" style="text-align: center; padding: 24px 16px;">
          <p style="color: var(--text-secondary); margin-bottom: 8px;">No hay registros de cierre en el historial para esta sede.</p>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Los cierres guardados aparecerán aquí adaptados a tu pantalla.</span>
        </div>
      `;
    }
    return;
  }

  // 1. RENDERIZAR TABLA DE ESCRITORIO
  if (tbody) {
    tbody.innerHTML = '';
    filtered.forEach(c => {
      const dmyDate = formatDateDMY(c.date);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${dmyDate}</strong></td>
        <td>
          <span class="tag-venue ${c.venue}">${c.venue === 'jungles' ? '🌴 Jungles' : '🍺 La Chichera'}</span>
        </td>
        <td>${formatCurrency(c.efectivo)}</td>
        <td>${formatCurrency(c.totalDatafonos)}</td>
        <td>${formatCurrency(c.totalSinpes || 0)}</td>
        <td>${formatCurrency(c.totalCreditos)}</td>
        <td><strong class="text-primary">${formatCurrency(c.totalVentas)}</strong></td>
        <td class="text-rose">-${formatCurrency(c.totalEmpleados)}</td>
        <td class="text-emerald"><strong>${formatCurrency((c.efectivo || 0) - (c.totalEmpleados || 0))}</strong></td>
        <td><strong class="text-cyan">${formatCurrency(c.balanceNeto)}</strong></td>
        <td>
          <div class="action-btns-cell">
            <button type="button" class="btn-table-action edit-btn" data-id="${c.id}" title="Editar Cierre">✏️</button>
            <button type="button" class="btn-table-action view-btn" data-id="${c.id}" title="Ver Comprobante">🧾</button>
            <button type="button" class="btn-table-action delete" data-id="${c.id}" title="Eliminar Cierre">🗑️</button>
          </div>
        </td>
      `;

      tr.querySelector('.edit-btn').addEventListener('click', () => {
        openEditReceiptModal(c);
      });

      tr.querySelector('.view-btn').addEventListener('click', () => {
        showReceiptModal(c);
      });

      tr.querySelector('.delete').addEventListener('click', () => {
        if (confirm(`¿Estás seguro de eliminar el cierre del ${dmyDate} (${c.venueName})?`)) {
          AppState.closures = AppState.closures.filter(item => item.id !== c.id);
          saveToStorage();
          renderConsolidadoView();
          renderHistoryTable();
          renderRecibosSection();
          showToast('Cierre eliminado correctamente');
        }
      });

      tbody.appendChild(tr);
    });
  }

  // 2. RENDERIZAR ACORDEÓN TÁCTIL PARA CELULAR (DÍA/MES/AÑO, SEDE, MONTO SIN REBAJOS Y DESPLEGABLE)
  if (mobileAccordion) {
    mobileAccordion.innerHTML = '';
    filtered.forEach(c => {
      const dmyDate = formatDateDMY(c.date);
      const venueLabel = c.venue === 'jungles' ? '🌴 Jungles' : '🍺 La Chichera';

      const card = document.createElement('div');
      card.className = 'history-card-item';
      card.id = `history-item-${c.id}`;

      // Listas de créditos y empleados formateadas si existen
      let creditosListHtml = '';
      if (c.creditos && c.creditos.length > 0) {
        creditosListHtml = `
          <div class="history-mini-chips">
            ${c.creditos.map(cr => `<span class="history-mini-chip">${cr.name || 'Cliente'}: ${formatCurrency(cr.amount)}</span>`).join('')}
          </div>
        `;
      }

      let empleadosListHtml = '';
      if (c.empleados && c.empleados.length > 0) {
        empleadosListHtml = `
          <div class="history-mini-chips">
            ${c.empleados.map(em => `<span class="history-mini-chip">${em.name || 'Personal'}: -${formatCurrency(em.amount)}</span>`).join('')}
          </div>
        `;
      }

      // Estructura adaptada: en cabecera sólo Fecha (D/M/A), Nombre del Bar, y Monto del Cierre (Total Ventas sin rebajos)
      card.innerHTML = `
        <div class="history-card-header" role="button" aria-expanded="false" tabindex="0" title="Toca para ver u ocultar detalles">
          <div class="history-meta-left">
            <div class="history-date-badge">
              <span class="date-icon">📅</span>
              <span>${dmyDate}</span>
            </div>
            <span class="history-venue-badge ${c.venue}">${venueLabel}</span>
          </div>

          <div class="history-meta-right">
            <div class="history-amount-block">
              <span class="history-amount-label">Monto Cierre (Ventas)</span>
              <span class="history-amount-value">${formatCurrency(c.totalVentas)}</span>
            </div>
            <div class="history-chevron" aria-hidden="true">▼</div>
          </div>
        </div>

        <div class="history-card-body">
          <div class="history-details-grid">
            <div class="history-detail-item">
              <span class="history-detail-label">💵 Efectivo</span>
              <span class="history-detail-val">${formatCurrency(c.efectivo)}</span>
            </div>

            <div class="history-detail-item">
              <span class="history-detail-label">💳 Datáfonos (-13%)</span>
              <span class="history-detail-val">${formatCurrency(c.totalDatafonos)}</span>
            </div>

            <div class="history-detail-item ${c.sinpes && c.sinpes.length > 0 ? 'full-width' : ''}">
              <span class="history-detail-label">📱 SINPE Móvil</span>
              <span class="history-detail-val text-cyan">${formatCurrency(c.totalSinpes || 0)}</span>
              ${c.sinpes && c.sinpes.length > 0 ? `
                <div class="history-mini-chips">
                  ${c.sinpes.map(s => `<span class="history-mini-chip">${s.name || 'SINPE'}: ${formatCurrency(s.amount)}</span>`).join('')}
                </div>
              ` : ''}
            </div>

            <div class="history-detail-item ${c.creditos && c.creditos.length > 0 ? 'full-width' : ''}">
              <span class="history-detail-label">📝 Créditos / Fiados</span>
              <span class="history-detail-val">${formatCurrency(c.totalCreditos)}</span>
              ${creditosListHtml}
            </div>

            <div class="history-detail-item ${c.creditos && c.creditos.length > 0 ? '' : ''}">
              <span class="history-detail-label">📊 Venta Total Bruta</span>
              <span class="history-detail-val text-primary">${formatCurrency(c.totalVentas)}</span>
            </div>

            <div class="history-detail-item full-width">
              <span class="history-detail-label">👥 Rebajos a Personal</span>
              <span class="history-detail-val text-rose">-${formatCurrency(c.totalEmpleados)}</span>
              ${empleadosListHtml}
            </div>

            <div class="history-detail-item full-width highlight-efectivo-neto" style="background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.4); text-align: center; padding: 10px;">
              <span class="history-detail-label" style="color: #34d399; font-weight: 700;">💵 TOTAL EFECTIVO EN CAJA (Efectivo - Empleados)</span>
              <span class="history-detail-val text-emerald" style="font-size: 1.25rem; font-weight: 800;">${formatCurrency((c.efectivo || 0) - (c.totalEmpleados || 0))}</span>
            </div>

            <div class="history-detail-item full-width highlight-neto">
              <span class="history-detail-label">⚖️ TOTAL FINAL NETO DEL DÍA</span>
              <span class="history-detail-val text-cyan" style="font-size: 1.18rem;">${formatCurrency(c.balanceNeto)}</span>
            </div>
          </div>

          ${c.notes ? `<div class="history-notes-box"><strong>Observaciones:</strong> ${c.notes}</div>` : ''}

          <div class="history-actions-bar">
            <button type="button" class="btn-history-touch edit" title="Editar este cierre">
              <span>✏️</span>
              <span>Editar</span>
            </button>
            <button type="button" class="btn-history-touch receipt" title="Ver comprobante oficial">
              <span>🧾</span>
              <span>Ticket</span>
            </button>
            <button type="button" class="btn-history-touch whatsapp" title="Compartir por WhatsApp">
              <span>📲</span>
              <span>WhatsApp</span>
            </button>
            <button type="button" class="btn-history-touch delete" title="Eliminar registro">
              <span>🗑️</span>
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      `;

      // Evento acordeón: Al tocar la cabecera abre/cierra los detalles
      const header = card.querySelector('.history-card-header');
      header.addEventListener('click', () => {
        const isOpen = card.classList.toggle('open');
        header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Acciones táctiles dentro del acordeón
      card.querySelector('.btn-history-touch.edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditReceiptModal(c);
      });

      card.querySelector('.btn-history-touch.receipt').addEventListener('click', (e) => {
        e.stopPropagation();
        showReceiptModal(c);
      });

      card.querySelector('.btn-history-touch.whatsapp').addEventListener('click', (e) => {
        e.stopPropagation();
        const text = generateWhatsAppText(c);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        showToast('Resumen preparado para WhatsApp');
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      });

      card.querySelector('.btn-history-touch.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`¿Estás seguro de eliminar el cierre del ${dmyDate} (${c.venueName})?`)) {
          AppState.closures = AppState.closures.filter(item => item.id !== c.id);
          saveToStorage();
          renderConsolidadoView();
          renderHistoryTable();
          renderRecibosSection();
          showToast('Cierre eliminado correctamente');
        }
      });

      mobileAccordion.appendChild(card);
    });
  }
}

// ==========================================
// CONTROL DEL SLIDER/SWIPER DE SEDES (CONSOLIDADO)
// ==========================================
function initVenuesSlider() {
  const track = document.getElementById('venues-slider-track');
  if (!track) return;

  const cardJungles = document.getElementById('slide-card-jungles');
  const cardChichera = document.getElementById('slide-card-chichera');
  const pillJungles = document.getElementById('pill-slide-jungles');
  const pillChichera = document.getElementById('pill-slide-chichera');
  const dots = document.querySelectorAll('.carousel-dot');

  function updateSliderActiveState(index) {
    if (pillJungles && pillChichera) {
      pillJungles.classList.toggle('active', index === 0);
      pillChichera.classList.toggle('active', index === 1);
    }
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });
  }

  function scrollToSlide(index) {
    if (!track) return;
    if (index === 0 && cardJungles) {
      track.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (index === 1 && cardChichera) {
      track.scrollTo({ left: cardChichera.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
    updateSliderActiveState(index);
  }

  if (pillJungles) {
    pillJungles.addEventListener('click', () => scrollToSlide(0));
  }
  if (pillChichera) {
    pillChichera.addEventListener('click', () => scrollToSlide(1));
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const slideIdx = Number(dot.dataset.slide) || 0;
      scrollToSlide(slideIdx);
    });
  });

  // Detectar swipe / scroll horizontal continuo
  let scrollTimeout;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollPos = track.scrollLeft;
      const halfWidth = track.clientWidth * 0.4;
      const activeIdx = scrollPos > halfWidth ? 1 : 0;
      updateSliderActiveState(activeIdx);
    }, 40);
  }, { passive: true });

  // Soporte para arrastrar con ratón (Mouse Drag to Swipe)
  let isDown = false;
  let startX;
  let scrollLeft;

  track.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - track.offsetLeft;
    scrollLeft = track.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    if (isDown) isDown = false;
  });

  track.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - track.offsetLeft;
    const walk = (x - startX) * 1.5;
    track.scrollLeft = scrollLeft - walk;
  });
}

// ==========================================
// TICKET DE COMPROBANTE Y RESUMEN WHATSAPP
// ==========================================
function generateWhatsAppText(c) {
  const isJungles = c.venue === 'jungles';
  const icon = isJungles ? '🌴' : '🍺';
  const venueTitle = isJungles ? 'JUNGLES BAR' : 'LA CHICHERA BY FLUBERS';

  let text = `${icon} *CIERRE DE CAJA - ${venueTitle}* ${icon}\n`;
  text += `📅 *Fecha:* ${c.date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💵 *Efectivo en Caja:* ${formatCurrency(c.efectivo)}\n`;
  text += `💳 *Datáfono 1:* ${formatCurrency(c.datafono1)}\n`;
  text += `💳 *Datáfono 2:* ${formatCurrency(c.datafono2)}\n`;
  text += `🧾 *Subtotal Tarjetas:* ${formatCurrency(c.subtotalDatafonos)}\n`;
  text += `➖ *Rebajo IVA (13%):* -${formatCurrency(c.ivaDatafonos)}\n`;
  text += `💳 *Total Datáfonos (-13%):* ${formatCurrency(c.totalDatafonos)}\n`;
  if (c.sinpes && c.sinpes.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📱 *SINPE Móvil:* ${formatCurrency(c.totalSinpes || 0)} (${c.sinpes.length} transferencias)\n`;
    c.sinpes.forEach(sn => {
      text += `  • ${sn.name || 'Transferencia'}: ${formatCurrency(sn.amount)}\n`;
    });
  } else if (c.totalSinpes) {
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📱 *SINPE Móvil:* ${formatCurrency(c.totalSinpes)}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📝 *Créditos / Fiados:* ${formatCurrency(c.totalCreditos)} (${c.creditos.length} clientes)\n`;
  if (c.creditos.length > 0) {
    c.creditos.forEach(cr => {
      text += `  • ${cr.name || 'Cliente'}: ${formatCurrency(cr.amount)}\n`;
    });
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🌟 *TOTAL VENTAS DEL DÍA: ${formatCurrency(c.totalVentas)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `⚖️ *10% Servicio de Ley:* ${formatCurrency(c.servicioMonto)}\n`;
  text += `👥 *Total Pagado a Empleados:* -${formatCurrency(c.totalEmpleados)}\n`;
  if (c.empleados.length > 0) {
    c.empleados.forEach(em => {
      text += `  • ${em.name || 'Personal'}: ${formatCurrency(em.amount)}\n`;
    });
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  const efNeto = (c.efectivo || 0) - (c.totalEmpleados || 0);
  text += `💵 *TOTAL EFECTIVO EN CAJA: ${formatCurrency(efNeto)}* (Efectivo menos Empleados)\n`;
  text += `💰 *TOTAL FINAL NETO DEL DÍA: ${formatCurrency(c.balanceNeto)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  if (c.notas) {
    text += `📌 *Observaciones:* ${c.notas}\n`;
  }
  text += `_Sistema de Control de Caja Multi-Sede_`;

  return text;
}

// ==========================================
// VISTA 4: HISTORIAL DE RECIBOS Y PREVISTAS
// ==========================================
let currentRecibosFilter = 'all'; // 'all' | 'jungles' | 'chichera'

function renderRecibosView() {
  const container = document.getElementById('recibos-cards-container');
  if (!container) return;

  const dateInput = document.getElementById('input-filter-recibos-date');
  const dateFilter = dateInput ? dateInput.value : '';

  let filtered = AppState.closures || [];
  if (currentRecibosFilter !== 'all') {
    filtered = filtered.filter(c => c.venue === currentRecibosFilter);
  }
  if (dateFilter) {
    filtered = filtered.filter(c => c.date === dateFilter);
  }

  // KPIs resumen
  const totalCount = filtered.length;
  const totalVentas = filtered.reduce((acc, c) => acc + (Number(c.totalVentas) || 0), 0);
  const totalRebajos = filtered.reduce((acc, c) => acc + (Number(c.totalEmpleados) || 0), 0);
  const totalNeto = totalVentas - totalRebajos;

  const countEl = document.getElementById('kpi-recibos-count');
  const ventasEl = document.getElementById('kpi-recibos-ventas');
  const rebajosEl = document.getElementById('kpi-recibos-rebajos');
  const netoEl = document.getElementById('kpi-recibos-neto');

  if (countEl) countEl.textContent = totalCount;
  if (ventasEl) ventasEl.textContent = formatCurrency(totalVentas);
  if (rebajosEl) rebajosEl.textContent = '-' + formatCurrency(totalRebajos);
  if (netoEl) netoEl.textContent = formatCurrency(totalNeto);

  // Actualizar badge en la barra de navegación
  const badgeRecibos = document.getElementById('badge-count-total-recibos');
  if (badgeRecibos) {
    badgeRecibos.textContent = AppState.closures.length;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 32px 16px;">
        <p style="font-size: 1rem; color: var(--text-highlight);">No se encontraron recibos con los filtros seleccionados.</p>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Guarda un nuevo corte de caja diaria para registrar un recibo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(c => {
    const isJungles = c.venue === 'jungles';
    const logoUrl = isJungles ? 'assets/jungles_logo.jpg' : 'assets/chichera_logo.jpg';
    const venueName = isJungles ? 'Jungles Bar' : 'La Chichera';
    const cardBorderClass = isJungles ? 'card-border-jungles' : 'card-border-chichera';
    const folioNum = c.id ? `REC-${c.id.substring(0, 8).toUpperCase()}` : 'RECIBO';
    const creditosCount = c.creditos ? c.creditos.length : 0;
    const empleadosCount = c.empleados ? c.empleados.length : 0;

    const card = document.createElement('div');
    card.className = `recibo-preview-card ${cardBorderClass}`;
    card.innerHTML = `
      <div class="recibo-card-top">
        <div class="recibo-card-venue">
          <img src="${logoUrl}" alt="${venueName}" class="recibo-venue-thumb" style="border-color: ${isJungles ? '#10b981' : '#f59e0b'};">
          <div class="recibo-venue-info">
            <h4>${venueName}</h4>
            <span class="recibo-venue-date">📅 ${formatDateDisplay(c.date)} &middot; ${folioNum}</span>
          </div>
        </div>
        <span class="recibo-status-badge">✔️ Cierre Guardado</span>
      </div>

      <!-- PREVISTA SOLICITADA POR EL USUARIO: VENTA TOTAL, REBAJOS Y FINAL TRAS REBAJOS -->
      <div class="recibo-prevista-banner">
        <div class="recibo-prevista-item">
          <span class="recibo-prevista-label">Venta Total</span>
          <span class="recibo-prevista-val text-emerald">${formatCurrency(c.totalVentas)}</span>
        </div>
        <div class="recibo-prevista-item">
          <span class="recibo-prevista-label">Rebajos Personal</span>
          <span class="recibo-prevista-val text-rose">-${formatCurrency(c.totalEmpleados)}</span>
        </div>
        <div class="recibo-prevista-item neto-col">
          <span class="recibo-prevista-label">TOTAL FINAL TRAS REBAJOS</span>
          <span class="recibo-prevista-val huge">${formatCurrency(c.balanceNeto)}</span>
        </div>
      </div>

      <!-- Desglose de Operaciones en Chips -->
      <div class="recibo-chips-row">
        <span class="recibo-mini-chip">💵 Ef. en Caja: <strong>${formatCurrency((c.efectivo || 0) - (c.totalEmpleados || 0))}</strong></span>
        <span class="recibo-mini-chip">💳 Datáfonos (-13%): <strong>${formatCurrency(c.totalDatafonos)}</strong></span>
        <span class="recibo-mini-chip">📱 SINPE: <strong>${formatCurrency(c.totalSinpes || 0)}</strong> (${c.sinpes ? c.sinpes.length : 0})</span>
        <span class="recibo-mini-chip">📝 Créditos: <strong>${formatCurrency(c.totalCreditos)}</strong> (${creditosCount})</span>
        <span class="recibo-mini-chip">👥 Personal: <strong>${empleadosCount} pagos</strong></span>
      </div>

      <!-- Botones de Acción -->
      <div class="recibo-actions-bar">
        <button type="button" class="btn btn-sm btn-secondary btn-recibo-whatsapp">
          📲 WhatsApp
        </button>
        <button type="button" class="btn btn-sm btn-secondary btn-recibo-editar">
          ✏️ Editar
        </button>
        <button type="button" class="btn btn-sm btn-primary btn-recibo-ver">
          📄 Ver Tíquete PDF
        </button>
        <button type="button" class="btn btn-sm btn-outline text-danger btn-recibo-eliminar" title="Eliminar este recibo">
          🗑️
        </button>
      </div>
    `;

    card.querySelector('.btn-recibo-editar').addEventListener('click', () => {
      openEditReceiptModal(c);
    });

    card.querySelector('.btn-recibo-ver').addEventListener('click', () => {
      showReceiptModal(c);
    });

    card.querySelector('.btn-recibo-whatsapp').addEventListener('click', () => {
      const text = generateWhatsAppText(c);
      navigator.clipboard.writeText(text).then(() => {
        showToast('Resumen copiado para WhatsApp');
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      });
    });

    card.querySelector('.btn-recibo-eliminar').addEventListener('click', () => {
      if (confirm(`¿Eliminar el recibo del ${c.date} (${c.venueName || venueName})?`)) {
        AppState.closures = AppState.closures.filter(item => item.id !== c.id);
        saveToStorage();
        renderRecibosView();
        renderConsolidadoView();
        updateHeaderBadges();
        showToast('Recibo eliminado.');
      }
    });

    container.appendChild(card);
  });
}

// ==========================================
// MODAL DE CONFIRMACIÓN PARA LIMPIAR CAJA
// ==========================================
function openConfirmClearModal() {
  const modal = document.getElementById('modal-confirm-clear');
  if (!modal) return;
  const venue = VENUES[AppState.currentVenue];
  const textEl = document.getElementById('confirm-clear-venue-text');
  if (textEl && venue) {
    textEl.innerHTML = `Se borrarán todos los montos de efectivo, datáfonos, créditos y pagos a empleados de hoy para <strong>${venue.name}</strong> para dejar la caja en blanco (₡0).`;
  }
  modal.style.display = 'flex';
}

function executeClearForm() {
  const venueId = AppState.currentVenue;
  AppState.drafts[venueId] = {
    efectivo: 0,
    datafono1: 0,
    datafono2: 0,
    sinpes: [],
    creditos: [],
    servicioPct: 10,
    servicioMontoManual: null,
    empleados: [],
    notas: ''
  };

  const inputEfectivo = document.getElementById('input-efectivo');
  const inputD1 = document.getElementById('input-datafono-1');
  const inputD2 = document.getElementById('input-datafono-2');
  const inputServicioMonto = document.getElementById('input-servicio-monto');
  const inputNotes = document.getElementById('input-closure-notes');

  if (inputEfectivo) inputEfectivo.value = '';
  if (inputD1) inputD1.value = '';
  if (inputD2) inputD2.value = '';
  if (inputServicioMonto) inputServicioMonto.value = '';
  if (inputNotes) inputNotes.value = '';

  populateFormWithDraft(venueId);
  saveToStorage();
  updateHeaderBadges();

  const modal = document.getElementById('modal-confirm-clear');
  if (modal) modal.style.display = 'none';

  showToast(`✨ Caja de ${VENUES[venueId].name} restablecida a cero.`);
}

// ==========================================
// MODAL DE EDICIÓN DE RECIBOS Y CIERRES
// ==========================================
let currentEditingClosure = null;
let currentEditingDraft = null;

function openEditReceiptModal(closure) {
  const modal = document.getElementById('modal-edit-receipt');
  if (!modal) return;

  currentEditingClosure = closure;
  currentEditingDraft = {
    id: closure.id,
    venue: closure.venue,
    date: closure.date,
    efectivo: Number(closure.efectivo) || 0,
    datafono1: Number(closure.datafono1) || 0,
    datafono2: Number(closure.datafono2) || 0,
    sinpes: Array.isArray(closure.sinpes) ? JSON.parse(JSON.stringify(closure.sinpes)) : [],
    creditos: Array.isArray(closure.creditos) ? JSON.parse(JSON.stringify(closure.creditos)) : [],
    empleados: Array.isArray(closure.empleados) ? JSON.parse(JSON.stringify(closure.empleados)) : [],
    servicioPct: closure.servicioPct || 10,
    notas: closure.notas || ''
  };

  const isJungles = closure.venue === 'jungles';
  const venueName = isJungles ? 'Jungles Bar' : 'La Chichera';
  const logoUrl = isJungles ? 'assets/jungles_logo.jpg' : 'assets/chichera_logo.jpg';
  const folio = closure.id ? `REC-${closure.id.substring(0, 10).toUpperCase()}` : 'RECIBO';

  document.getElementById('badge-edit-folio').textContent = folio;
  document.getElementById('edit-receipt-id').value = closure.id;
  document.getElementById('edit-venue-name').textContent = venueName;
  document.getElementById('edit-venue-thumb').src = logoUrl;
  document.getElementById('edit-receipt-date').value = currentEditingDraft.date;

  document.getElementById('edit-efectivo').value = currentEditingDraft.efectivo ? currentEditingDraft.efectivo : '';
  document.getElementById('edit-datafono1').value = currentEditingDraft.datafono1 ? currentEditingDraft.datafono1 : '';
  document.getElementById('edit-datafono2').value = currentEditingDraft.datafono2 ? currentEditingDraft.datafono2 : '';
  document.getElementById('edit-notas').value = currentEditingDraft.notas || '';

  renderEditSinpesRows();
  renderEditCreditosRows();
  renderEditEmpleadosRows();
  recalculateEditTotals();

  modal.style.display = 'flex';
}

function renderEditSinpesRows() {
  const container = document.getElementById('edit-sinpes-container');
  if (!container || !currentEditingDraft) return;

  if (!currentEditingDraft.sinpes) currentEditingDraft.sinpes = [];

  if (currentEditingDraft.sinpes.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 10px; font-size: 0.8rem; color: var(--text-muted);">Sin transferencias SINPE registradas</div>`;
    return;
  }

  container.innerHTML = '';
  currentEditingDraft.sinpes.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text edit-sinpe-name" placeholder="Cliente / Ref" value="${item.name || ''}" data-idx="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency edit-sinpe-amount" placeholder="0" value="${item.amount || ''}" min="0" step="500" data-idx="${index}">
      </div>
      <button type="button" class="btn-delete-row edit-del-sinpe" title="Eliminar" data-idx="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    row.querySelector('.edit-sinpe-name').addEventListener('input', (e) => {
      currentEditingDraft.sinpes[index].name = e.target.value;
    });
    row.querySelector('.edit-sinpe-amount').addEventListener('input', (e) => {
      currentEditingDraft.sinpes[index].amount = parseCurrencyInput(e.target.value);
      recalculateEditTotals();
    });
    row.querySelector('.edit-del-sinpe').addEventListener('click', () => {
      currentEditingDraft.sinpes.splice(index, 1);
      renderEditSinpesRows();
      recalculateEditTotals();
    });

    container.appendChild(row);
  });
}

function renderEditCreditosRows() {
  const container = document.getElementById('edit-creditos-container');
  if (!container || !currentEditingDraft) return;

  if (currentEditingDraft.creditos.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 10px; font-size: 0.8rem; color: var(--text-muted);">Sin créditos registrados</div>`;
    return;
  }

  container.innerHTML = '';
  currentEditingDraft.creditos.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text edit-cred-name" placeholder="Cliente" value="${item.name || ''}" data-idx="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency edit-cred-amount" placeholder="0" value="${item.amount || ''}" min="0" step="500" data-idx="${index}">
      </div>
      <button type="button" class="btn-delete-row edit-del-cred" title="Eliminar" data-idx="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    row.querySelector('.edit-cred-name').addEventListener('input', (e) => {
      currentEditingDraft.creditos[index].name = e.target.value;
    });
    row.querySelector('.edit-cred-amount').addEventListener('input', (e) => {
      currentEditingDraft.creditos[index].amount = parseCurrencyInput(e.target.value);
      recalculateEditTotals();
    });
    row.querySelector('.edit-del-cred').addEventListener('click', () => {
      currentEditingDraft.creditos.splice(index, 1);
      renderEditCreditosRows();
      recalculateEditTotals();
    });

    container.appendChild(row);
  });
}

function renderEditEmpleadosRows() {
  const container = document.getElementById('edit-empleados-container');
  if (!container || !currentEditingDraft) return;

  if (currentEditingDraft.empleados.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 10px; font-size: 0.8rem; color: var(--text-muted);">Sin pagos a personal registrados</div>`;
    return;
  }

  container.innerHTML = '';
  currentEditingDraft.empleados.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="dynamic-input-text edit-emp-name" placeholder="Colaborador" value="${item.name || ''}" data-idx="${index}">
      <div class="input-currency-wrapper small">
        <span class="currency-prefix">₡</span>
        <input type="number" class="input-currency edit-emp-amount" placeholder="0" value="${item.amount || ''}" min="0" step="500" data-idx="${index}">
      </div>
      <button type="button" class="btn-delete-row edit-del-emp" title="Eliminar" data-idx="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    row.querySelector('.edit-emp-name').addEventListener('input', (e) => {
      currentEditingDraft.empleados[index].name = e.target.value;
    });
    row.querySelector('.edit-emp-amount').addEventListener('input', (e) => {
      currentEditingDraft.empleados[index].amount = parseCurrencyInput(e.target.value);
      recalculateEditTotals();
    });
    row.querySelector('.edit-del-emp').addEventListener('click', () => {
      currentEditingDraft.empleados.splice(index, 1);
      renderEditEmpleadosRows();
      recalculateEditTotals();
    });

    container.appendChild(row);
  });
}

function recalculateEditTotals() {
  if (!currentEditingDraft) return;

  const ef = parseCurrencyInput(document.getElementById('edit-efectivo').value);
  const d1 = parseCurrencyInput(document.getElementById('edit-datafono1').value);
  const d2 = parseCurrencyInput(document.getElementById('edit-datafono2').value);

  currentEditingDraft.efectivo = ef;
  currentEditingDraft.datafono1 = d1;
  currentEditingDraft.datafono2 = d2;
  currentEditingDraft.date = document.getElementById('edit-receipt-date').value || currentEditingDraft.date;
  currentEditingDraft.notas = document.getElementById('edit-notas').value || '';

  const subtotalD = d1 + d2;
  const ivaD = subtotalD * 0.13;
  const totalD = subtotalD - ivaD;

  if (!currentEditingDraft.sinpes) currentEditingDraft.sinpes = [];
  const totalSinp = currentEditingDraft.sinpes.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const totalCred = currentEditingDraft.creditos.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const totalVentas = ef + totalD + totalSinp + totalCred;
  const totalEmp = currentEditingDraft.empleados.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const efectivoNeto = ef - totalEmp;
  const balanceNeto = totalVentas - totalEmp;

  document.getElementById('edit-subtotal-datafonos').textContent = formatCurrency(subtotalD);
  document.getElementById('edit-iva-datafonos').textContent = '-' + formatCurrency(ivaD);
  document.getElementById('edit-total-datafonos').textContent = formatCurrency(totalD);
  const elEditSinpes = document.getElementById('edit-total-sinpes');
  if (elEditSinpes) elEditSinpes.textContent = formatCurrency(totalSinp);
  document.getElementById('edit-total-creditos').textContent = formatCurrency(totalCred);
  document.getElementById('edit-total-empleados').textContent = '-' + formatCurrency(totalEmp);

  document.getElementById('edit-preview-total-ventas').textContent = formatCurrency(totalVentas);
  document.getElementById('edit-preview-total-rebajos').textContent = '-' + formatCurrency(totalEmp);
  const elEditPreviewEf = document.getElementById('edit-preview-efectivo-neto');
  if (elEditPreviewEf) elEditPreviewEf.textContent = formatCurrency(efectivoNeto);
  document.getElementById('edit-preview-balance-neto').textContent = formatCurrency(balanceNeto);

  return {
    subtotalDatafonos: subtotalD,
    ivaDatafonos: ivaD,
    totalDatafonos: totalD,
    sinpes: currentEditingDraft.sinpes,
    totalSinpes: totalSinp,
    totalCreditos: totalCred,
    totalVentas,
    totalEmpleados: totalEmp,
    efectivoNeto,
    balanceNeto
  };
}

function saveEditedReceipt() {
  if (!currentEditingClosure || !currentEditingDraft) return;

  const totals = recalculateEditTotals();
  const closureIndex = AppState.closures.findIndex(c => c.id === currentEditingClosure.id);
  if (closureIndex === -1) return;

  const updatedRecord = {
    ...AppState.closures[closureIndex],
    date: currentEditingDraft.date,
    efectivo: currentEditingDraft.efectivo,
    datafono1: currentEditingDraft.datafono1,
    datafono2: currentEditingDraft.datafono2,
    subtotalDatafonos: totals.subtotalDatafonos,
    ivaDatafonos: totals.ivaDatafonos,
    totalDatafonos: totals.totalDatafonos,
    sinpes: JSON.parse(JSON.stringify(currentEditingDraft.sinpes || [])),
    totalSinpes: totals.totalSinpes,
    creditos: JSON.parse(JSON.stringify(currentEditingDraft.creditos)),
    totalCreditos: totals.totalCreditos,
    totalVentas: totals.totalVentas,
    servicioMonto: totals.totalVentas * ((currentEditingDraft.servicioPct || 10) / 100),
    empleados: JSON.parse(JSON.stringify(currentEditingDraft.empleados)),
    totalEmpleados: totals.totalEmpleados,
    efectivoNeto: totals.efectivoNeto,
    balanceNeto: totals.balanceNeto,
    notas: currentEditingDraft.notas,
    lastEditedAt: new Date().toISOString()
  };

  AppState.closures[closureIndex] = updatedRecord;
  saveToStorage();

  // Sincronizar actualización en Supabase
  if (typeof SupabaseService !== 'undefined' && SupabaseService.isConfigured()) {
    SupabaseService.saveClosure(updatedRecord).then(success => {
      if (success) showToast('☁️ Recibo actualizado en Supabase');
    });
  }

  renderRecibosView();
  if (AppState.currentVenue === 'consolidado') renderConsolidadoView();
  renderHistoryTable();
  updateHeaderBadges();

  document.getElementById('modal-edit-receipt').style.display = 'none';
  showToast(`✔️ Recibo ${updatedRecord.date} actualizado con éxito.`);

  // Abrir comprobante PDF actualizado
  showReceiptModal(updatedRecord);
}

function loadEditedReceiptIntoMainCash() {
  if (!currentEditingDraft) return;

  const venueId = currentEditingDraft.venue;
  AppState.currentVenue = venueId;
  AppState.selectedDate = currentEditingDraft.date;

  AppState.drafts[venueId] = {
    efectivo: currentEditingDraft.efectivo,
    datafono1: currentEditingDraft.datafono1,
    datafono2: currentEditingDraft.datafono2,
    creditos: JSON.parse(JSON.stringify(currentEditingDraft.creditos)),
    servicioPct: currentEditingDraft.servicioPct || 10,
    servicioMontoManual: null,
    empleados: JSON.parse(JSON.stringify(currentEditingDraft.empleados)),
    notas: currentEditingDraft.notas || ''
  };

  updateVenueThemeUI();
  const dateInput = document.getElementById('input-closure-date');
  if (dateInput) dateInput.value = currentEditingDraft.date;

  document.getElementById('modal-edit-receipt').style.display = 'none';
  showToast(`Datos del recibo cargados en la caja de ${VENUES[venueId].name}.`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// TÍQUETE Y COMPROBANTE OFICIAL (TIPO PDF PRO)
// ==========================================
function showReceiptModal(closure) {
  const modal = document.getElementById('modal-receipt');
  const ticketContent = document.getElementById('ticket-content');
  const isJungles = closure.venue === 'jungles';
  const logoUrl = isJungles ? 'assets/jungles_logo.jpg' : 'assets/chichera_logo.jpg';
  const venueTitle = isJungles ? 'JUNGLES BAR' : 'LA CHICHERA BY FLUBERS';
  const venueBadgeClass = isJungles ? 'jungles' : 'chichera';
  const folioNum = closure.id ? `REC-${closure.id.substring(0, 10).toUpperCase()}` : `REC-${Date.now()}`;
  const horaFormateada = closure.timestamp ? new Date(closure.timestamp).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  let creditosRows = '';
  if (closure.creditos && closure.creditos.length > 0) {
    creditosRows = closure.creditos.map(cr => `
      <tr>
        <td>&bull; Fiado: <strong>${cr.name || 'Cliente'}</strong></td>
        <td class="td-val">${formatCurrency(cr.amount)}</td>
      </tr>
    `).join('');
  } else {
    creditosRows = `<tr><td style="color:#64748b; font-style:italic;">Sin créditos o cuentas pendientes</td><td class="td-val">₡0</td></tr>`;
  }

  let empleadosRows = '';
  if (closure.empleados && closure.empleados.length > 0) {
    empleadosRows = closure.empleados.map(em => `
      <tr>
        <td>&bull; Pago: <strong>${em.name || 'Colaborador'}</strong></td>
        <td class="td-val text-rose" style="color: #e11d48;">-${formatCurrency(em.amount)}</td>
      </tr>
    `).join('');
  } else {
    empleadosRows = `<tr><td style="color:#64748b; font-style:italic;">Sin pagos de personal registrados</td><td class="td-val">₡0</td></tr>`;
  }

  ticketContent.innerHTML = `
    <img src="${logoUrl}" alt="Watermark" class="voucher-watermark-bg">
    
    <div class="voucher-header">
      <div class="voucher-brand-badge ${venueBadgeClass}">
        <img src="${logoUrl}" alt="${venueTitle}" class="voucher-brand-img">
      </div>
      <h2 class="voucher-venue-title">${venueTitle}</h2>
      <p class="voucher-venue-subtitle">Comprobante Oficial de Cierre Diario de Caja</p>
    </div>

    <!-- Metadatos Oficiales -->
    <div class="voucher-meta-grid">
      <div class="voucher-meta-row">
        <span class="voucher-meta-label">Folio / N°:</span>
        <span class="voucher-meta-val">${folioNum}</span>
      </div>
      <div class="voucher-meta-row">
        <span class="voucher-meta-label">Fecha de Caja:</span>
        <span class="voucher-meta-val">${closure.date}</span>
      </div>
      <div class="voucher-meta-row">
        <span class="voucher-meta-label">Hora de Registro:</span>
        <span class="voucher-meta-val">${horaFormateada}</span>
      </div>
      <div class="voucher-meta-row">
        <span class="voucher-meta-label">Estado:</span>
        <span class="voucher-meta-val" style="color:#059669;">✔️ Liquidado</span>
      </div>
    </div>

    <!-- Sección 1: Ingresos -->
    <div class="voucher-section-heading">
      <span>1. Detalle de Ingresos en Caja</span>
      <span>Monto</span>
    </div>
    <table class="voucher-table">
      <tbody>
        <tr>
          <td>Efectivo en Barra (Billetes y Monedas)</td>
          <td class="td-val">${formatCurrency(closure.efectivo)}</td>
        </tr>
        <tr>
          <td>Datáfono 1 (Cobros con Tarjeta)</td>
          <td class="td-val">${formatCurrency(closure.datafono1)}</td>
        </tr>
        <tr>
          <td>Datáfono 2 (Cobros con Tarjeta)</td>
          <td class="td-val">${formatCurrency(closure.datafono2)}</td>
        </tr>
        <tr style="background: #f8fafc; font-weight: 600;">
          <td>Subtotal Datáfonos (Sin IVA)</td>
          <td class="td-val">${formatCurrency(closure.subtotalDatafonos)}</td>
        </tr>
        <tr style="color: #b45309;">
          <td>- Rebajo IVA (13%)</td>
          <td class="td-val">-${formatCurrency(closure.ivaDatafonos)}</td>
        </tr>
        <tr style="background: #f8fafc; font-weight: 700;">
          <td>Total Datáfonos (-13%)</td>
          <td class="td-val">${formatCurrency(closure.totalDatafonos)}</td>
        </tr>
      </tbody>
    </table>

    <div class="voucher-section-heading" style="margin-top: 8px;">
      <span>📱 SINPE Móvil (${closure.sinpes ? closure.sinpes.length : 0})</span>
      <span>${formatCurrency(closure.totalSinpes || 0)}</span>
    </div>
    <table class="voucher-table">
      <tbody>
        ${closure.sinpes && closure.sinpes.length > 0 ? closure.sinpes.map(sn => `
          <tr>
            <td>&bull; SINPE: <strong>${sn.name || 'Transferencia'}</strong></td>
            <td class="td-val">${formatCurrency(sn.amount)}</td>
          </tr>
        `).join('') : '<tr><td style="color:#64748b; font-style:italic;">Sin transferencias SINPE registradas</td><td class="td-val">₡0</td></tr>'}
      </tbody>
    </table>

    <div class="voucher-section-heading" style="margin-top: 8px;">
      <span>Créditos / Cuentas Fiadas (${closure.creditos ? closure.creditos.length : 0})</span>
      <span>${formatCurrency(closure.totalCreditos)}</span>
    </div>
    <table class="voucher-table">
      <tbody>
        ${creditosRows}
      </tbody>
    </table>

    <!-- Banner Subtotal Ventas Brutas -->
    <div class="voucher-subtotal-bar">
      <span>TOTAL VENTAS DEL DÍA:</span>
      <span class="subtotal-amount" style="color: #059669;">${formatCurrency(closure.totalVentas)}</span>
    </div>

    <!-- Sección 2: Rebajos y Liquidación de Personal -->
    <div class="voucher-section-heading">
      <span>2. Liquidación y Pagos a Empleados</span>
      <span>-${formatCurrency(closure.totalEmpleados)}</span>
    </div>
    <table class="voucher-table">
      <tbody>
        <tr>
          <td>10% Servicio / Ley (Informativo):</td>
          <td class="td-val" style="color: #b45309;">${formatCurrency(closure.servicioMonto)}</td>
        </tr>
        ${empleadosRows}
      </tbody>
    </table>

    <!-- CAJA DE LIQUIDACIÓN FINAL NETO -->
    <div class="voucher-neto-box">
      <div class="voucher-neto-row">
        <span>Venta Bruta Total del Día:</span>
        <strong style="color: #fff;">${formatCurrency(closure.totalVentas)}</strong>
      </div>
      <div class="voucher-neto-row">
        <span>Total Pagado a Empleados (Rebajos):</span>
        <strong style="color: #fb7185;">-${formatCurrency(closure.totalEmpleados)}</strong>
      </div>
      <div class="voucher-neto-row" style="background: rgba(16, 185, 129, 0.15); padding: 6px 10px; border-radius: 6px; margin: 4px 0;">
        <span style="color: #34d399; font-weight: 600;">💵 TOTAL EFECTIVO EN CAJA (Efectivo - Empleados):</span>
        <strong style="color: #34d399; font-size: 1.05rem;">${formatCurrency((closure.efectivo || 0) - (closure.totalEmpleados || 0))}</strong>
      </div>
      <div class="voucher-neto-divider"></div>
      <div class="voucher-neto-final">
        <div>
          <div class="label-main">TOTAL FINAL NETO DEL DÍA</div>
          <small style="color: #94a3b8; font-size: 0.72rem;">Balance general tras liquidar personal</small>
        </div>
        <div class="val-main">${formatCurrency(closure.balanceNeto)}</div>
      </div>
    </div>

    ${closure.notas ? `
      <div class="voucher-notes-block">
        <strong>Observaciones:</strong> ${closure.notas}
      </div>
    ` : ''}

    <div class="voucher-footer-sign">
      <div class="signature-line-box">
        Firma Responsable
      </div>
      <div class="qr-mock-stamp">
        [VERIFICADO DIGITALMENTE]<br>
        SISTEMA MULTI-SEDE POS
      </div>
    </div>
  `;

  // Asignar evento de WhatsApp
  const btnCopyWhatsApp = document.getElementById('btn-copy-receipt-text');
  btnCopyWhatsApp.onclick = () => {
    const text = generateWhatsAppText(closure);
    navigator.clipboard.writeText(text).then(() => {
      showToast('¡Texto copiado! Abriendo WhatsApp...');
      const encoded = encodeURIComponent(text);
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }).catch(() => {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    });
  };

  modal.style.display = 'flex';
}

// ==========================================
// TOAST Y MENSAJES FLOTANTES
// ==========================================
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>✔️</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// INICIALIZACIÓN DE EVENTOS Y APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Cargar estado inicial
  loadFromStorage();

  // Configurar fechas por defecto
  const todayStr = new Date().toISOString().split('T')[0];
  AppState.selectedDate = todayStr;

  const dateInput = document.getElementById('input-closure-date');
  if (dateInput) {
    dateInput.value = todayStr;
    dateInput.addEventListener('change', (e) => {
      AppState.selectedDate = e.target.value;
      updateHeaderBadges();
      if (AppState.currentVenue === 'consolidado') renderConsolidadoView();
    });
  }

  const filterDateInput = document.getElementById('filter-specific-date');
  if (filterDateInput) {
    filterDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        AppState.selectedDate = e.target.value;
        currentConsolidadoFilter = 'hoy';
        document.querySelectorAll('.period-pills .pill-btn').forEach(btn => btn.classList.remove('active'));
        renderConsolidadoView();
      }
    });
  }

  // Selector de Sede (Pestañas superiores)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      AppState.currentVenue = tab.dataset.venue;
      updateVenueThemeUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Botones de acceso directo en el consolidado
  const btnGotoJungles = document.getElementById('btn-goto-jungles');
  if (btnGotoJungles) {
    btnGotoJungles.addEventListener('click', () => {
      AppState.currentVenue = 'jungles';
      updateVenueThemeUI();
    });
  }

  const btnGotoChichera = document.getElementById('btn-goto-chichera');
  if (btnGotoChichera) {
    btnGotoChichera.addEventListener('click', () => {
      AppState.currentVenue = 'chichera';
      updateVenueThemeUI();
    });
  }

  // Inputs numéricos de ingresos
  const inputEfectivo = document.getElementById('input-efectivo');
  inputEfectivo.addEventListener('input', (e) => {
    AppState.drafts[AppState.currentVenue].efectivo = parseCurrencyInput(e.target.value);
    recalculateAndRenderForm();
  });

  const inputD1 = document.getElementById('input-datafono-1');
  inputD1.addEventListener('input', (e) => {
    AppState.drafts[AppState.currentVenue].datafono1 = parseCurrencyInput(e.target.value);
    recalculateAndRenderForm();
  });

  const inputD2 = document.getElementById('input-datafono-2');
  inputD2.addEventListener('input', (e) => {
    AppState.drafts[AppState.currentVenue].datafono2 = parseCurrencyInput(e.target.value);
    recalculateAndRenderForm();
  });

  // Quick Chips para Efectivo
  document.querySelectorAll('[data-add-efectivo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const addVal = Number(btn.dataset.addEfectivo) || 0;
      const cur = Number(AppState.drafts[AppState.currentVenue].efectivo) || 0;
      AppState.drafts[AppState.currentVenue].efectivo = cur + addVal;
      inputEfectivo.value = AppState.drafts[AppState.currentVenue].efectivo;
      recalculateAndRenderForm();
    });
  });

  const btnClearEfectivo = document.getElementById('btn-clear-efectivo');
  if (btnClearEfectivo) {
    btnClearEfectivo.addEventListener('click', () => {
      AppState.drafts[AppState.currentVenue].efectivo = 0;
      inputEfectivo.value = '';
      recalculateAndRenderForm();
    });
  }

  // Servicio / Ley
  const inputServicioPct = document.getElementById('input-servicio-pct');
  inputServicioPct.addEventListener('input', (e) => {
    AppState.drafts[AppState.currentVenue].servicioPct = parseFloat(e.target.value) || 10;
    AppState.drafts[AppState.currentVenue].servicioMontoManual = null;
    recalculateAndRenderForm();
  });

  const inputServicioMonto = document.getElementById('input-servicio-monto');
  inputServicioMonto.addEventListener('input', (e) => {
    if (e.target.value === '') {
      AppState.drafts[AppState.currentVenue].servicioMontoManual = null;
    } else {
      AppState.drafts[AppState.currentVenue].servicioMontoManual = parseCurrencyInput(e.target.value);
    }
    recalculateAndRenderForm();
  });

  // Botones añadir filas
  const btnAddSinpe = document.getElementById('btn-add-sinpe');
  if (btnAddSinpe) btnAddSinpe.addEventListener('click', addSinpeRow);
  document.getElementById('btn-add-credito').addEventListener('click', addCreditoRow);
  document.getElementById('btn-add-empleado').addEventListener('click', addEmpleadoRow);

  // Notas
  document.getElementById('input-closure-notes').addEventListener('input', (e) => {
    AppState.drafts[AppState.currentVenue].notas = e.target.value;
    saveToStorage();
  });

  // Botón Cerrar y Guardar Caja
  document.getElementById('btn-save-closure').addEventListener('click', saveDailyClosure);

  // Botón Compartir Resumen WhatsApp directo
  document.getElementById('btn-share-whatsapp').addEventListener('click', () => {
    const venueId = AppState.currentVenue;
    const totals = calculateVenueTotals(venueId);
    const draft = AppState.drafts[venueId];
    const inputDate = document.getElementById('input-closure-date').value || AppState.selectedDate;
    const currentMockClosure = {
      venue: venueId,
      date: inputDate,
      ...totals,
      creditos: draft.creditos,
      empleados: draft.empleados,
      notas: draft.notas
    };
    const text = generateWhatsAppText(currentMockClosure);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Resumen copiado para WhatsApp');
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }).catch(() => {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    });
  });

  // Botón Reiniciar Formulario (abre modal de confirmación seguro)
  document.getElementById('btn-reset-form').addEventListener('click', () => {
    openConfirmClearModal();
  });

  // Modal Confirmar Limpiar Formulario
  const modalConfirmClear = document.getElementById('modal-confirm-clear');
  document.getElementById('btn-cancel-clear').addEventListener('click', () => {
    if (modalConfirmClear) modalConfirmClear.style.display = 'none';
  });

  document.getElementById('btn-confirm-clear-action').addEventListener('click', () => {
    executeClearForm();
  });

  // Modal Editar Recibo
  const modalEditReceipt = document.getElementById('modal-edit-receipt');
  document.getElementById('btn-close-edit-receipt').addEventListener('click', () => {
    if (modalEditReceipt) modalEditReceipt.style.display = 'none';
  });

  document.getElementById('btn-cancel-edit-receipt').addEventListener('click', () => {
    if (modalEditReceipt) modalEditReceipt.style.display = 'none';
  });

  document.getElementById('btn-save-edit-receipt').addEventListener('click', () => {
    saveEditedReceipt();
  });

  document.getElementById('btn-load-in-cash-register').addEventListener('click', () => {
    loadEditedReceiptIntoMainCash();
  });

  // Recálculo en vivo al tipear en modal de edición
  ['edit-efectivo', 'edit-datafono1', 'edit-datafono2', 'edit-receipt-date', 'edit-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', recalculateEditTotals);
      el.addEventListener('change', recalculateEditTotals);
    }
  });

  // Botones añadir filas en modal de edición
  const btnEditAddSinpe = document.getElementById('btn-edit-add-sinpe');
  if (btnEditAddSinpe) {
    btnEditAddSinpe.addEventListener('click', () => {
      if (!currentEditingDraft) return;
      if (!currentEditingDraft.sinpes) currentEditingDraft.sinpes = [];
      currentEditingDraft.sinpes.push({ id: 's_' + Date.now(), name: '', amount: 0 });
      renderEditSinpesRows();
      recalculateEditTotals();
    });
  }

  document.getElementById('btn-edit-add-credito').addEventListener('click', () => {
    if (!currentEditingDraft) return;
    currentEditingDraft.creditos.push({ id: 'c_' + Date.now(), name: '', amount: 0 });
    renderEditCreditosRows();
    recalculateEditTotals();
  });

  document.getElementById('btn-edit-add-empleado').addEventListener('click', () => {
    if (!currentEditingDraft) return;
    currentEditingDraft.empleados.push({ id: 'e_' + Date.now(), name: '', amount: 0 });
    renderEditEmpleadosRows();
    recalculateEditTotals();
  });

  // Filtros del Consolidado
  document.querySelectorAll('.period-pills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentConsolidadoFilter = btn.dataset.period;
      renderConsolidadoView();
    });
  });

  const selectHistoryVenue = document.getElementById('select-history-venue');
  if (selectHistoryVenue) {
    selectHistoryVenue.addEventListener('change', renderHistoryTable);
  }

  // Filtros de la Vista de Recibos
  document.querySelectorAll('.recibo-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.recibo-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentRecibosFilter = pill.dataset.venueFilter || 'all';
      renderRecibosView();
    });
  });

  const inputFilterRecibosDate = document.getElementById('input-filter-recibos-date');
  if (inputFilterRecibosDate) {
    inputFilterRecibosDate.addEventListener('change', () => {
      renderRecibosView();
    });
  }

  const btnClearRecibosFilter = document.getElementById('btn-clear-recibos-filter');
  if (btnClearRecibosFilter) {
    btnClearRecibosFilter.addEventListener('click', () => {
      if (inputFilterRecibosDate) inputFilterRecibosDate.value = '';
      currentRecibosFilter = 'all';
      document.querySelectorAll('.recibo-filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.venueFilter === 'all');
      });
      renderRecibosView();
    });
  }

  // Modales
  document.getElementById('btn-close-receipt').addEventListener('click', () => {
    document.getElementById('modal-receipt').style.display = 'none';
  });

  document.getElementById('btn-print-receipt').addEventListener('click', () => {
    window.print();
  });

  // Modal Respaldo
  const modalBackup = document.getElementById('modal-backup');
  document.getElementById('btn-backup-menu').addEventListener('click', () => {
    modalBackup.style.display = 'flex';
  });

  document.getElementById('btn-close-backup').addEventListener('click', () => {
    modalBackup.style.display = 'none';
  });

  // Exportar JSON
  document.getElementById('btn-export-backup').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem(STORAGE_KEY) || '{}');
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `respaldo_caja_bares_${AppState.selectedDate}.json`);
    dlAnchor.click();
    showToast('Copia de seguridad descargada.');
  });

  // Importar JSON
  document.getElementById('input-import-backup').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.closures) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          loadFromStorage();
          updateVenueThemeUI();
          modalBackup.style.display = 'none';
          showToast('¡Datos restaurados con éxito!');
        } else {
          alert('El archivo no contiene un formato de respaldo válido.');
        }
      } catch (err) {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  });

  // ===== DEJAR TODO EN 0 (borrar todos los recibos, borradores, y nube) =====
  document.getElementById('btn-reset-all-system').addEventListener('click', async () => {
    if (!confirm('⚠️ ¿Estás seguro de BORRAR TODOS los recibos y datos?\n\nEsto eliminará:\n• Todos los recibos guardados\n• Todos los borradores activos\n• Datos en la nube (Supabase)\n\nEsta acción NO se puede deshacer.')) return;
    if (!confirm('🔴 CONFIRMAR: ¿Realmente deseas dejar TODO en 0?')) return;

    // Limpiar estado local
    initCleanState();
    populateFormWithDraft(AppState.currentVenue);
    renderConsolidadoView();
    renderHistoryTable();
    renderRecibosView();
    updateHeaderBadges();

    // Limpiar Supabase si está configurado
    if (typeof SupabaseService !== 'undefined' && SupabaseService.isConfigured()) {
      await SupabaseService.deleteAllClosures();
    }

    modalBackup.style.display = 'none';
    showToast('✅ Sistema limpio. Todo está en ₡0, listo para empezar.');
  });

  // ===== VACIAR RECIBOS (botón en vista de Recibos) =====
  const btnVaciarRecibos = document.getElementById('btn-vaciar-recibos');
  if (btnVaciarRecibos) {
    btnVaciarRecibos.addEventListener('click', async () => {
      if (AppState.closures.length === 0) {
        showToast('No hay recibos para eliminar.');
        return;
      }
      if (!confirm(`⚠️ ¿Eliminar los ${AppState.closures.length} recibos guardados?\n\nEsta acción NO se puede deshacer.`)) return;

      AppState.closures = [];
      saveToStorage();
      renderRecibosView();
      renderConsolidadoView();
      renderHistoryTable();
      updateHeaderBadges();

      // Limpiar Supabase si está configurado
      if (typeof SupabaseService !== 'undefined' && SupabaseService.isConfigured()) {
        await SupabaseService.deleteAllClosures();
      }

      showToast('✅ Todos los recibos eliminados. Sistema en 0.');
    });
  }

  // Cerrar modales clickeando afuera
  window.addEventListener('click', (e) => {
    const receiptModal = document.getElementById('modal-receipt');
    if (e.target === receiptModal) receiptModal.style.display = 'none';

    const backupModal = document.getElementById('modal-backup');
    if (e.target === backupModal) backupModal.style.display = 'none';

    const confirmClearModal = document.getElementById('modal-confirm-clear');
    if (e.target === confirmClearModal) confirmClearModal.style.display = 'none';

    const editReceiptModal = document.getElementById('modal-edit-receipt');
    if (e.target === editReceiptModal) editReceiptModal.style.display = 'none';

    const supabaseModal = document.getElementById('modal-supabase');
    if (e.target === supabaseModal) supabaseModal.style.display = 'none';

    const pwaGuideModal = document.getElementById('modal-install-pwa-guide');
    if (e.target === pwaGuideModal) pwaGuideModal.style.display = 'none';
  });


  // Inicializar slider deslizable de sedes
  initVenuesSlider();

  // Inicializar PWA Install & Supabase Cloud
  initPwaInstallUI();
  initSupabaseUI();
  syncWithSupabase();

  // Render inicial
  updateVenueThemeUI();
});

// ==========================================
// INTEGRACIÓN PWA (PROMPT DE INSTALACIÓN CON LOGO)
// ==========================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  showToast('🎉 ¡App de Jungles agregada con éxito a tu pantalla de inicio!');
});

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('PWA Service Worker registrado:', reg.scope))
      .catch(err => console.warn('PWA Service Worker no registrado:', err));
  });
}

function initPwaInstallUI() {
  const modalGuide = document.getElementById('modal-install-pwa-guide');
  const btnCloseGuide = document.getElementById('btn-close-pwa-guide');
  const btnTriggerInstall = document.getElementById('btn-trigger-native-install');
  const btnOpenGuide = document.getElementById('btn-open-pwa-guide');

  // Abrir guía desde el modal de respaldo/opciones
  if (btnOpenGuide) {
    btnOpenGuide.addEventListener('click', () => {
      const modalBackup = document.getElementById('modal-backup');
      if (modalBackup) modalBackup.style.display = 'none';
      if (modalGuide) modalGuide.style.display = 'flex';
    });
  }

  if (btnCloseGuide && modalGuide) {
    btnCloseGuide.addEventListener('click', () => {
      modalGuide.style.display = 'none';
    });
  }

  if (btnTriggerInstall) {
    btnTriggerInstall.addEventListener('click', () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
          deferredPrompt = null;
          if (modalGuide) modalGuide.style.display = 'none';
        });
      } else {
        showToast('💡 En tu navegador toca "Compartir" o Menú (⋮) y elige "Añadir a pantalla de inicio"');
        if (modalGuide) modalGuide.style.display = 'none';
      }
    });
  }
}

// ==========================================
// INTEGRACIÓN SUPABASE (MODAL Y NUBE)
// ==========================================
function updateCloudBadgeUI() {
  const dot = document.getElementById('cloud-status-dot');
  const text = document.getElementById('cloud-status-text');
  const badge = document.getElementById('supabase-connection-status-badge');
  const btnSync = document.getElementById('btn-sync-supabase');
  const btnDisconnect = document.getElementById('btn-disconnect-supabase');

  if (typeof SupabaseService !== 'undefined' && SupabaseService.isConfigured()) {
    if (dot) dot.className = 'cloud-status-dot status-online';
    if (text) {
      text.textContent = 'Nube';
      text.style.color = '#34d399';
    }
    if (badge) {
      badge.textContent = '🟢 Conectado a Supabase';
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
    }
    if (btnSync) btnSync.style.display = 'inline-flex';
    if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
  } else {
    if (dot) dot.className = 'cloud-status-dot status-offline';
    if (text) {
      text.textContent = 'Local';
      text.style.color = 'var(--text-secondary)';
    }
    if (badge) {
      badge.textContent = '🟡 Modo Local';
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#fbbf24';
    }
    if (btnSync) btnSync.style.display = 'none';
    if (btnDisconnect) btnDisconnect.style.display = 'none';
  }
}

function initSupabaseUI() {
  const modal = document.getElementById('modal-supabase');
  const trigger = document.getElementById('btn-cloud-modal-trigger');
  const btnClose = document.getElementById('btn-close-supabase-modal');
  const btnCancel = document.getElementById('btn-cancel-supabase');
  const btnSave = document.getElementById('btn-save-supabase');
  const btnTest = document.getElementById('btn-test-supabase');
  const btnSync = document.getElementById('btn-sync-supabase');
  const btnDisconnect = document.getElementById('btn-disconnect-supabase');
  const inputUrl = document.getElementById('input-supabase-url');
  const inputKey = document.getElementById('input-supabase-key');
  const resultBox = document.getElementById('supabase-test-result');

  if (typeof SupabaseService !== 'undefined') {
    const creds = SupabaseService.getCredentials();
    if (inputUrl) inputUrl.value = creds.url;
    if (inputKey) inputKey.value = creds.key;
  }

  updateCloudBadgeUI();

  if (trigger && modal) {
    trigger.addEventListener('click', () => {
      if (typeof SupabaseService !== 'undefined') {
        const creds = SupabaseService.getCredentials();
        if (inputUrl) inputUrl.value = creds.url;
        if (inputKey) inputKey.value = creds.key;
      }
      if (resultBox) resultBox.style.display = 'none';
      updateCloudBadgeUI();
      modal.style.display = 'flex';
    });
  }

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const url = inputUrl.value.trim();
      const key = inputKey.value.trim();
      if (!url || !key) {
        showToast('⚠️ Ingresa URL y Anon Key primero');
        return;
      }
      btnTest.textContent = '⏳ Probando...';
      btnTest.disabled = true;

      const res = await SupabaseService.testConnection(url, key);
      btnTest.textContent = '🧪 Probar Conexión';
      btnTest.disabled = false;

      if (resultBox) {
        resultBox.style.display = 'block';
        if (res.success) {
          resultBox.style.background = 'rgba(16, 185, 129, 0.2)';
          resultBox.style.color = '#34d399';
          resultBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          resultBox.innerHTML = `✅ <strong>¡Conexión exitosa con Supabase!</strong> Se encontró la tabla <code>cierres</code> lista.`;
        } else {
          resultBox.style.background = 'rgba(244, 63, 94, 0.2)';
          resultBox.style.color = '#fb7185';
          resultBox.style.border = '1px solid rgba(244, 63, 94, 0.4)';
          resultBox.innerHTML = `❌ <strong>Error:</strong> ${res.error}. Recuerda ejecutar <code>supabase_schema.sql</code> en el SQL Editor de Supabase.`;
        }
      }
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const url = inputUrl.value.trim();
      const key = inputKey.value.trim();
      if (!url || !key) {
        showToast('⚠️ Debes ingresar la URL y la Anon Key');
        return;
      }

      btnSave.textContent = '⏳ Conectando...';
      btnSave.disabled = true;

      const testRes = await SupabaseService.testConnection(url, key);
      btnSave.textContent = '💾 Guardar y Conectar';
      btnSave.disabled = false;

      if (!testRes.success) {
        if (!confirm(`Hubo una advertencia al verificar conexión:\n${testRes.error}\n¿Deseas guardar las credenciales de todas formas?`)) {
          return;
        }
      }

      SupabaseService.setCredentials(url, key);
      updateCloudBadgeUI();
      showToast('🎉 ¡Supabase conectado con éxito!');
      closeModal();

      syncWithSupabase();
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.textContent = '⏳ Sincronizando...';
      btnSync.disabled = true;
      const count = await SupabaseService.syncLocalToCloud(AppState.closures);
      btnSync.textContent = '🔄 Sincronizar a Nube';
      btnSync.disabled = false;
      showToast(`☁️ ${count} cierres sincronizados con Supabase`);
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      if (confirm('¿Desconectar Supabase? La aplicación continuará funcionando en modo local sin borrar tus cierres.')) {
        SupabaseService.removeCredentials();
        if (inputUrl) inputUrl.value = '';
        if (inputKey) inputKey.value = '';
        updateCloudBadgeUI();
        showToast('Supabase desconectado. Modo Local activo.');
      }
    });
  }
}

async function syncWithSupabase() {
  if (typeof SupabaseService === 'undefined' || !SupabaseService.isConfigured()) {
    updateCloudBadgeUI();
    return;
  }

  try {
    const cloudClosures = await SupabaseService.fetchClosures();
    if (cloudClosures && cloudClosures.length > 0) {
      const mergedMap = new Map();
      (AppState.closures || []).forEach(c => mergedMap.set(c.id, c));
      cloudClosures.forEach(c => mergedMap.set(c.id, c));

      AppState.closures = Array.from(mergedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
      saveToStorage();
      renderConsolidadoView();
      renderHistoryTable();
      renderRecibosView();
      updateHeaderBadges();
    } else if (AppState.closures && AppState.closures.length > 0) {
      await SupabaseService.syncLocalToCloud(AppState.closures);
    }
    updateCloudBadgeUI();

    SupabaseService.subscribeRealtime((payload) => {
      console.log('Actualización Realtime de Supabase:', payload);
      SupabaseService.fetchClosures().then(freshData => {
        if (freshData) {
          AppState.closures = freshData;
          saveToStorage();
          renderConsolidadoView();
          renderHistoryTable();
          renderRecibosView();
          updateHeaderBadges();
          showToast('🔔 Actualización recibida de la nube');
        }
      });
    });
  } catch (err) {
    console.warn('Sincronización Supabase pausada:', err);
  }
}

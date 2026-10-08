// SysPrint TI — Frontend Logic, State Management & DataTable Engine

// State
let allPrinters = [];
let allStats = {};
let currentHardwareView = 'cards'; // 'cards' | 'table'
let currentHardwareCycle = null;

// Audit & DataTable State
let auditCycles = null;
let currentAuditCycle = 'current'; // 'current' | 'previous' | 'custom'
let auditStartDate = '';
let auditEndDate = '';
let auditPage = 1;
let auditPageSize = 50;
let auditTotalRows = 0;
let auditSortBy = 'time';
let auditSortDir = 'DESC';

// DOM Elements: Tabs
const tabHardware = document.getElementById('tabHardware');
const tabAudit = document.getElementById('tabAudit');
const viewHardware = document.getElementById('viewHardware');
const viewAudit = document.getElementById('viewAudit');
const badgeHardwareCount = document.getElementById('badgeHardwareCount');
const badgeAnomalyCount = document.getElementById('badgeAnomalyCount');

// DOM Elements: Hardware View
const kpiTotal = document.getElementById('kpiTotal');
const kpiOnline = document.getElementById('kpiOnline');
const kpiLowToner = document.getElementById('kpiLowToner');
const kpiOffline = document.getElementById('kpiOffline');
const kpiTotalPages = document.getElementById('kpiTotalPages');
const kpiTotalPagesSub = document.getElementById('kpiTotalPagesSub');
const kpiCriticalSub = document.getElementById('kpiCriticalSub');

const criticalBanner = document.getElementById('criticalBanner');
const bannerDesc = document.getElementById('bannerDesc');
const btnFilterCritical = document.getElementById('btnFilterCritical');

const searchInput = document.getElementById('searchInput');
const btnClearSearch = document.getElementById('btnClearSearch');
const selectUnit = document.getElementById('selectUnit');
const selectStatus = document.getElementById('selectStatus');
const selectType = document.getElementById('selectType');
const selectSort = document.getElementById('selectSort');

const btnViewCards = document.getElementById('btnViewCards');
const btnViewTable = document.getElementById('btnViewTable');
const printersGrid = document.getElementById('printersGrid');
const tableContainer = document.getElementById('tableContainer');
const printersTableBody = document.getElementById('printersTableBody');
const resultsCount = document.getElementById('resultsCount');

const btnRescan = document.getElementById('btnRescan');
const scanSpinIcon = document.getElementById('scanSpinIcon');
const scanBtnText = document.getElementById('scanBtnText');
const lastUpdatedText = document.getElementById('lastUpdatedText');
const btnExportCsv = document.getElementById('btnExportCsv');

// DOM Elements: Audit & DataTable View
const btnCycleCurrent = document.getElementById('btnCycleCurrent');
const btnCyclePrevious = document.getElementById('btnCyclePrevious');
const btnCycleCustom = document.getElementById('btnCycleCustom');
const labelCycleCurrent = document.getElementById('labelCycleCurrent');
const labelCyclePrevious = document.getElementById('labelCyclePrevious');
const customDatesContainer = document.getElementById('customDatesContainer');
const inputAuditStart = document.getElementById('auditStartDate');
const inputAuditEnd = document.getElementById('auditEndDate');
const btnApplyCustomDates = document.getElementById('btnApplyCustomDates');

const btnSyncPapercut = document.getElementById('btnSyncPapercut');
const syncPapercutSpinIcon = document.getElementById('syncPapercutSpinIcon');
const syncPapercutBtnText = document.getElementById('syncPapercutBtnText');
const btnExportAuditCsv = document.getElementById('btnExportAuditCsv');

const auditAnomalyBanner = document.getElementById('auditAnomalyBanner');
const anomalyBannerCount = document.getElementById('anomalyBannerCount');
const btnFilterAuditAnomalies = document.getElementById('btnFilterAuditAnomalies');
const cardAnomaliesKpi = document.getElementById('cardAnomaliesKpi');

const kpiAuditPages = document.getElementById('kpiAuditPages');
const kpiAuditPagesSub = document.getElementById('kpiAuditPagesSub');
const kpiAuditJobs = document.getElementById('kpiAuditJobs');
const kpiAuditUsersCount = document.getElementById('kpiAuditUsersCount');
const kpiAuditAnomalies = document.getElementById('kpiAuditAnomalies');
const kpiAuditColorRatio = document.getElementById('kpiAuditColorRatio');
const kpiAuditColorSub = document.getElementById('kpiAuditColorSub');

const auditSearchInput = document.getElementById('auditSearchInput');
const btnClearAuditSearch = document.getElementById('btnClearAuditSearch');
const selectAuditAnomaly = document.getElementById('selectAuditAnomaly');
const selectAuditUser = document.getElementById('selectAuditUser');
const selectAuditPrinter = document.getElementById('selectAuditPrinter');
const selectAuditClient = document.getElementById('selectAuditClient');

// DataTable Elements
const selectAuditPageSize = document.getElementById('selectAuditPageSize');
const auditResultsCount = document.getElementById('auditResultsCount');
const auditTableBody = document.getElementById('auditTableBody');
const btnAuditFirstPage = document.getElementById('btnAuditFirstPage');
const btnAuditPrevPage = document.getElementById('btnAuditPrevPage');
const btnAuditNextPage = document.getElementById('btnAuditNextPage');
const btnAuditLastPage = document.getElementById('btnAuditLastPage');
const auditPaginationInfo = document.getElementById('auditPaginationInfo');
const sortableHeaders = document.querySelectorAll('#auditDataTable th.sortable');

// Modal Elements
const printerModal = document.getElementById('printerModal');
const btnModalClose = document.getElementById('btnModalClose');
const btnModalClose2 = document.getElementById('btnModalClose2');
const modalPrinterName = document.getElementById('modalPrinterName');
const modalDriverName = document.getElementById('modalDriverName');
const modalUnitBadge = document.getElementById('modalUnitBadge');
const modalTypeBadge = document.getElementById('modalTypeBadge');
const modalIp = document.getElementById('modalIp');
const modalPort = document.getElementById('modalPort');
const modalSerial = document.getElementById('modalSerial');
const modalCycleCount = document.getElementById('modalCycleCount');
const modalLifeCount = document.getElementById('modalLifeCount');
const modalServerPath = document.getElementById('modalServerPath');
const modalSysDescr = document.getElementById('modalSysDescr');
const modalSuppliesList = document.getElementById('modalSuppliesList');
const btnOpenWebGui = document.getElementById('btnOpenWebGui');
const btnCopyServerPath = document.getElementById('btnCopyServerPath');

const toastContainer = document.getElementById('toastContainer');

// Utilities
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatNumber(num) {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString('pt-BR');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tab Switching
tabHardware.addEventListener('click', () => {
  tabHardware.classList.add('active');
  tabAudit.classList.remove('active');
  viewHardware.style.display = 'flex';
  viewAudit.style.display = 'none';
});

tabAudit.addEventListener('click', () => {
  tabAudit.classList.add('active');
  tabHardware.classList.remove('active');
  viewAudit.style.display = 'flex';
  viewHardware.style.display = 'none';
  if (!auditCycles) initAudit();
});

// ==========================================
// HARDWARE / FLEET MONITORING LOGIC
// ==========================================

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Falha ao obter estatísticas');
    allStats = await res.json();

    kpiTotal.textContent = allStats.total || 0;
    kpiOnline.textContent = allStats.online || 0;
    kpiLowToner.textContent = allStats.lowToner || 0;
    kpiOffline.textContent = allStats.offline || 0;
    kpiTotalPages.textContent = formatNumber(allStats.cycleTotalPages !== undefined ? allStats.cycleTotalPages : allStats.totalPages);
    if (kpiTotalPagesSub && allStats.cycleInfo) {
      kpiTotalPagesSub.textContent = allStats.cycleInfo.label;
    }
    kpiTotalPages.title = `Volume no ciclo atual: ${formatNumber(allStats.cycleTotalPages || 0)} págs | Total vitalício: ${formatNumber(allStats.totalPages || 0)} págs`;
    badgeHardwareCount.textContent = allStats.total || 53;

    if (allStats.criticalToner > 0) {
      kpiCriticalSub.textContent = `${allStats.criticalToner} em estado CRÍTICO (≤ 10%)`;
      criticalBanner.style.display = 'flex';
      bannerDesc.textContent = `Atenção: ${allStats.criticalToner} impressora(s) com toner abaixo de 10% e ${allStats.lowToner} em alerta preventivo.`;
    } else if (allStats.lowToner > 0) {
      kpiCriticalSub.textContent = `${allStats.lowToner} impressora(s) ≤ 20%`;
      criticalBanner.style.display = 'flex';
      bannerDesc.textContent = `Existem ${allStats.lowToner} impressoras com menos de 20% de toner necessitando de reposição preventiva.`;
    } else {
      kpiCriticalSub.textContent = 'Níveis estáveis';
      criticalBanner.style.display = 'none';
    }

    if (allStats.lastUpdated) {
      updateSyncTimeElement(allStats.lastUpdated);
    }

    setScanningState(allStats.isScanning);
  } catch (err) {
    console.error('Erro ao buscar estatísticas de hardware:', err);
  }
}

function updateSyncTimeElement(isoStr) {
  if (!lastUpdatedText) return;
  if (!isoStr) {
    lastUpdatedText.textContent = 'Aguardando telemetria';
    return;
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) {
    lastUpdatedText.textContent = 'Aguardando telemetria';
    return;
  }

  const now = new Date();
  const diffMinutes = Math.floor((now - d) / (60 * 1000));
  const dateStr = d.toLocaleDateString('pt-BR');
  const timeStr = d.toLocaleTimeString('pt-BR');

  lastUpdatedText.textContent = `Sincronizado: ${dateStr} às ${timeStr}`;

  if (diffMinutes > 30) {
    lastUpdatedText.title = `Atenção: última telemetria foi há mais de 30 minutos (${dateStr} às ${timeStr}). Clique em 'Atualizar Hardware' para varredura em tempo real.`;
    lastUpdatedText.classList.add('sync-time-stale');
  } else {
    lastUpdatedText.title = `Telemetria atualizada: ${dateStr} às ${timeStr}`;
    lastUpdatedText.classList.remove('sync-time-stale');
  }
}

async function fetchPrinters() {
  try {
    const res = await fetch('/api/printers');
    if (!res.ok) throw new Error('Falha ao listar impressoras');
    const data = await res.json();
    currentHardwareCycle = data.cycle || null;
    allPrinters = data.printers || [];
    if (data.timestamp) {
      updateSyncTimeElement(data.timestamp);
    }
    renderHardware();
  } catch (err) {
    console.error('Erro ao buscar lista de impressoras:', err);
    resultsCount.textContent = 'Erro ao carregar dados do servidor.';
  }
}

function getFilteredPrinters() {
  const q = searchInput.value.trim().toLowerCase();
  const unit = selectUnit.value;
  const status = selectStatus.value;
  const type = selectType.value;
  const sort = selectSort.value;

  let filtered = allPrinters.filter(p => {
    if (q) {
      const matchName = p.name && p.name.toLowerCase().includes(q);
      const matchIp = p.ip && p.ip.includes(q);
      const matchDriver = p.driverName && p.driverName.toLowerCase().includes(q);
      const matchUnit = p.unit && p.unit.toLowerCase().includes(q);
      const matchSerial = p.serialNumber && p.serialNumber.toLowerCase().includes(q);
      if (!matchName && !matchIp && !matchDriver && !matchUnit && !matchSerial) return false;
    }

    if (unit !== 'all' && p.unit !== unit) return false;
    if (status === 'ready' && !(p.isOnline && (p.status === 'ready' || p.status === 'normal'))) return false;
    if (status === 'low_toner' && !(p.status === 'low_toner' || p.status === 'critical_toner')) return false;
    if (status === 'critical' && p.status !== 'critical_toner') return false;
    if (status === 'offline' && p.isOnline) return false;
    if (type === 'color' && !p.isColor) return false;
    if (type === 'mono' && p.isColor) return false;

    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'name_asc') return a.name.localeCompare(b.name);
    if (sort === 'ip_asc') return (a.ip || '').localeCompare(b.ip || '');
    if (sort === 'pages_desc') return (b.cyclePages !== undefined ? b.cyclePages : 0) - (a.cyclePages !== undefined ? a.cyclePages : 0);

    const getMinToner = (p) => {
      const toners = [p.toners.black, p.toners.cyan, p.toners.magenta, p.toners.yellow].filter(v => v !== null);
      return toners.length ? Math.min(...toners) : 999;
    };

    if (sort === 'toner_asc') return getMinToner(a) - getMinToner(b);
    if (sort === 'toner_desc') return getMinToner(b) - getMinToner(a);

    return 0;
  });

  return filtered;
}

function renderHardware() {
  const list = getFilteredPrinters();
  resultsCount.textContent = `Exibindo ${list.length} de ${allPrinters.length} impressoras mapeadas`;

  if (currentHardwareView === 'cards') {
    printersGrid.style.display = 'grid';
    tableContainer.style.display = 'none';
    renderCards(list);
  } else {
    printersGrid.style.display = 'none';
    tableContainer.style.display = 'block';
    renderTable(list);
  }
}

function renderCards(list) {
  if (list.length === 0) {
    printersGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.1rem; font-weight: 600;">Nenhuma impressora encontrada</p>
        <p style="font-size: 0.85rem; margin-top: 0.35rem;">Tente ajustar os filtros ou a busca digitada.</p>
      </div>
    `;
    return;
  }

  printersGrid.innerHTML = list.map(p => {
    let statusClass = 'pill-ready';
    let cardBorderClass = 'status-border-ready';
    let statusLabel = 'Pronta';

    if (!p.isOnline) {
      statusClass = 'pill-offline';
      cardBorderClass = 'status-border-offline';
      statusLabel = 'Offline';
    } else if (p.status === 'critical_toner') {
      statusClass = 'pill-critical';
      cardBorderClass = 'status-border-critical';
      statusLabel = 'Toner Crítico';
    } else if (p.status === 'low_toner') {
      statusClass = 'pill-warning';
      cardBorderClass = 'status-border-warning';
      statusLabel = 'Toner Baixo';
    }

    let tonerHtml = '';
    if (!p.isOnline && !p.toners.black && !p.toners.cyan) {
      tonerHtml = `<div class="no-toner-data">Telemetria SNMP indisponível (Offline)</div>`;
    } else if (p.isColor) {
      tonerHtml = `
        <div class="toner-section">
          ${renderTonerBar('K', 'Preto', p.toners.black, 'bar-k', 'tag-k')}
          ${renderTonerBar('C', 'Ciano', p.toners.cyan, 'bar-c', 'tag-c')}
          ${renderTonerBar('M', 'Magenta', p.toners.magenta, 'bar-m', 'tag-m')}
          ${renderTonerBar('Y', 'Amarelo', p.toners.yellow, 'bar-y', 'tag-y')}
        </div>
      `;
    } else {
      const kLevel = p.toners.black !== null ? p.toners.black : null;
      tonerHtml = `
        <div class="toner-section">
          ${renderTonerBar('K', 'Toner Preto', kLevel, 'bar-k', 'tag-k')}
        </div>
      `;
    }

    const typeBadge = p.isColor 
      ? `<span class="badge badge-color">Colorida</span>` 
      : `<span class="badge badge-mono">Monocromática</span>`;

    const ipDisplay = p.ip 
      ? `<a href="http://${p.ip}" target="_blank" rel="noopener noreferrer" class="ip-link" title="Acessar interface web da impressora">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
           ${p.ip}
         </a>`
      : `<span class="text-muted">Sem IP</span>`;

    const cyclePagesNum = p.cyclePages !== undefined && p.cyclePages !== null ? p.cyclePages : 0;
    const lifePagesText = p.lifeCount !== null ? `${formatNumber(p.lifeCount)} págs` : 'N/A';
    const cycleLabelText = currentHardwareCycle ? currentHardwareCycle.label : 'Ciclo Vigente (21 a 20)';
    const pagesTooltip = `• Volume no ciclo (${cycleLabelText}): ${formatNumber(cyclePagesNum)} págs\n• Total vitalício (SNMP): ${lifePagesText}`;

    const hasLifeCount = p.lifeCount !== null;
    const pagesDisplay = hasLifeCount 
      ? `
        <div class="page-counter-rotator" title="${escapeHtml(pagesTooltip)}">
          <span class="counter-item counter-item-cycle">
            <span>${formatNumber(cyclePagesNum)} págs</span>
            <span class="counter-period">ciclo</span>
          </span>
          <span class="counter-item counter-item-total">
            <span>${formatNumber(p.lifeCount)} págs</span>
            <span class="counter-period period-total">vitalício</span>
          </span>
        </div>
      `
      : `
        <div class="page-counter-rotator static" title="${escapeHtml(pagesTooltip)}">
          <span class="counter-item static">
            <span>${formatNumber(cyclePagesNum)} págs</span>
            <span class="counter-period">ciclo</span>
          </span>
        </div>
      `;

    return `
      <article class="printer-card ${cardBorderClass}">
        <div>
          <div class="card-top">
            <div class="badge-group">
              <span class="badge badge-unit">${escapeHtml(p.unit || 'Outros')}</span>
              ${typeBadge}
            </div>
            <div class="status-pill ${statusClass}">
              <span class="status-dot"></span>
              <span>${statusLabel}</span>
            </div>
          </div>

          <div class="card-header">
            <h3 class="printer-title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>
            <p class="printer-driver" title="${escapeHtml(p.driverName || '')}">${escapeHtml(p.driverName || 'Driver Padrão')}</p>
          </div>

          <div class="card-network">
            ${ipDisplay}
            ${pagesDisplay}
          </div>

          ${tonerHtml}

          ${p.lastChecked ? `
            <div class="card-telemetry-meta">
              <span class="meta-checked" title="Última leitura SNMP: ${new Date(p.lastChecked).toLocaleString('pt-BR')}">
                Leitura: ${new Date(p.lastChecked).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ` : ''}
        </div>

        <div class="card-actions">
          <button class="btn btn-secondary btn-card" onclick="openDetails('${p.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Ver Peças & Detalhes
          </button>
          ${p.ip ? `
            <a href="http://${p.ip}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-card" title="Abrir página interna da impressora">
              Console Web
            </a>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderTonerBar(tag, label, percent, barClass, tagClass) {
  if (percent === null || percent === undefined) {
    return `
      <div class="toner-row" title="${label}: Nível não reportado">
        <span class="toner-tag ${tagClass}">${tag}</span>
        <div class="toner-track">
          <div class="toner-bar" style="width: 0%;"></div>
        </div>
        <span class="toner-pct text-muted">--</span>
      </div>
    `;
  }

  let alertBarClass = '';
  let alertPctClass = '';
  if (percent <= 10) {
    alertBarClass = 'bar-critical';
    alertPctClass = 'pct-critical';
  } else if (percent <= 20) {
    alertBarClass = 'bar-warning';
    alertPctClass = 'pct-warning';
  }

  return `
    <div class="toner-row" title="${label}: ${percent}% restante">
      <span class="toner-tag ${tagClass}">${tag}</span>
      <div class="toner-track">
        <div class="toner-bar ${barClass} ${alertBarClass}" style="width: ${percent}%;"></div>
      </div>
      <span class="toner-pct ${alertPctClass}">${percent}%</span>
    </div>
  `;
}

function renderTable(list) {
  printersTableBody.innerHTML = list.map(p => {
    let statusClass = 'pill-ready';
    let statusLabel = 'Pronta';
    if (!p.isOnline) {
      statusClass = 'pill-offline';
      statusLabel = 'Offline';
    } else if (p.status === 'critical_toner') {
      statusClass = 'pill-critical';
      statusLabel = 'Crítico';
    } else if (p.status === 'low_toner') {
      statusClass = 'pill-warning';
      statusLabel = 'Alerta';
    }

    let tonersSummary = [];
    if (p.toners.black !== null) tonersSummary.push(`K: ${p.toners.black}%`);
    if (p.toners.cyan !== null) tonersSummary.push(`C: ${p.toners.cyan}%`);
    if (p.toners.magenta !== null) tonersSummary.push(`M: ${p.toners.magenta}%`);
    if (p.toners.yellow !== null) tonersSummary.push(`Y: ${p.toners.yellow}%`);
    const tonerText = tonersSummary.length ? tonersSummary.join(' | ') : '<span class="text-muted">N/A</span>';

    return `
      <tr>
        <td>
          <span class="status-pill ${statusClass}">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </td>
        <td>
          <strong>${escapeHtml(p.name)}</strong>
          <div class="text-small text-muted">${escapeHtml(p.driverName || '')}</div>
        </td>
        <td>${escapeHtml(p.unit || 'Outros')}</td>
        <td class="mono">
          ${p.ip ? `<a href="http://${p.ip}" target="_blank" class="ip-link">${p.ip}</a>` : '-'}
        </td>
        <td class="mono">${tonerText}</td>
        <td class="mono" title="Total vitalício (SNMP): ${p.lifeCount ? formatNumber(p.lifeCount) : 'N/A'} págs">
          ${formatNumber(p.cyclePages !== undefined && p.cyclePages !== null ? p.cyclePages : 0)} págs
        </td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="openDetails('${p.id}')">Detalhes</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openDetails = function(printerId) {
  const p = allPrinters.find(item => item.id === printerId);
  if (!p) return;

  modalPrinterName.textContent = p.name;
  modalDriverName.textContent = p.driverName || 'Driver Padrão';
  modalUnitBadge.textContent = p.unit || 'Geral';
  modalTypeBadge.textContent = p.isColor ? 'Colorida (CMYK)' : 'Monocromática (P&B)';

  modalIp.textContent = p.ip || 'N/A';
  modalPort.textContent = p.portName || 'N/A';
  modalSerial.textContent = p.serialNumber || 'Não identificado';
  if (modalCycleCount) {
    const cycleLabelText = currentHardwareCycle ? currentHardwareCycle.label : 'Ciclo Vigente';
    modalCycleCount.textContent = `${formatNumber(p.cyclePages !== undefined && p.cyclePages !== null ? p.cyclePages : 0)} págs`;
    modalCycleCount.title = cycleLabelText;
  }
  modalLifeCount.textContent = p.lifeCount !== null ? `${formatNumber(p.lifeCount)} páginas impressas` : 'N/A';
  modalServerPath.textContent = p.serverPath;
  modalSysDescr.textContent = p.sysDescr || 'Sem dados de firmware';

  if (p.ip) {
    btnOpenWebGui.href = `http://${p.ip}`;
    btnOpenWebGui.style.display = 'inline-flex';
  } else {
    btnOpenWebGui.style.display = 'none';
  }

  if (p.supplies && p.supplies.length > 0) {
    modalSuppliesList.innerHTML = p.supplies.map(s => {
      let pctText = s.percent !== null ? `${s.percent}%` : 'N/A';
      let pctClass = '';
      if (s.percent !== null && s.percent <= 10) pctClass = 'pct-critical';
      else if (s.percent !== null && s.percent <= 20) pctClass = 'pct-warning';

      let barColor = '#64748b';
      if (s.color === 'cyan') barColor = 'var(--cmyk-c-light)';
      if (s.color === 'magenta') barColor = 'var(--cmyk-m-light)';
      if (s.color === 'yellow') barColor = 'var(--cmyk-y-light)';
      if (s.color === 'black') barColor = '#64748b';
      if (s.percent !== null && s.percent <= 10) barColor = 'var(--status-critical)';
      else if (s.percent !== null && s.percent <= 20) barColor = 'var(--status-warning)';

      return `
        <div class="supply-item">
          <div class="supply-header">
            <span class="supply-name">${escapeHtml(s.name)}</span>
            <span class="supply-pct ${pctClass}">${pctText}</span>
          </div>
          <div class="toner-track">
            <div class="toner-bar" style="width: ${s.percent !== null ? s.percent : 0}%; background-color: ${barColor};"></div>
          </div>
          <div class="text-small text-muted">
            Capacidade: ${s.maxCapacity > 0 ? formatNumber(s.maxCapacity) : 'N/D'} | Nível bruto: ${s.currentLevel >= 0 ? formatNumber(s.currentLevel) : 'OK'}
          </div>
        </div>
      `;
    }).join('');
  } else {
    modalSuppliesList.innerHTML = `
      <div class="text-muted" style="padding: 1rem 0; font-size: 0.85rem;">
        Nenhuma peça de reposição ou nível de consumível disponível via SNMP no momento.
      </div>
    `;
  }

  printerModal.style.display = 'flex';
};

function closeModal() {
  printerModal.style.display = 'none';
}
btnModalClose.addEventListener('click', closeModal);
btnModalClose2.addEventListener('click', closeModal);
printerModal.addEventListener('click', (e) => {
  if (e.target === printerModal) closeModal();
});

btnCopyServerPath.addEventListener('click', () => {
  const text = modalServerPath.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Caminho copiado: ${text}`);
  });
});

async function handleRescan() {
  try {
    setScanningState(true);
    showToast('Iniciando varredura em tempo real via SNMP...');

    const res = await fetch('/api/scan', { method: 'POST' });
    if (!res.ok) throw new Error('Não foi possível iniciar varredura');

    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/status');
        const statusData = await statusRes.json();
        if (!statusData.isScanning) {
          clearInterval(interval);
          setScanningState(false);
          await fetchStats();
          await fetchPrinters();
          showToast('Varredura do parque concluída com sucesso!');
        }
      } catch (_) {
        clearInterval(interval);
        setScanningState(false);
      }
    }, 1500);
  } catch (err) {
    console.error('Erro na varredura:', err);
    setScanningState(false);
    showToast('Erro ao disparar varredura.', 'error');
  }
}

function setScanningState(scanning) {
  if (scanning) {
    scanSpinIcon.classList.add('spinning');
    scanBtnText.textContent = 'Varrendo...';
    btnRescan.disabled = true;
  } else {
    scanSpinIcon.classList.remove('spinning');
    scanBtnText.textContent = 'Atualizar Hardware';
    btnRescan.disabled = false;
  }
}

btnRescan.addEventListener('click', handleRescan);

btnFilterCritical.addEventListener('click', () => {
  selectStatus.value = 'low_toner';
  renderHardware();
});

document.querySelectorAll('.kpi-card[data-filter]').forEach(card => {
  card.addEventListener('click', () => {
    const filter = card.getAttribute('data-filter');
    selectStatus.value = filter;
    renderHardware();
  });
});

searchInput.addEventListener('input', () => {
  btnClearSearch.style.display = searchInput.value ? 'block' : 'none';
  renderHardware();
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  renderHardware();
});

selectUnit.addEventListener('change', renderHardware);
selectStatus.addEventListener('change', renderHardware);
selectType.addEventListener('change', renderHardware);
selectSort.addEventListener('change', renderHardware);

btnViewCards.addEventListener('click', () => {
  currentHardwareView = 'cards';
  btnViewCards.classList.add('active');
  btnViewTable.classList.remove('active');
  renderHardware();
});

btnViewTable.addEventListener('click', () => {
  currentHardwareView = 'table';
  btnViewTable.classList.add('active');
  btnViewCards.classList.remove('active');
  renderHardware();
});

// Utilitário de Download de Arquivo Blob com Delay Seguro de Revogação de URL
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  // Aguarda 4 segundos antes de revogar para permitir que o navegador finalize o arquivo com nome e extensão
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 4000);
}

btnExportCsv.addEventListener('click', () => {
  const list = getFilteredPrinters();
  if (list.length === 0) {
    showToast('Nenhum dado para exportar.');
    return;
  }
  const headers = ['Nome da Fila', 'Unidade', 'IP', 'Modelo Driver', 'Status', 'Toner K (%)', 'Toner C (%)', 'Toner M (%)', 'Toner Y (%)', 'Páginas no Ciclo', 'Total Vitalício', 'Número de Série', 'Caminho Windows'];
  const rows = list.map(p => [
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${(p.unit || '').replace(/"/g, '""')}"`,
    `"${p.ip || ''}"`,
    `"${(p.driverName || '').replace(/"/g, '""')}"`,
    `"${p.statusText || ''}"`,
    p.toners.black !== null ? p.toners.black : '',
    p.toners.cyan !== null ? p.toners.cyan : '',
    p.toners.magenta !== null ? p.toners.magenta : '',
    p.toners.yellow !== null ? p.toners.yellow : '',
    p.cyclePages !== undefined && p.cyclePages !== null ? p.cyclePages : 0,
    p.lifeCount !== null ? p.lifeCount : '',
    `"${(p.serialNumber || '').replace(/"/g, '""')}"`,
    `"${(p.serverPath || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const filename = `relatorio-parque-impressoras-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
  showToast('Relatório de Parque exportado com sucesso!');
});


// ==========================================
// PAPERCUT AUDIT & DATATABLE LOGIC
// ==========================================

async function initAudit() {
  try {
    const res = await fetch('/api/papercut/cycles');
    if (!res.ok) throw new Error('Falha ao obter ciclos');
    auditCycles = await res.json();

    labelCycleCurrent.textContent = `${formatDateShort(auditCycles.current.startDate)} a ${formatDateShort(auditCycles.current.endDate)}`;
    labelCyclePrevious.textContent = `${formatDateShort(auditCycles.previous.startDate)} a ${formatDateShort(auditCycles.previous.endDate)}`;

    auditStartDate = auditCycles.current.startDate;
    auditEndDate = auditCycles.current.endDate;
    inputAuditStart.value = auditStartDate;
    inputAuditEnd.value = auditEndDate;

    setupDataTableHeaders();
    await loadAuditFilters();
    await loadAuditStats();
    await loadAuditJobs();
  } catch (err) {
    console.error('Erro ao inicializar auditoria:', err);
  }
}

function formatDateShort(isoDate) {
  const parts = isoDate.split('-');
  return `${parts[2]}/${parts[1]}`;
}

// Set table sorting column and direction programmatically or by click
function setTableSort(col, dir = 'DESC') {
  auditSortBy = col;
  auditSortDir = dir;

  sortableHeaders.forEach(h => {
    h.classList.remove('active-sort', 'asc', 'desc');
    const icon = h.querySelector('.sort-icon');
    if (icon) icon.textContent = '⇅';
    if (h.getAttribute('data-sort') === col) {
      h.classList.add('active-sort', dir.toLowerCase());
      if (icon) icon.textContent = dir === 'ASC' ? '▲' : '▼';
    }
  });
}

// Setup clickable sort headers on DataTable
function setupDataTableHeaders() {
  sortableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      let dir;
      if (auditSortBy === col) {
        dir = auditSortDir === 'ASC' ? 'DESC' : 'ASC';
      } else {
        dir = (col === 'time' || col === 'pages' || col === 'copies' || col === 'total_pages') ? 'DESC' : 'ASC';
      }

      setTableSort(col, dir);
      auditPage = 1;
      loadAuditJobs();
    });
  });
}

async function loadAuditFilters() {
  try {
    const res = await fetch(`/api/papercut/filters?start=${auditStartDate}&end=${auditEndDate}`);
    if (!res.ok) return;
    const filters = await res.json();

    selectAuditUser.innerHTML = '<option value="all">Todos os Usuários</option>' + 
      (filters.users || []).map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');

    selectAuditPrinter.innerHTML = '<option value="all">Todas as Impressoras</option>' + 
      (filters.printers || []).map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

    selectAuditClient.innerHTML = '<option value="all">Todos os Terminais</option>' + 
      (filters.clients || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  } catch (err) {
    console.error('Erro ao carregar filtros da auditoria:', err);
  }
}

async function loadAuditStats() {
  try {
    const res = await fetch(`/api/papercut/stats?start=${auditStartDate}&end=${auditEndDate}`);
    if (!res.ok) throw new Error('Falha ao carregar métricas de auditoria');
    const data = await res.json();
    const s = data.summary || {};

    kpiAuditPages.textContent = formatNumber(s.totalPages || 0);
    kpiAuditJobs.textContent = formatNumber(s.totalJobs || 0);
    kpiAuditUsersCount.textContent = `${s.distinctUsers || 0} usuários ativos`;
    kpiAuditAnomalies.textContent = formatNumber(s.totalAnomalies || 0);
    badgeAnomalyCount.textContent = s.totalAnomalies || 0;

    const totalPages = s.totalPages || 1;
    const colorPct = Math.round(((s.colorPages || 0) / totalPages) * 100);
    kpiAuditColorRatio.textContent = `${colorPct}% Cor`;
    if (kpiAuditColorSub) {
      kpiAuditColorSub.textContent = `${formatNumber(s.colorPages || 0)} pág coloridas vs ${formatNumber(s.monoPages || 0)} P&B`;
    }

    if (s.totalAnomalies > 0) {
      auditAnomalyBanner.style.display = 'flex';
      anomalyBannerCount.textContent = `${s.totalAnomalies} impressões atípicas identificadas no ciclo (${formatDateShort(auditStartDate)} a ${formatDateShort(auditEndDate)})`;
    } else {
      auditAnomalyBanner.style.display = 'none';
    }
  } catch (err) {
    console.error('Erro ao buscar estatísticas de auditoria:', err);
  }
}

async function loadAuditJobs() {
  const onlyAnomalies = selectAuditAnomaly.value === 'only_anomalies' ? 1 : 0;
  const user = selectAuditUser.value;
  const printer = selectAuditPrinter.value;
  const client = selectAuditClient.value;
  const q = auditSearchInput.value.trim();
  const offset = (auditPage - 1) * auditPageSize;

  auditResultsCount.textContent = 'Carregando registros...';

  try {
    const params = new URLSearchParams({
      start: auditStartDate,
      end: auditEndDate,
      onlyAnomalies: onlyAnomalies,
      user: user,
      printer: printer,
      client: client,
      q: q,
      sortBy: auditSortBy,
      sortDir: auditSortDir,
      limit: auditPageSize,
      offset: offset
    });

    const res = await fetch(`/api/papercut/jobs?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao consultar trabalhos de impressão');
    const data = await res.json();

    auditTotalRows = data.total;
    const totalPages = Math.ceil(auditTotalRows / auditPageSize) || 1;

    const fromRow = auditTotalRows === 0 ? 0 : offset + 1;
    const toRow = Math.min(offset + auditPageSize, auditTotalRows);

    auditResultsCount.textContent = `Exibindo ${fromRow} a ${toRow} de ${formatNumber(auditTotalRows)} registros`;
    auditPaginationInfo.textContent = `Página ${auditPage} de ${totalPages}`;

    btnAuditFirstPage.disabled = auditPage <= 1;
    btnAuditPrevPage.disabled = auditPage <= 1;
    btnAuditNextPage.disabled = auditPage >= totalPages;
    btnAuditLastPage.disabled = auditPage >= totalPages;

    renderAuditTable(data.jobs || []);
  } catch (err) {
    console.error('Erro ao listar trabalhos de impressão:', err);
    auditResultsCount.textContent = 'Erro ao consultar histórico.';
  }
}

function renderAuditTable(jobs) {
  if (jobs.length === 0) {
    auditTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          Nenhum registro encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  auditTableBody.innerHTML = jobs.map(j => {
    const isAnomaly = j.is_anomaly === 1;
    const rowClass = isAnomaly ? 'row-anomaly' : '';

    const isColor = j.grayscale !== 'GRAYSCALE';
    const isDuplex = j.duplex === 'DUPLEX';
    const formatBadge = `
      <span class="format-tag ${isColor ? 'tag-color' : 'tag-mono'}">
        ${isColor ? 'Cor' : 'P&B'} • ${isDuplex ? 'F/V' : 'Simp'}
      </span>
    `;

    const reasonsText = (j.reasons && j.reasons.length) ? j.reasons.join(' | ') : '';
    const rowTitle = isAnomaly ? `⚠️ Alerta de Auditoria TI: ${reasonsText}` : '';

    return `
      <tr class="${rowClass}" ${rowTitle ? `title="${escapeHtml(rowTitle)}"` : ''}>
        <td class="mono col-time" title="${escapeHtml(j.time)}">${j.time.slice(0, 16)}</td>
        <td class="col-user" title="${escapeHtml(j.user)}"><strong style="color: #38bdf8;">${escapeHtml(j.user)}</strong></td>
        <td class="mono col-pages text-center font-bold">${j.pages}</td>
        <td class="mono col-copies text-center">${j.copies}</td>
        <td class="mono col-total text-center font-bold" style="${isAnomaly || j.total_pages >= 30 ? 'color: var(--status-critical); font-size: 0.95rem; font-weight: 800;' : ''}">
          ${j.total_pages} ${isAnomaly ? `<span style="font-size: 0.78rem; cursor: help;" title="${escapeHtml(reasonsText)}">⚠️</span>` : ''}
        </td>
        <td class="col-printer" title="${escapeHtml(j.printer)}">${escapeHtml(j.printer)}</td>
        <td class="mono col-client text-small" title="${escapeHtml(j.client || '-')}">${escapeHtml(j.client || '-')}</td>
        <td class="col-doc" title="${escapeHtml(j.document_name || '(Sem nome)')}${isAnomaly ? ` — Motivo: ${escapeHtml(reasonsText)}` : ''}">
          <span class="doc-name">${escapeHtml(j.document_name || '(Sem título)')}</span>
        </td>
        <td class="col-format text-center">${formatBadge}</td>
      </tr>
    `;
  }).join('');
}

// Cycle Selectors
btnCycleCurrent.addEventListener('click', () => {
  btnCycleCurrent.classList.add('active');
  btnCyclePrevious.classList.remove('active');
  btnCycleCustom.classList.remove('active');
  customDatesContainer.style.display = 'none';

  auditStartDate = auditCycles.current.startDate;
  auditEndDate = auditCycles.current.endDate;
  auditPage = 1;
  loadAuditFilters();
  loadAuditStats();
  loadAuditJobs();
});

btnCyclePrevious.addEventListener('click', () => {
  btnCyclePrevious.classList.add('active');
  btnCycleCurrent.classList.remove('active');
  btnCycleCustom.classList.remove('active');
  customDatesContainer.style.display = 'none';

  auditStartDate = auditCycles.previous.startDate;
  auditEndDate = auditCycles.previous.endDate;
  auditPage = 1;
  loadAuditFilters();
  loadAuditStats();
  loadAuditJobs();
});

btnCycleCustom.addEventListener('click', () => {
  btnCycleCustom.classList.add('active');
  btnCycleCurrent.classList.remove('active');
  btnCyclePrevious.classList.remove('active');
  customDatesContainer.style.display = 'flex';
});

btnApplyCustomDates.addEventListener('click', () => {
  if (!inputAuditStart.value || !inputAuditEnd.value) {
    showToast('Selecione as datas de início e fim.');
    return;
  }
  auditStartDate = inputAuditStart.value;
  auditEndDate = inputAuditEnd.value;
  auditPage = 1;
  loadAuditFilters();
  loadAuditStats();
  loadAuditJobs();
});

function filterAnomaliesByCriticality() {
  selectAuditAnomaly.value = 'only_anomalies';
  setTableSort('total_pages', 'DESC');
  auditPage = 1;
  loadAuditJobs();

  // Scroll suave até o topo da tabela
  const tableTarget = document.getElementById('auditTableContainer') || document.querySelector('.datatable-toolbar');
  if (tableTarget) {
    tableTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast('Filtrando anomalias ordenadas por maior criticidade (volume de páginas)');
}

if (cardAnomaliesKpi) {
  cardAnomaliesKpi.addEventListener('click', filterAnomaliesByCriticality);
  cardAnomaliesKpi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      filterAnomaliesByCriticality();
    }
  });
}

if (btnFilterAuditAnomalies) {
  btnFilterAuditAnomalies.addEventListener('click', filterAnomaliesByCriticality);
}

// DataTable Controls
selectAuditPageSize.addEventListener('change', () => {
  auditPageSize = parseInt(selectAuditPageSize.value, 10);
  auditPage = 1;
  loadAuditJobs();
});

selectAuditAnomaly.addEventListener('change', () => { auditPage = 1; loadAuditJobs(); });
selectAuditUser.addEventListener('change', () => { auditPage = 1; loadAuditJobs(); });
selectAuditPrinter.addEventListener('change', () => { auditPage = 1; loadAuditJobs(); });
selectAuditClient.addEventListener('change', () => { auditPage = 1; loadAuditJobs(); });

auditSearchInput.addEventListener('input', () => {
  btnClearAuditSearch.style.display = auditSearchInput.value ? 'block' : 'none';
  auditPage = 1;
  loadAuditJobs();
});

btnClearAuditSearch.addEventListener('click', () => {
  auditSearchInput.value = '';
  btnClearAuditSearch.style.display = 'none';
  auditPage = 1;
  loadAuditJobs();
});

btnAuditFirstPage.addEventListener('click', () => {
  if (auditPage > 1) {
    auditPage = 1;
    loadAuditJobs();
  }
});

btnAuditPrevPage.addEventListener('click', () => {
  if (auditPage > 1) {
    auditPage--;
    loadAuditJobs();
  }
});

btnAuditNextPage.addEventListener('click', () => {
  const totalPages = Math.ceil(auditTotalRows / auditPageSize);
  if (auditPage < totalPages) {
    auditPage++;
    loadAuditJobs();
  }
});

btnAuditLastPage.addEventListener('click', () => {
  const totalPages = Math.ceil(auditTotalRows / auditPageSize);
  if (auditPage < totalPages) {
    auditPage = totalPages;
    loadAuditJobs();
  }
});

// Sync PaperCut
async function handlePapercutSync() {
  try {
    syncPapercutSpinIcon.classList.add('spinning');
    syncPapercutBtnText.textContent = 'Sincronizando...';
    btnSyncPapercut.disabled = true;
    showToast('Sincronizando logs recentes do PaperCut com o banco de dados...');

    const res = await fetch('/api/papercut/sync', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao iniciar sincronização');

    setTimeout(async () => {
      syncPapercutSpinIcon.classList.remove('spinning');
      syncPapercutBtnText.textContent = 'Sincronizar Logs';
      btnSyncPapercut.disabled = false;
      await loadAuditStats();
      await loadAuditJobs();
      showToast('Logs do PaperCut sincronizados com sucesso!');
    }, 3000);
  } catch (err) {
    syncPapercutSpinIcon.classList.remove('spinning');
    syncPapercutBtnText.textContent = 'Sincronizar Logs';
    btnSyncPapercut.disabled = false;
    showToast('Erro ao sincronizar PaperCut.', 'error');
  }
}
btnSyncPapercut.addEventListener('click', handlePapercutSync);

// Export Audit Report
btnExportAuditCsv.addEventListener('click', async () => {
  const onlyAnomalies = selectAuditAnomaly.value === 'only_anomalies' ? 1 : 0;
  const user = selectAuditUser.value;
  const printer = selectAuditPrinter.value;
  const client = selectAuditClient.value;
  const q = auditSearchInput.value.trim();

  let url = `/api/papercut/export?start=${encodeURIComponent(auditStartDate)}&end=${encodeURIComponent(auditEndDate)}&onlyAnomalies=${onlyAnomalies}`;
  if (user && user !== 'all') url += `&user=${encodeURIComponent(user)}`;
  if (printer && printer !== 'all') url += `&printer=${encodeURIComponent(printer)}`;
  if (client && client !== 'all') url += `&client=${encodeURIComponent(client)}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;

  const filename = `fechamento-papercut-${auditStartDate}-a-${auditEndDate}${onlyAnomalies ? '-anomalias' : ''}.csv`;

  showToast('Gerando relatório de fechamento em CSV...');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha no servidor (${res.status})`);
    const blob = await res.blob();
    downloadBlob(blob, filename);
    showToast('Download do fechamento concluído com sucesso!');
  } catch (err) {
    console.error('Erro ao exportar fechamento:', err);
    showToast('Erro ao exportar CSV: ' + err.message);
  }
});

// Status de Infraestrutura
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      const el = document.getElementById('headerServerInfo');
      if (el && data.serverHost) {
        el.textContent = `${data.serverName || 'SRV-TS'} (${data.serverHost})`;
      }
    }
  } catch (_) {}
}

// Initialization
async function init() {
  await fetchStatus();
  await fetchStats();
  await fetchPrinters();
  initAudit();

  setInterval(() => {
    fetchStats();
    fetchPrinters();
  }, 30000);
}

init();

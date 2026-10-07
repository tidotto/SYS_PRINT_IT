const fs = require('fs');
const path = require('path');
const config = require('./config');
const { sendDailyReport, sendStatusChangeAlert } = require('./emailService');

const STATE_FILE = path.join(__dirname, 'data', 'printer-alert-state.json');

// Estados considerados problemáticos
const ALERT_STATUSES = new Set(['critical_toner', 'low_toner', 'offline', 'error', 'unreachable_snmp']);

let state = {
  lastDailyReportDate: null,
  isInitialized: false,
  printers: {} // id -> { name, unit, ip, status, statusText, isOnline, inAlert, consecutiveOffline, toners, lastUpdated }
};

/**
 * Carrega o estado persistido do disco
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = {
        lastDailyReportDate: parsed.lastDailyReportDate || null,
        isInitialized: parsed.isInitialized || false,
        printers: parsed.printers || {}
      };
      console.log(`[AlertManager] Estado anterior carregado (${Object.keys(state.printers).length} impressoras).`);
    }
  } catch (err) {
    console.warn('[AlertManager] Falha ao ler arquivo de estado, iniciando novo:', err.message);
  }
}

/**
 * Salva o estado atual no disco
 */
function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[AlertManager] Falha ao salvar estado:', err.message);
  }
}

/**
 * Identifica o menor percentual de toner de uma impressora
 */
function getMinTonerPercent(printer) {
  if (!printer.toners) return null;
  const values = [
    printer.toners.black,
    printer.toners.cyan,
    printer.toners.magenta,
    printer.toners.yellow
  ].filter(v => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return Math.min(...values);
}

/**
 * Formata detalhes de toner para exibição
 */
function getTonerSummary(printer) {
  if (!printer.toners) return '';
  const items = [];
  if (printer.toners.black !== null) items.push(`K: ${printer.toners.black}%`);
  if (printer.toners.cyan !== null) items.push(`C: ${printer.toners.cyan}%`);
  if (printer.toners.magenta !== null) items.push(`M: ${printer.toners.magenta}%`);
  if (printer.toners.yellow !== null) items.push(`Y: ${printer.toners.yellow}%`);
  return items.join(', ');
}

/**
 * Avalia o resultado de uma varredura para identificar alterações de status
 * @param {Array} currentPrinters Lista de impressoras retornadas pelo scanner
 */
async function processScanResults(currentPrinters) {
  if (!currentPrinters || currentPrinters.length === 0) return;

  const changes = [];
  const now = new Date().toISOString();

  // Primeira execução: inicializa a base sem disparar falso alerta de massa
  if (!state.isInitialized) {
    console.log('[AlertManager] Inicializando baseline de status das impressoras...');
    for (const p of currentPrinters) {
      const inAlert = ALERT_STATUSES.has(p.status) || !p.isOnline;
      state.printers[p.id] = {
        name: p.name,
        unit: p.unit,
        ip: p.ip,
        status: p.status,
        statusText: p.statusText,
        isOnline: p.isOnline,
        inAlert,
        consecutiveOffline: p.isOnline ? 0 : 1,
        minToner: getMinTonerPercent(p),
        toners: p.toners,
        lastUpdated: now
      };
    }
    state.isInitialized = true;
    saveState();
    return;
  }

  for (const current of currentPrinters) {
    const id = current.id;
    const prev = state.printers[id];
    const isCurrentlyAlert = ALERT_STATUSES.has(current.status) || !current.isOnline;
    const currentMinToner = getMinTonerPercent(current);

    if (!prev) {
      // Nova impressora cadastrada na rede
      state.printers[id] = {
        name: current.name,
        unit: current.unit,
        ip: current.ip,
        status: current.status,
        statusText: current.statusText,
        isOnline: current.isOnline,
        inAlert: isCurrentlyAlert,
        consecutiveOffline: current.isOnline ? 0 : 1,
        minToner: currentMinToner,
        toners: current.toners,
        lastUpdated: now
      };
      continue;
    }

    // Controle de flapping para impressoras offline
    let confirmedOffline = false;
    if (!current.isOnline) {
      prev.consecutiveOffline = (prev.consecutiveOffline || 0) + 1;
      // Exige 2 varreduras com falha para confirmar offline e evitar falso positivo
      if (prev.consecutiveOffline >= 2) {
        confirmedOffline = true;
      }
    } else {
      prev.consecutiveOffline = 0;
    }

    // CASO 1: Entrou em ALERTA (estava normal ou mudou para pior)
    if (isCurrentlyAlert) {
      const isNewAlert = !prev.inAlert;
      const isEscalation = prev.status === 'low_toner' && current.status === 'critical_toner';
      const isNewOffline = !prev.isOnline && confirmedOffline && prev.status !== 'offline';

      if (isNewAlert || isEscalation || (isNewOffline && prev.inAlert && prev.isOnline)) {
        let details = current.statusText;
        if (current.status.includes('toner')) {
          details = `Nível de Toner: ${getTonerSummary(current)}`;
        } else if (!current.isOnline) {
          details = 'Sem comunicação SNMP / Spooler Offline';
        }

        changes.push({
          printer: current,
          type: 'ALERT',
          previousStatus: prev.status,
          previousStatusText: prev.statusText,
          newStatus: current.status,
          newStatusText: current.statusText,
          details
        });

        prev.inAlert = true;
      }
    } 
    // CASO 2: PROBLEMA RESOLVIDO (estava em alerta e voltou para normal/pronta)
    else if (prev.inAlert && !isCurrentlyAlert && current.isOnline) {
      let details = 'Equipamento restabelecido e operando normalmente';
      if (prev.status.includes('toner')) {
        details = `Toner substituído com sucesso (${getTonerSummary(current)})`;
      } else if (!prev.isOnline) {
        details = 'Comunicação restaurada (Impressora Online)';
      }

      changes.push({
        printer: current,
        type: 'RESOLVED',
        previousStatus: prev.status,
        previousStatusText: prev.statusText,
        newStatus: current.status,
        newStatusText: current.statusText,
        details
      });

      prev.inAlert = false;
    }

    // Atualiza o estado salvo da impressora
    prev.name = current.name;
    prev.unit = current.unit;
    prev.ip = current.ip;
    prev.status = current.status;
    prev.statusText = current.statusText;
    prev.isOnline = current.isOnline;
    prev.minToner = currentMinToner;
    prev.toners = current.toners;
    prev.lastUpdated = now;
  }

  saveState();

  // Se houver mudanças, dispara o e-mail de notificação em tempo real
  if (changes.length > 0) {
    console.log(`[AlertManager] Detectadas ${changes.length} alterações de status. Disparando notificação...`);
    await sendStatusChangeAlert(changes);
  }
}

/**
 * Verifica se já é o horário do relatório diário (08:00) e executa
 */
async function checkDailySchedule(printers) {
  if (!config.email.enabled || !printers || printers.length === 0) return;

  const now = new Date();
  // Formato HH:MM
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  // Formato YYYY-MM-DD
  const todayStr = now.toISOString().split('T')[0];

  const targetTime = config.email.dailyReportTime || '08:00';

  if (currentTime === targetTime && state.lastDailyReportDate !== todayStr) {
    console.log(`[AlertManager] Disparando relatório matinal das ${targetTime} para o dia ${todayStr}...`);
    const sent = await sendDailyReport(printers);
    if (sent) {
      state.lastDailyReportDate = todayStr;
      saveState();
      console.log(`[AlertManager] Relatório matinal diário de ${todayStr} registrado.`);
    }
  }
}

// Inicializa o módulo carregando o estado
loadState();

module.exports = {
  processScanResults,
  checkDailySchedule,
  loadState,
  saveState
};

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { performScan, getCachedData } = require('./scanner');
const { 
  db,
  syncRecentLogs, 
  calculateCycleBounds, 
  getHistoryStats, 
  getHistoryJobs, 
  getHistoryFilterOptions,
  getCyclePagesByPrinter
} = require('./papercutEngine');
const { processScanResults, checkDailySchedule } = require('./printerAlertManager');
const { sendDailyReport, verifyConnection } = require('./emailService');

const PORT = config.port;
const HOST = config.host;
const PUBLIC_DIR = path.resolve(__dirname, 'public');

let isScanningPrinters = false;
let isSyncingPaperCut = false;
let lastScanTime = null;
let lastPaperCutSync = null;

// Garantir existência do diretório público
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Varredura de hardware/SNMP em segundo plano
async function triggerPrinterScan() {
  if (isScanningPrinters) return getCachedData();
  isScanningPrinters = true;
  try {
    const result = await performScan();
    lastScanTime = new Date();
    if (result && Array.isArray(result.printers)) {
      try {
        await processScanResults(result.printers);
      } catch (alertErr) {
        console.error('[Server] Erro ao processar alertas de impressoras:', alertErr.message);
      }
    }
    return result;
  } catch (err) {
    console.error('[Server] Erro na varredura do parque:', err);
    return getCachedData();
  } finally {
    isScanningPrinters = false;
  }
}

// Sincronização de logs diários do PaperCut em segundo plano
async function triggerPaperCutSync(daysBack = config.papercut.syncDaysBack) {
  if (isSyncingPaperCut) return;
  isSyncingPaperCut = true;
  try {
    const res = await syncRecentLogs(daysBack);
    lastPaperCutSync = new Date();
    return res;
  } catch (err) {
    console.error('[Server] Erro ao sincronizar PaperCut:', err.message);
  } finally {
    isSyncingPaperCut = false;
  }
}

// Dicionário de tipos MIME para arquivos estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Cálculo de KPIs do parque de hardware
function computeStats(data) {
  if (!data || !data.printers) {
    return { total: 0, online: 0, offline: 0, lowToner: 0, criticalToner: 0, totalPages: 0, cycleTotalPages: 0, cycleInfo: null, colorCount: 0, monoCount: 0 };
  }
  const printers = data.printers;
  const online = printers.filter(p => p.isOnline).length;
  const offline = printers.filter(p => !p.isOnline).length;
  const criticalToner = printers.filter(p => p.status === 'critical_toner').length;
  const lowToner = printers.filter(p => p.status === 'low_toner').length;
  const colorCount = printers.filter(p => p.isColor).length;
  const monoCount = printers.length - colorCount;

  const totalPages = printers.reduce((sum, p) => sum + (p.lifeCount || 0), 0);

  const units = {};
  for (const p of printers) {
    const u = p.unit || 'Outros';
    units[u] = (units[u] || 0) + 1;
  }

  let cycleTotalPages = 0;
  let cycleInfo = null;
  try {
    const bounds = calculateCycleBounds(new Date());
    cycleInfo = bounds.current;
    const { pagesMap } = getCyclePagesByPrinter(bounds.current.startDate, bounds.current.endDate);
    cycleTotalPages = Object.values(pagesMap).reduce((sum, v) => sum + v, 0);
  } catch (err) {
    console.error('[Server] Erro ao computar páginas do ciclo para stats:', err.message);
  }

  return {
    total: printers.length,
    online,
    offline,
    lowToner: lowToner + criticalToner,
    criticalToner,
    totalPages,
    cycleTotalPages,
    cycleInfo,
    colorCount,
    monoCount,
    units,
    lastUpdated: data.timestamp,
    serverIp: config.printServer.host
  };
}

// Criação do servidor HTTP nativo
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Headers de segurança e CORS básico
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: GET /api/printers (Parque de hardware enriquecido com ciclo de auditoria)
  if (pathname === '/api/printers' && req.method === 'GET') {
    const data = getCachedData() || { printers: [] };
    let list = data.printers || [];

    const bounds = calculateCycleBounds(new Date());
    const startDate = urlObj.searchParams.get('start') || bounds.current.startDate;
    const endDate = urlObj.searchParams.get('end') || bounds.current.endDate;

    let pagesMap = {};
    try {
      const cycleData = getCyclePagesByPrinter(startDate, endDate);
      pagesMap = cycleData.pagesMap;
    } catch (err) {
      console.error('[Server] Erro ao carregar páginas do ciclo:', err.message);
    }

    list = list.map(p => {
      const key = (p.name || '').toLowerCase().trim();
      return {
        ...p,
        cyclePages: pagesMap[key] !== undefined ? pagesMap[key] : 0
      };
    });

    const unit = urlObj.searchParams.get('unit');
    const status = urlObj.searchParams.get('status');
    const type = urlObj.searchParams.get('type');
    const search = urlObj.searchParams.get('q');

    if (unit && unit !== 'all') {
      list = list.filter(p => p.unit === unit);
    }
    if (type === 'color') {
      list = list.filter(p => p.isColor);
    } else if (type === 'mono') {
      list = list.filter(p => !p.isColor);
    }
    if (status === 'critical') {
      list = list.filter(p => p.status === 'critical_toner');
    } else if (status === 'low_toner') {
      list = list.filter(p => p.status === 'low_toner' || p.status === 'critical_toner');
    } else if (status === 'offline') {
      list = list.filter(p => !p.isOnline);
    } else if (status === 'ready') {
      list = list.filter(p => p.isOnline && p.status === 'ready');
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.ip && p.ip.includes(q)) ||
        (p.driverName && p.driverName.toLowerCase().includes(q)) ||
        (p.unit && p.unit.toLowerCase().includes(q)) ||
        (p.serialNumber && p.serialNumber.toLowerCase().includes(q))
      );
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      timestamp: data.timestamp,
      count: list.length,
      cycle: {
        startDate,
        endDate,
        label: bounds.current.label
      },
      isScanning: isScanningPrinters,
      printers: list
    }));
  }

  // API: GET /api/stats (KPIs de hardware)
  if (pathname === '/api/stats' && req.method === 'GET') {
    const data = getCachedData() || { printers: [] };
    const stats = computeStats(data);
    stats.isScanning = isScanningPrinters;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(stats));
  }

  // API: GET /api/printers/:id
  if (pathname.startsWith('/api/printers/') && req.method === 'GET') {
    const printerId = pathname.replace('/api/printers/', '');
    const data = getCachedData() || { printers: [] };
    const printer = (data.printers || []).find(p => p.id === printerId || p.name === decodeURIComponent(printerId));
    if (!printer) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Impressora não encontrada' }));
    }
    const bounds = calculateCycleBounds(new Date());
    const { pagesMap } = getCyclePagesByPrinter(bounds.current.startDate, bounds.current.endDate);
    const key = (printer.name || '').toLowerCase().trim();

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      ...printer,
      cyclePages: pagesMap[key] !== undefined ? pagesMap[key] : 0
    }));
  }

  // API: POST /api/scan (Disparo manual de varredura)
  if (pathname === '/api/scan' && req.method === 'POST') {
    if (isScanningPrinters) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ message: 'Varredura já em andamento...', isScanning: true }));
    }
    triggerPrinterScan().then(() => console.log('[Server] Varredura manual concluída.'));
    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ message: 'Varredura iniciada.', isScanning: true }));
  }

  // API: GET /api/status (Status operacional e dados de infraestrutura)
  if (pathname === '/api/status' && req.method === 'GET') {
    const cached = getCachedData();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      serverHost: config.printServer.host,
      serverName: config.printServer.name,
      papercutLogsDir: config.papercut.logsDir,
      isScanning: isScanningPrinters,
      isSyncingPaperCut,
      lastScanTime,
      lastPaperCutSync,
      hasCache: !!cached,
      cacheTimestamp: cached ? cached.timestamp : null,
      printersCount: cached && cached.printers ? cached.printers.length : 0
    }));
  }

  // ==========================================
  // APIS DE AUDITORIA & FECHAMENTO PAPERCUT
  // ==========================================

  // API: GET /api/papercut/cycles
  if (pathname === '/api/papercut/cycles' && req.method === 'GET') {
    const cycles = calculateCycleBounds(new Date());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(cycles));
  }

  // API: GET /api/papercut/stats
  if (pathname === '/api/papercut/stats' && req.method === 'GET') {
    const bounds = calculateCycleBounds(new Date());
    const startDate = urlObj.searchParams.get('start') || bounds.current.startDate;
    const endDate = urlObj.searchParams.get('end') || bounds.current.endDate;

    try {
      const stats = getHistoryStats(startDate, endDate);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(stats));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // API: GET /api/papercut/jobs (DataTable server-side)
  if (pathname === '/api/papercut/jobs' && req.method === 'GET') {
    const bounds = calculateCycleBounds(new Date());
    const startDate = urlObj.searchParams.get('start') || bounds.current.startDate;
    const endDate = urlObj.searchParams.get('end') || bounds.current.endDate;
    const user = urlObj.searchParams.get('user');
    const printer = urlObj.searchParams.get('printer');
    const client = urlObj.searchParams.get('client');
    const search = urlObj.searchParams.get('q');
    const onlyAnomalies = urlObj.searchParams.get('onlyAnomalies') === 'true' || urlObj.searchParams.get('onlyAnomalies') === '1';
    const sortBy = urlObj.searchParams.get('sortBy') || 'time';
    const sortDir = urlObj.searchParams.get('sortDir') || 'DESC';
    const limit = Math.min(200, Math.max(1, parseInt(urlObj.searchParams.get('limit'), 10) || 50));
    const offset = Math.max(0, parseInt(urlObj.searchParams.get('offset'), 10) || 0);

    try {
      const data = getHistoryJobs({
        startDate,
        endDate,
        user,
        printer,
        client,
        search,
        onlyAnomalies,
        sortBy,
        sortDir,
        limit,
        offset
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // API: GET /api/papercut/filters
  if (pathname === '/api/papercut/filters' && req.method === 'GET') {
    const bounds = calculateCycleBounds(new Date());
    const startDate = urlObj.searchParams.get('start') || bounds.current.startDate;
    const endDate = urlObj.searchParams.get('end') || bounds.current.endDate;

    try {
      const filters = getHistoryFilterOptions(startDate, endDate);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(filters));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // API: POST /api/papercut/sync (Sincronização manual)
  if (pathname === '/api/papercut/sync' && req.method === 'POST') {
    if (isSyncingPaperCut) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ message: 'Sincronização já em andamento...', isSyncing: true }));
    }
    triggerPaperCutSync(10).then(() => console.log('[Server] Sincronização manual de logs concluída.'));
    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ message: 'Sincronização iniciada.', isSyncing: true }));
  }

  // API: GET /api/papercut/export (Exportação com todos os filtros respeitados)
  if (pathname === '/api/papercut/export' && req.method === 'GET') {
    const bounds = calculateCycleBounds(new Date());
    const startDate = urlObj.searchParams.get('start') || bounds.current.startDate;
    const endDate = urlObj.searchParams.get('end') || bounds.current.endDate;
    const user = urlObj.searchParams.get('user');
    const printer = urlObj.searchParams.get('printer');
    const client = urlObj.searchParams.get('client');
    const search = urlObj.searchParams.get('q');
    const onlyAnomalies = urlObj.searchParams.get('onlyAnomalies') === 'true' || urlObj.searchParams.get('onlyAnomalies') === '1';

    try {
      const result = getHistoryJobs({
        startDate,
        endDate,
        user,
        printer,
        client,
        search,
        onlyAnomalies,
        limit: 100000,
        offset: 0
      });

      const headers = [
        'Data/Hora', 'Usuario', 'Paginas', 'Copias', 
        'Total Paginas', 'Impressora', 'Terminal', 
        'Documento', 'Formato', 'Cor'
      ];

      const rows = result.jobs.map(j => [
        `"${j.time}"`,
        `"${(j.user || '').replace(/"/g, '""')}"`,
        j.pages,
        j.copies,
        j.total_pages,
        `"${(j.printer || '').replace(/"/g, '""')}"`,
        `"${(j.client || '').replace(/"/g, '""')}"`,
        `"${(j.document_name || '').replace(/"/g, '""')}"`,
        `"${j.duplex || 'SIMPLEX'}"`,
        `"${j.grayscale === 'GRAYSCALE' ? 'P&B' : 'Colorida'}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
      const filename = `fechamento-papercut-${startDate}-a-${endDate}${onlyAnomalies ? '-anomalias' : ''}.csv`;

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      });
      return res.end(csvContent);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Erro ao exportar: ${err.message}`);
    }
  }

  // ==========================================
  // APIS DE E-MAIL & NOTIFICAÇÕES (ZIMBRA)
  // ==========================================

  // API: GET /api/email/status (Verifica status das configurações de e-mail)
  if (pathname === '/api/email/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      enabled: config.email.enabled,
      smtpServer: config.email.smtpServer,
      smtpPort: config.email.smtpPort,
      user: config.email.user,
      notifyTo: config.email.notifyTo,
      dailyReportTime: config.email.dailyReportTime
    }));
  }

  // API: POST /api/email/test (Dispara envio de teste manual)
  if (pathname === '/api/email/test' && req.method === 'POST') {
    try {
      const cached = getCachedData();
      const printers = cached && cached.printers ? cached.printers : [];
      const ok = await sendDailyReport(printers, config.email.notifyTo);
      res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: ok,
        message: ok ? `E-mail de teste enviado para ${config.email.notifyTo}` : 'Falha ao enviar e-mail'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // API: POST /api/email/daily-report (Dispara o relatório matinal sob demanda)
  if (pathname === '/api/email/daily-report' && req.method === 'POST') {
    try {
      const cached = getCachedData();
      if (!cached || !cached.printers || cached.printers.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Nenhuma impressora no cache para gerar relatório.' }));
      }
      const ok = await sendDailyReport(cached.printers);
      res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: ok,
        message: ok ? 'Relatório matinal disparado com sucesso!' : 'Falha ao disparar relatório matinal.'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // Entrega estática com proteção rígida contra Directory Traversal
  const safePath = path.normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = path.resolve(PUBLIC_DIR, safePath === '' ? 'index.html' : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Acesso Negado');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

// Inicialização e agendadores de segundo plano
server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(` SysPrint TI — Servidor de Monitoramento & Auditoria`);
  console.log(` Acesso Local:    http://localhost:${PORT}`);
  console.log(` Servidor Origem: \\\\${config.printServer.host} (${config.printServer.name})`);
  console.log(` Logs PaperCut:   ${config.papercut.logsDir}`);
  console.log(`=======================================================`);

  const cached = getCachedData();
  if (!cached || !cached.printers || cached.printers.length === 0) {
    triggerPrinterScan();
  } else {
    console.log(`[Server] Cache de impressoras carregado (${cached.printers.length} impressoras).`);
    // Dispara varredura inicial de hardware/SNMP em segundo plano após 5s para assegurar telemetria fresca
    setTimeout(() => {
      console.log('[Server] Disparando varredura inicial de telemetria após inicialização...');
      triggerPrinterScan();
    }, 5000);
  }

  // Agendador de varredura de hardware SNMP
  setInterval(() => {
    triggerPrinterScan();
  }, config.snmp.scanIntervalMin * 60 * 1000);

  // Agendador de sincronização incremental do PaperCut
  setInterval(() => {
    console.log('[Server] Sincronização periódica de logs recentes do PaperCut...');
    triggerPaperCutSync(config.papercut.syncDaysBack);
  }, config.papercut.syncIntervalMin * 60 * 1000);

  // Agendador do Relatório Matinal por E-mail (Verifica a cada 1 minuto se é 08:00)
  setInterval(async () => {
    const data = getCachedData();
    if (data && Array.isArray(data.printers)) {
      await checkDailySchedule(data.printers);
    }
  }, 60 * 1000);
});

// Encerramento limpo e seguro
function gracefulShutdown() {
  console.log('\n[SysPrint TI] Encerrando servidor de forma segura...');
  server.close(() => {
    try {
      db.close();
    } catch (_) {}
    console.log('[SysPrint TI] Servidor e conexões finalizados com sucesso.');
    process.exit(0);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

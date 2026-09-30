const path = require('path');
const fs = require('fs');

// Carregador nativo de .env disponível no Node.js 20.6+ sem dependências externas
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn('[Config] Aviso ao carregar arquivo .env:', err.message);
  }
}

// Validação e normalização de variáveis de ambiente
const hostPattern = /^[a-zA-Z0-9.\-_]+$/;
const printServerHost = process.env.PRINT_SERVER_HOST || '127.0.0.1';

if (process.env.PRINT_SERVER_HOST && !hostPattern.test(process.env.PRINT_SERVER_HOST)) {
  console.warn(`[Config] AVISO: Host do servidor de impressão (${process.env.PRINT_SERVER_HOST}) possui formato suspeito.`);
}

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  printServer: {
    host: printServerHost,
    name: process.env.PRINT_SERVER_NAME || 'Servidor-Impressao',
  },
  papercut: {
    shareUnc: process.env.PAPERCUT_SHARE_UNC || '',
    shareUser: process.env.PAPERCUT_SHARE_USER || '',
    sharePassword: process.env.PAPERCUT_SHARE_PASSWORD || '',
    logsDir: process.env.PAPERCUT_LOGS_DIR || '',
    syncIntervalMin: Math.max(1, parseInt(process.env.PAPERCUT_SYNC_INTERVAL_MIN, 10) || 5),
    syncDaysBack: Math.max(1, parseInt(process.env.PAPERCUT_SYNC_DAYS_BACK, 10) || 2),
    initialDaysBack: Math.max(1, parseInt(process.env.PAPERCUT_INITIAL_DAYS_BACK, 10) || 45),
  },
  snmp: {
    community: process.env.SNMP_COMMUNITY || 'public',
    timeoutMs: Math.max(500, parseInt(process.env.SNMP_TIMEOUT_MS, 10) || 2500),
    concurrency: Math.max(1, parseInt(process.env.SNMP_CONCURRENCY, 10) || 10),
    scanIntervalMin: Math.max(1, parseInt(process.env.SCAN_INTERVAL_MIN, 10) || 5),
  },
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'history.db'),
  cacheFile: process.env.CACHE_FILE || path.join(__dirname, 'data', 'cache.json'),
});

module.exports = config;

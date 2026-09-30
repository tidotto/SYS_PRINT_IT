const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const PAPERCUT_LOGS_DIR = config.papercut.logsDir;
const DB_PATH = config.dbPath;

// Garantir existência do diretório de dados
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Inicializar banco SQLite nativo (Node 22+)
const db = new DatabaseSync(DB_PATH);

// Configuração de tabelas, índices e pragmas de performance
function initDatabase() {
  // WAL (Write-Ahead Logging) permite leituras simultâneas sem bloqueio durante sincronizações
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      date TEXT NOT NULL,
      user TEXT NOT NULL,
      pages INTEGER NOT NULL,
      copies INTEGER NOT NULL,
      total_pages INTEGER NOT NULL,
      printer TEXT NOT NULL,
      document_name TEXT,
      client TEXT,
      paper_size TEXT,
      language TEXT,
      duplex TEXT,
      grayscale TEXT,
      size_kb INTEGER,
      is_anomaly INTEGER DEFAULT 0,
      anomaly_reasons TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_unique 
      ON print_jobs(time, user, printer, document_name, pages, size_kb);

    CREATE INDEX IF NOT EXISTS idx_job_date ON print_jobs(date);
    CREATE INDEX IF NOT EXISTS idx_job_user ON print_jobs(user);
    CREATE INDEX IF NOT EXISTS idx_job_printer ON print_jobs(printer);
    CREATE INDEX IF NOT EXISTS idx_job_anomaly ON print_jobs(is_anomaly);
    CREATE INDEX IF NOT EXISTS idx_job_date_anomaly ON print_jobs(date, is_anomaly);
    CREATE INDEX IF NOT EXISTS idx_job_date_user ON print_jobs(date, user);

    CREATE TABLE IF NOT EXISTS sync_meta (
      file_name TEXT PRIMARY KEY,
      last_modified TEXT,
      file_mtime TEXT,
      file_size INTEGER,
      lines_synced INTEGER
    );
  `);

  // Migrações retrocompatíveis para o sync_meta existente
  try { db.exec(`ALTER TABLE sync_meta ADD COLUMN file_mtime TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE sync_meta ADD COLUMN file_size INTEGER;`); } catch (_) {}
}

initDatabase();

// Regex compilado para detecção de impressões anômalas/pessoais
const SUSPICIOUS_KEYWORDS = /apostila|livro|manual|faculdade|tcc|monografia|curriculo|curr[íi]culo|receita|desenho|colorir|ingresso|fanfic|jogo|game|\.epub|\.mobi|certificado|vestibular|concurso/i;

// Avaliador de criticidade e anomalias
function evaluateAnomaly(job) {
  const reasons = [];

  if (job.totalPages >= 35) {
    reasons.push(`Volume alto (${job.totalPages} páginas)`);
  }
  if (job.copies >= 4) {
    reasons.push(`Cópias excessivas (${job.copies} cópias)`);
  }

  if (job.documentName && SUSPICIOUS_KEYWORDS.test(job.documentName)) {
    reasons.push('Título de arquivo com termo pessoal/suspeito');
  }

  try {
    const jobDate = new Date(job.time.replace(' ', 'T'));
    if (!isNaN(jobDate.getTime())) {
      const day = jobDate.getDay();
      const hour = jobDate.getHours();
      const min = jobDate.getMinutes();

      if (day === 0) {
        reasons.push('Impressão em Domingo');
      } else if (day === 6 && (hour > 13 || (hour === 13 && min > 30))) {
        reasons.push('Impressão em Sábado à tarde');
      } else if (hour < 6 || (hour === 6 && min < 45)) {
        reasons.push('Impressão antes do expediente (< 06:45)');
      } else if (hour >= 20) {
        reasons.push('Impressão fora de horário (após as 20h)');
      }
    }
  } catch (_) {}

  if (job.grayscale === 'NOT GRAYSCALE' && job.totalPages >= 15) {
    reasons.push(`Uso excessivo de cor (${job.totalPages} páginas coloridas)`);
  }

  return {
    isAnomaly: reasons.length > 0 ? 1 : 0,
    reasonsJson: JSON.stringify(reasons)
  };
}

// Parser RFC 4180 robusto com suporte a aspas duplas escapadas ("")
function parseCsvLine(line) {
  const values = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // pula próxima aspas
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  if (values.length < 13) return null;

  const time = values[0];
  const user = values[1];
  const pages = parseInt(values[2], 10) || 1;
  const copies = parseInt(values[3], 10) || 1;
  const printer = values[4];
  let documentName = values[5] ? values[5].replace(/^"|"$/g, '').trim() : '';
  const client = values[6] || '';
  const paperSize = values[7] || '';
  const language = values[8] || '';
  const duplex = values[11] || '';
  const grayscale = values[12] || '';
  const sizeRaw = values[13] || '';
  const sizeKb = parseInt(sizeRaw.replace(/[^\d]/g, ''), 10) || 0;

  if (!time || !user || !printer) return null;
  const date = time.split(' ')[0];
  const totalPages = pages * copies;

  const job = {
    time,
    date,
    user,
    pages,
    copies,
    totalPages,
    printer,
    documentName,
    client,
    paperSize,
    language,
    duplex,
    grayscale,
    sizeKb
  };

  const anomaly = evaluateAnomaly(job);
  job.isAnomaly = anomaly.isAnomaly;
  job.anomalyReasons = anomaly.reasonsJson;

  return job;
}

// Ingestão incremental com verificação de modificação (CDC)
async function syncDailyFile(filePath) {
  if (!fs.existsSync(filePath)) return { skipped: true, count: 0 };
  const fileName = path.basename(filePath);

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    console.error(`[PaperCut Engine] Erro ao ler metadados do arquivo ${fileName}:`, err.message);
    return { skipped: true, count: 0 };
  }

  const mtimeIso = stat.mtime.toISOString();
  const fileSize = stat.size;

  // Verificação CDC: se o arquivo já foi sincronizado e o mtime/tamanho não mudaram, ignora
  const metaCheck = db.prepare(`SELECT file_mtime, file_size FROM sync_meta WHERE file_name = ?`).get(fileName);
  if (metaCheck && metaCheck.file_mtime === mtimeIso && metaCheck.file_size === fileSize) {
    return { skipped: true, count: 0 };
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO print_jobs (
      time, date, user, pages, copies, total_pages, printer, 
      document_name, client, paper_size, language, duplex, grayscale, 
      size_kb, is_anomaly, anomaly_reasons
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  let lineNum = 0;

  db.exec('BEGIN TRANSACTION;');

  try {
    for await (const line of rl) {
      lineNum++;
      if (lineNum <= 2) continue; // cabeçalhos do PaperCut
      if (!line.trim()) continue;

      const job = parseCsvLine(line);
      if (job) {
        insertStmt.run(
          job.time,
          job.date,
          job.user,
          job.pages,
          job.copies,
          job.totalPages,
          job.printer,
          job.documentName,
          job.client,
          job.paperSize,
          job.language,
          job.duplex,
          job.grayscale,
          job.sizeKb,
          job.isAnomaly,
          job.anomalyReasons
        );
        count++;
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const metaStmt = db.prepare(`
    INSERT INTO sync_meta (file_name, last_modified, file_mtime, file_size, lines_synced)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_name) DO UPDATE SET
      last_modified = excluded.last_modified,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      lines_synced = excluded.lines_synced
  `);
  metaStmt.run(fileName, new Date().toISOString(), mtimeIso, fileSize, count);

  return { skipped: false, count };
}

// Garantir autenticação e montagem do compartilhamento SMB caso necessário
function ensureShareAccess() {
  if (fs.existsSync(PAPERCUT_LOGS_DIR)) return true;

  if (config.papercut.shareUnc && config.papercut.shareUser && config.papercut.sharePassword) {
    try {
      console.log(`[PaperCut Engine] Tentando autenticar compartilhamento SMB: ${config.papercut.shareUnc}...`);
      const { execSync } = require('child_process');
      execSync(`net use "${config.papercut.shareUnc}" "${config.papercut.sharePassword}" /user:"${config.papercut.shareUser}" /persistent:yes`, {
        stdio: 'ignore',
        timeout: 10000
      });
      return fs.existsSync(PAPERCUT_LOGS_DIR);
    } catch (err) {
      console.error(`[PaperCut Engine] Falha ao autenticar compartilhamento SMB:`, err.message);
      return false;
    }
  }
  return false;
}

// Sincronizar lote de logs recentes com telemetria incremental
async function syncRecentLogs(daysBack = config.papercut.syncDaysBack) {
  if (!fs.existsSync(PAPERCUT_LOGS_DIR)) {
    ensureShareAccess();
  }

  if (!fs.existsSync(PAPERCUT_LOGS_DIR)) {
    console.warn(`[PaperCut Engine] Diretório não acessível em: ${PAPERCUT_LOGS_DIR}`);
    return { syncedFiles: 0, skippedFiles: 0, totalLines: 0 };
  }

  let allFiles = [];
  try {
    allFiles = fs.readdirSync(PAPERCUT_LOGS_DIR).filter(f => f.startsWith('papercut-print-log-') && f.endsWith('.csv'));
  } catch (err) {
    console.error(`[PaperCut Engine] Erro ao listar diretório PaperCut:`, err.message);
    return { syncedFiles: 0, skippedFiles: 0, totalLines: 0 };
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - daysBack);
  const thresholdStr = `papercut-print-log-${threshold.toISOString().slice(0, 10)}.csv`;

  const targetFiles = allFiles.filter(f => f >= thresholdStr).sort();

  let totalLines = 0;
  let processedFiles = 0;
  let skippedFiles = 0;

  for (const f of targetFiles) {
    const fullPath = path.join(PAPERCUT_LOGS_DIR, f);
    try {
      const res = await syncDailyFile(fullPath);
      if (res.skipped) {
        skippedFiles++;
      } else {
        processedFiles++;
        totalLines += res.count;
      }
    } catch (err) {
      console.error(`[PaperCut Engine] Erro ao sincronizar arquivo ${f}:`, err.message);
    }
  }

  console.log(`[PaperCut Engine] Sincronização: ${processedFiles} arquivos processados (${totalLines} novos registros), ${skippedFiles} arquivos inalterados ignorados.`);
  return { syncedFiles: processedFiles, skippedFiles, totalLines };
}

// Cálculo dos limites do ciclo de faturamento (21 a 20)
function calculateCycleBounds(refDate = new Date()) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const day = refDate.getDate();

  let curStartYear, curStartMonth;
  let curEndYear, curEndMonth;

  if (day >= 21) {
    curStartYear = year;
    curStartMonth = month;
    curEndYear = month === 11 ? year + 1 : year;
    curEndMonth = month === 11 ? 0 : month + 1;
  } else {
    curStartYear = month === 0 ? year - 1 : year;
    curStartMonth = month === 0 ? 11 : month - 1;
    curEndYear = year;
    curEndMonth = month;
  }

  const curStart = `${curStartYear}-${String(curStartMonth + 1).padStart(2, '0')}-21`;
  const curEnd = `${curEndYear}-${String(curEndMonth + 1).padStart(2, '0')}-20`;

  let prevStartYear = curStartMonth === 0 ? curStartYear - 1 : curStartYear;
  let prevStartMonth = curStartMonth === 0 ? 11 : curStartMonth - 1;
  let prevEndYear = curStartYear;
  let prevEndMonth = curStartMonth;

  const prevStart = `${prevStartYear}-${String(prevStartMonth + 1).padStart(2, '0')}-21`;
  const prevEnd = `${prevEndYear}-${String(prevEndMonth + 1).padStart(2, '0')}-20`;

  return {
    current: {
      startDate: curStart,
      endDate: curEnd,
      label: `Ciclo Vigente (${formatDateBr(curStart)} a ${formatDateBr(curEnd)})`
    },
    previous: {
      startDate: prevStart,
      endDate: prevEnd,
      label: `Ciclo Anterior (${formatDateBr(prevStart)} a ${formatDateBr(prevEnd)})`
    }
  };
}

function formatDateBr(isoDate) {
  const parts = isoDate.split('-');
  return `${parts[2]}/${parts[1]}`;
}

// Estatísticas agregadas com índices otimizados
function getHistoryStats(startDate, endDate) {
  const summaryStmt = db.prepare(`
    SELECT 
      COUNT(*) as totalJobs,
      COALESCE(SUM(total_pages), 0) as totalPages,
      COALESCE(SUM(copies), 0) as totalCopies,
      COALESCE(SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END), 0) as totalAnomalies,
      COALESCE(SUM(CASE WHEN grayscale = 'GRAYSCALE' THEN total_pages ELSE 0 END), 0) as monoPages,
      COALESCE(SUM(CASE WHEN grayscale != 'GRAYSCALE' THEN total_pages ELSE 0 END), 0) as colorPages,
      COALESCE(SUM(CASE WHEN duplex = 'DUPLEX' THEN total_pages ELSE 0 END), 0) as duplexPages,
      COUNT(DISTINCT user) as distinctUsers,
      COUNT(DISTINCT printer) as distinctPrinters
    FROM print_jobs
    WHERE date >= ? AND date <= ?
  `);

  const summary = summaryStmt.get(startDate, endDate);

  return {
    period: { startDate, endDate },
    summary
  };
}

// Consulta de impressões com contagem direta e paginação limpa
function getHistoryJobs(options = {}) {
  const {
    startDate,
    endDate,
    user,
    printer,
    client,
    search,
    onlyAnomalies = false,
    sortBy = 'time',
    sortDir = 'DESC',
    limit = 50,
    offset = 0
  } = options;

  let whereClauses = ['date >= ?', 'date <= ?'];
  const params = [startDate, endDate];

  if (onlyAnomalies) {
    whereClauses.push('is_anomaly = 1');
  }
  if (user && user !== 'all') {
    whereClauses.push('user = ?');
    params.push(user);
  }
  if (printer && printer !== 'all') {
    whereClauses.push('printer = ?');
    params.push(printer);
  }
  if (client && client !== 'all') {
    whereClauses.push('client = ?');
    params.push(client);
  }
  if (search) {
    whereClauses.push('(user LIKE ? OR document_name LIKE ? OR printer LIKE ? OR client LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const whereSql = 'WHERE ' + whereClauses.join(' AND ');

  // Contagem direta sem overhead de subquery
  const countQuery = `SELECT COUNT(*) as total FROM print_jobs ${whereSql}`;
  const totalCount = db.prepare(countQuery).get(...params).total;

  // Ordenação com whitelist segura
  const allowedSortCols = {
    time: 'time',
    user: 'user',
    pages: 'pages',
    copies: 'copies',
    total_pages: 'total_pages',
    printer: 'printer',
    client: 'client',
    document_name: 'document_name'
  };
  const column = allowedSortCols[sortBy] || 'time';
  const direction = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const dataQuery = `
    SELECT id, time, date, user, pages, copies, total_pages, printer, 
           document_name, client, paper_size, language, duplex, grayscale, 
           size_kb, is_anomaly, anomaly_reasons
    FROM print_jobs
    ${whereSql}
    ORDER BY ${column} ${direction}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(dataQuery).all(...params, limit, offset).map(row => ({
    ...row,
    reasons: JSON.parse(row.anomaly_reasons || '[]')
  }));

  return {
    total: totalCount,
    limit,
    offset,
    sortBy: column,
    sortDir: direction,
    jobs: rows
  };
}

// Filtros distintos para o período selecionado
function getHistoryFilterOptions(startDate, endDate) {
  const users = db.prepare(`SELECT DISTINCT user FROM print_jobs WHERE date >= ? AND date <= ? ORDER BY user ASC`).all(startDate, endDate).map(r => r.user);
  const printers = db.prepare(`SELECT DISTINCT printer FROM print_jobs WHERE date >= ? AND date <= ? ORDER BY printer ASC`).all(startDate, endDate).map(r => r.printer);
  const clients = db.prepare(`SELECT DISTINCT client FROM print_jobs WHERE date >= ? AND date <= ? AND client != '' ORDER BY client ASC`).all(startDate, endDate).map(r => r.client);

  return { users, printers, clients };
}

module.exports = {
  db,
  syncRecentLogs,
  syncDailyFile,
  calculateCycleBounds,
  getHistoryStats,
  getHistoryJobs,
  getHistoryFilterOptions
};

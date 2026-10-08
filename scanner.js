const { exec } = require('child_process');
const snmp = require('net-snmp');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CACHE_FILE = config.cacheFile;
const cacheDir = path.dirname(CACHE_FILE);
const CATALOG_FILE = path.join(cacheDir, 'printers-catalog.json');
const SERVER_HOST = config.printServer.host;
const COMMUNITY = config.snmp.community;
const SNMP_TIMEOUT_MS = config.snmp.timeoutMs;
const SNMP_CONCURRENCY = config.snmp.concurrency;

// Garantir existência do diretório do cache
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Extrair IP do PortName (ex: 192.168.2.123, 192.168.18.246_1, X_192_168_12_104)
function extractIp(portName) {
  if (!portName) return null;
  const m = portName.match(/(\d{1,3})[._](\d{1,3})[._](\d{1,3})[._](\d{1,3})/);
  if (m) {
    const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
    const parts = ip.split('.').map(Number);
    if (parts.every(p => p >= 0 && p <= 255)) return ip;
  }
  return null;
}

// Categorização de unidade com base no nome da impressora
function detectUnit(name) {
  const upper = (name || '').toUpperCase();
  if (upper.includes('DF47') || upper.includes('DF 47')) return 'DF 47';
  if (upper.includes('CANOAS') || upper.startsWith('CAN ')) return 'Canoas';
  if (upper.includes('GRAVATAI') || upper.includes('GRAVATAÍ')) return 'Gravataí';
  if (upper.includes('CACHOEIRINHA') || upper.startsWith('CACH ')) return 'Cachoeirinha';
  if (upper.includes('AZENHA') || upper.startsWith('AZE ')) return 'Azenha';
  if (upper.includes('ASSIS BRASIL') || upper.includes('ASSIS 3224') || upper.includes('AB30')) return 'Assis Brasil';
  if (upper.includes('ALVORADA')) return 'Alvorada';
  if (upper.startsWith('RH')) return 'RH Central';
  if (upper.startsWith('ADM')) return 'Administração';
  return 'Outros';
}

// Persistência do catálogo base de impressoras do parque
function savePersistedCatalog(printers) {
  if (!Array.isArray(printers) || printers.length === 0) return;
  try {
    const cleanList = printers.map(p => ({
      name: p.name,
      portName: p.portName,
      ip: p.ip || extractIp(p.portName),
      driverName: p.driverName || '',
      shareName: p.shareName || p.name,
      unit: p.unit || detectUnit(p.name),
      shared: p.shared !== false,
      spoolerStatus: p.spoolerStatus || 0
    })).filter(p => p.name);
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(cleanList, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Scanner] Aviso ao persistir catálogo de impressoras:', err.message);
  }
}

function getPersistedCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (_) {}

  // Fallback para impressoras do cache existente
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cache && Array.isArray(cache.printers) && cache.printers.length > 0) {
        return cache.printers.map(p => ({
          name: p.name,
          portName: p.portName,
          ip: p.ip || extractIp(p.portName),
          driverName: p.driverName || '',
          shareName: p.shareName || p.name,
          unit: p.unit || detectUnit(p.name),
          shared: true,
          spoolerStatus: p.spoolerCode || 0
        }));
      }
    }
  } catch (_) {}

  return [];
}

// Assegura autenticação SMB/RPC se credenciais estiverem configuradas
function ensureIpcSession() {
  const user = config.papercut && config.papercut.shareUser;
  const pass = config.papercut && config.papercut.sharePassword;
  if (user && pass && SERVER_HOST) {
    try {
      require('child_process').execSync(`net use "\\\\${SERVER_HOST}\\IPC$" "${pass}" /user:"${user}"`, {
        stdio: 'ignore',
        timeout: 4000
      });
    } catch (_) {
      // Ignora erro se a sessão já estiver ativa ou não for Windows Server local
    }
  }
}

// Consulta das impressoras no servidor Windows via PowerShell seguro
function getPrintersFromWindowsServer() {
  return new Promise((resolve) => {
    // Validação estrita de formato de host para prevenir injeção de comandos
    const safeHostRegex = /^[a-zA-Z0-9.\-_]+$/;
    if (!safeHostRegex.test(SERVER_HOST)) {
      console.error(`[Scanner] Host do servidor inválido (${SERVER_HOST}). Abortando chamada PowerShell.`);
      return resolve([]);
    }

    ensureIpcSession();

    const psCommand = `Get-Printer -ComputerName '${SERVER_HOST}' | Select-Object Name, PortName, PrinterStatus, DriverName, Shared, ShareName | ConvertTo-Json -Compress`;
    const cmd = `powershell -NoProfile -NonInteractive -Command "${psCommand}"`;

    exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (error, stdout) => {
      if (error) {
        console.warn(`[Scanner] Aviso ao consultar Spooler do servidor Windows (${SERVER_HOST}): ${error.message}`);
        return resolve([]);
      }
      try {
        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];
        const printers = list.map(p => ({
          name: p.Name,
          portName: p.PortName,
          spoolerStatus: p.PrinterStatus, // 0 = Normal, 128 = Offline, 130 = Erro/Pausa
          driverName: p.DriverName,
          shared: p.Shared,
          shareName: p.ShareName,
          ip: extractIp(p.PortName),
          unit: detectUnit(p.Name)
        }));
        resolve(printers);
      } catch (parseErr) {
        console.warn('[Scanner] Falha no parse do JSON retornado pelo PowerShell do Spooler:', parseErr.message);
        resolve([]);
      }
    });
  });
}

// Consulta SNMP direta na impressora (MIB-2 e Printer-MIB)
function queryPrinterSnmp(ip, timeoutMs = SNMP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!ip) {
      return resolve({ online: false, error: 'No IP found' });
    }

    const session = snmp.createSession(ip, COMMUNITY, {
      timeout: timeoutMs,
      retries: 1,
      version: snmp.Version2c
    });

    const result = {
      online: false,
      ip,
      sysDescr: null,
      sysName: null,
      serialNumber: null,
      lifeCount: null,
      hrStatus: null,
      supplies: [],
      isColor: false
    };

    const baseOids = [
      '1.3.6.1.2.1.1.1.0',           // sysDescr
      '1.3.6.1.2.1.1.5.0',           // sysName
      '1.3.6.1.2.1.43.5.1.1.17.1',   // prtGeneralSerialNumber
      '1.3.6.1.2.1.43.10.2.1.4.1.1', // Contador total de páginas
      '1.3.6.1.2.1.25.3.5.1.1.1'     // hrPrinterStatus
    ];

    let sessionClosed = false;
    const closeSession = () => {
      if (!sessionClosed) {
        sessionClosed = true;
        try { session.close(); } catch (_) {}
      }
    };

    const safetyTimer = setTimeout(() => {
      closeSession();
      resolve(result);
    }, timeoutMs + 1000);

    session.get(baseOids, (err, varbinds) => {
      if (err) {
        clearTimeout(safetyTimer);
        closeSession();
        return resolve(result); // Dispositivo offline ou sem resposta SNMP
      }

      result.online = true;

      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        const oid = vb.oid;
        const val = vb.value;

        if (oid.startsWith('1.3.6.1.2.1.1.1.0')) {
          result.sysDescr = val ? val.toString('latin1').trim() : null;
        } else if (oid.startsWith('1.3.6.1.2.1.1.5.0')) {
          result.sysName = val ? val.toString('latin1').trim() : null;
        } else if (oid.startsWith('1.3.6.1.2.1.43.5.1.1.17.1')) {
          result.serialNumber = val ? val.toString('latin1').trim() : null;
        } else if (oid.startsWith('1.3.6.1.2.1.43.10.2.1.4.1.1')) {
          result.lifeCount = typeof val === 'number' ? val : parseInt(val, 10) || null;
        } else if (oid.startsWith('1.3.6.1.2.1.25.3.5.1.1.1')) {
          result.hrStatus = val;
        }
      }

      // Varredura da tabela de suprimentos (prtMarkerSuppliesEntry)
      const rawSupplies = {};
      session.subtree('1.3.6.1.2.1.43.11.1.1', (vbs) => {
        for (const vb of vbs) {
          if (snmp.isVarbindError(vb)) continue;
          const oidParts = vb.oid.split('.');
          const col = oidParts[10]; // 6=desc, 8=max, 9=level, 5=type
          const idx = oidParts.slice(11).join('.');
          if (!rawSupplies[idx]) rawSupplies[idx] = {};

          if (col === '6') {
            rawSupplies[idx].description = vb.value ? vb.value.toString('latin1').trim() : '';
          } else if (col === '8') {
            rawSupplies[idx].maxCapacity = Number(vb.value);
          } else if (col === '9') {
            rawSupplies[idx].level = Number(vb.value);
          } else if (col === '5') {
            rawSupplies[idx].type = Number(vb.value);
          }
        }
      }, () => {
        clearTimeout(safetyTimer);
        closeSession();

        const parsedSupplies = [];
        let hasColorToner = false;

        for (const idx of Object.keys(rawSupplies)) {
          const item = rawSupplies[idx];
          if (!item.description) continue;

          let percent = null;
          if (item.maxCapacity > 0 && item.level >= 0) {
            percent = Math.min(100, Math.max(0, Math.round((item.level / item.maxCapacity) * 100)));
          } else if (item.level === -3) {
            percent = 100;
          }

          const descLower = item.description.toLowerCase();
          let category = 'other';
          let color = null;

          if (descLower.includes('black') || descLower.includes('preto')) {
            category = 'toner';
            color = 'black';
          } else if (descLower.includes('cyan') || descLower.includes('ciano') || descLower.includes('turquesa')) {
            category = 'toner';
            color = 'cyan';
            hasColorToner = true;
          } else if (descLower.includes('magenta')) {
            category = 'toner';
            color = 'magenta';
            hasColorToner = true;
          } else if (descLower.includes('yellow') || descLower.includes('amarelo') || descLower.includes('amarela')) {
            category = 'toner';
            color = 'yellow';
            hasColorToner = true;
          } else if (descLower.includes('drum') || descLower.includes('cilindro') || descLower.includes('fotorreceptor') || descLower.includes('fotocondutor')) {
            category = 'drum';
          } else if (descLower.includes('waste') || descLower.includes('resíduo') || descLower.includes('residuo')) {
            category = 'waste';
          } else if (descLower.includes('fuser') || descLower.includes('fusor')) {
            category = 'fuser';
          } else if (descLower.includes('belt') || descLower.includes('esteira') || descLower.includes('correia') || descLower.includes('transfer belt')) {
            category = 'belt';
          } else if (descLower.includes('roller') || descLower.includes('rolete')) {
            category = 'roller';
          } else if (descLower.includes('maintenance') || descLower.includes('manutenção') || descLower.includes('manutencao')) {
            category = 'maintenance';
          }

          parsedSupplies.push({
            name: item.description,
            category,
            color,
            maxCapacity: item.maxCapacity,
            currentLevel: item.level,
            percent
          });
        }

        result.supplies = parsedSupplies;
        result.isColor = hasColorToner;
        resolve(result);
      });
    });
  });
}

// Pool concorrente com limite configurado
async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

// Execução da varredura geral do parque
async function performScan() {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando varredura do parque de impressão...`);
  const startTime = Date.now();

  let targetPrinters = await getPrintersFromWindowsServer();
  
  if (targetPrinters.length > 0) {
    console.log(`[Scanner] ${targetPrinters.length} impressoras encontradas no servidor ${SERVER_HOST}`);
    savePersistedCatalog(targetPrinters);
  } else {
    // Spooler indisponível ou inacessível no momento: resgata o catálogo persistente
    targetPrinters = getPersistedCatalog();
    if (targetPrinters.length > 0) {
      console.log(`[Scanner] Spooler indisponível. Utilizando catálogo persistente com ${targetPrinters.length} impressoras para varredura SNMP em tempo real.`);
    } else {
      console.warn('[Scanner] Nenhuma impressora disponível no Spooler nem no catálogo.');
      return { timestamp: new Date().toISOString(), printers: [] };
    }
  }

  const combined = await mapConcurrent(targetPrinters, SNMP_CONCURRENCY, async (printer) => {
    let snmpData = { online: false };
    if (printer.ip) {
      try {
        snmpData = await queryPrinterSnmp(printer.ip);
      } catch (err) {
        console.error(`[Scanner] Erro SNMP em ${printer.name} (${printer.ip}):`, err.message);
      }
    }

    let finalStatus = 'normal';
    let statusText = 'Pronta';

    if (!snmpData.online && printer.spoolerStatus === 128) {
      finalStatus = 'offline';
      statusText = 'Offline';
    } else if (printer.spoolerStatus === 130) {
      finalStatus = 'error';
      statusText = 'Erro na Fila';
    } else if (!snmpData.online) {
      finalStatus = 'unreachable_snmp';
      statusText = 'Sem Resposta SNMP';
    } else {
      const toners = snmpData.supplies.filter(s => s.category === 'toner' && s.percent !== null);
      const criticalToners = toners.filter(t => t.percent <= 10);
      const lowToners = toners.filter(t => t.percent <= 20);

      if (criticalToners.length > 0) {
        finalStatus = 'critical_toner';
        statusText = `Toner Crítico (${criticalToners.map(t => `${t.color || 'K'}: ${t.percent}%`).join(', ')})`;
      } else if (lowToners.length > 0) {
        finalStatus = 'low_toner';
        statusText = `Toner Baixo (${lowToners.map(t => `${t.color || 'K'}: ${t.percent}%`).join(', ')})`;
      } else {
        finalStatus = 'ready';
        statusText = 'Pronta';
      }
    }

    const toners = (snmpData.supplies || []).filter(s => s.category === 'toner');
    const blackToner = toners.find(t => t.color === 'black') || toners[0] || null;
    const cyanToner = toners.find(t => t.color === 'cyan') || null;
    const magentaToner = toners.find(t => t.color === 'magenta') || null;
    const yellowToner = toners.find(t => t.color === 'yellow') || null;

    return {
      id: printer.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(),
      name: printer.name,
      portName: printer.portName,
      ip: printer.ip,
      unit: printer.unit,
      driverName: printer.driverName,
      shareName: printer.shareName || printer.name,
      serverPath: `\\\\${SERVER_HOST}\\${printer.shareName || printer.name}`,
      status: finalStatus,
      statusText: statusText,
      spoolerCode: printer.spoolerStatus,
      isOnline: snmpData.online,
      isColor: snmpData.isColor || (printer.driverName && printer.driverName.toLowerCase().includes('color')),
      serialNumber: snmpData.serialNumber || 'N/A',
      lifeCount: snmpData.lifeCount || null,
      sysDescr: snmpData.sysDescr || null,
      toners: {
        black: blackToner ? blackToner.percent : null,
        cyan: cyanToner ? cyanToner.percent : null,
        magenta: magentaToner ? magentaToner.percent : null,
        yellow: yellowToner ? yellowToner.percent : null
      },
      supplies: snmpData.supplies || [],
      lastChecked: new Date().toISOString()
    };
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Scanner] Varredura finalizada em ${durationSec}s para ${combined.length} impressoras.`);

  const output = {
    timestamp: new Date().toISOString(),
    durationSeconds: parseFloat(durationSec),
    serverIp: SERVER_HOST,
    totalCount: combined.length,
    printers: combined
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

// Leitura segura do cache local
function getCachedData() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (_) {}
  }
  return null;
}

module.exports = {
  performScan,
  getCachedData,
  CACHE_FILE
};

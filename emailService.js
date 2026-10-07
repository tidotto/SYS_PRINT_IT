const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.smtpServer,
      port: config.email.smtpPort,
      secure: config.email.smtpPort === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
}

/**
 * Testa a conexão com o servidor SMTP Zimbra
 */
async function verifyConnection() {
  if (!config.email.enabled) {
    return { ok: false, message: 'Notificações de e-mail desativadas via configuração.' };
  }
  try {
    const client = getTransporter();
    await client.verify();
    return { ok: true, message: 'Conexão SMTP Zimbra validada com sucesso.' };
  } catch (err) {
    console.error('[EmailService] Falha ao verificar conexão SMTP:', err.message);
    return { ok: false, message: err.message };
  }
}

/**
 * Envia um e-mail em formato HTML
 */
async function sendMail({ to, subject, html }) {
  if (!config.email.enabled) {
    console.log('[EmailService] Envio ignorado (EMAIL_NOTIFICATIONS_ENABLED=false).');
    return false;
  }

  const recipient = to || config.email.notifyTo;
  if (!recipient) {
    console.warn('[EmailService] Nenhum destinatário configurado.');
    return false;
  }

  const client = getTransporter();
  const mailOptions = {
    from: `"SysPrint TI" <${config.email.user}>`,
    to: recipient,
    subject,
    html
  };

  try {
    const info = await client.sendMail(mailOptions);
    console.log(`[EmailService] E-mail enviado com sucesso para ${recipient}. MsgId: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[EmailService] Erro ao enviar e-mail para ${recipient}:`, err.message);
    return false;
  }
}

/**
 * Formata os toners para visualização em texto curto
 */
function formatToners(printer) {
  if (!printer.toners) return '-';
  const parts = [];
  if (printer.toners.black !== null && printer.toners.black !== undefined) {
    parts.push(`K: <b>${printer.toners.black}%</b>`);
  }
  if (printer.toners.cyan !== null && printer.toners.cyan !== undefined) {
    parts.push(`C: <b>${printer.toners.cyan}%</b>`);
  }
  if (printer.toners.magenta !== null && printer.toners.magenta !== undefined) {
    parts.push(`M: <b>${printer.toners.magenta}%</b>`);
  }
  if (printer.toners.yellow !== null && printer.toners.yellow !== undefined) {
    parts.push(`Y: <b>${printer.toners.yellow}%</b>`);
  }
  return parts.length > 0 ? parts.join(' | ') : '-';
}

/**
 * Gera o template HTML do Relatório Diário das 08h
 */
function buildDailyReportHtml({ totalPrinters, criticalList, lowList, offlineList, dateStr }) {
  const totalIssues = criticalList.length + lowList.length + offlineList.length;

  let issueTablesHtml = '';

  if (totalIssues === 0) {
    issueTablesHtml = `
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 24px; text-align: center; margin: 20px 0;">
        <h3 style="color: #065f46; margin: 0 0 8px 0; font-size: 18px;">Tudo 100% Operacional!</h3>
        <p style="color: #047857; margin: 0; font-size: 14px;">Todas as <b>${totalPrinters}</b> impressoras do parque estão online e com níveis de toner normais (> 20%).</p>
      </div>
    `;
  } else {
    const renderTable = (items, categoryColor, emptyText) => {
      if (!items || items.length === 0) return '';
      return `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569; text-align: left; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px 12px;">Unidade</th>
              <th style="padding: 10px 12px;">Impressora</th>
              <th style="padding: 10px 12px;">IP</th>
              <th style="padding: 10px 12px;">Status</th>
              <th style="padding: 10px 12px;">Níveis de Toner</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((p, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 10px 12px; font-weight: bold; color: #1e293b;">${p.unit || 'Geral'}</td>
                <td style="padding: 10px 12px; color: #334155;">${p.name}</td>
                <td style="padding: 10px 12px; font-family: monospace; color: #0284c7;">${p.ip || 'Sem IP'}</td>
                <td style="padding: 10px 12px;">
                  <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${categoryColor.bg}; color: ${categoryColor.text};">
                    ${p.statusText || p.status}
                  </span>
                </td>
                <td style="padding: 10px 12px; color: #334155;">${formatToners(p)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    if (criticalList.length > 0) {
      issueTablesHtml += `
        <h3 style="color: #b91c1c; margin: 24px 0 8px 0; font-size: 16px; border-left: 4px solid #ef4444; padding-left: 8px;">
          Toner Crítico (≤ 10%) — ${criticalList.length} impressora(s)
        </h3>
        ${renderTable(criticalList, { bg: '#fee2e2', text: '#991b1b' })}
      `;
    }

    if (lowList.length > 0) {
      issueTablesHtml += `
        <h3 style="color: #c2410c; margin: 24px 0 8px 0; font-size: 16px; border-left: 4px solid #f97316; padding-left: 8px;">
          Alerta de Toner (≤ 20%) — ${lowList.length} impressora(s)
        </h3>
        ${renderTable(lowList, { bg: '#ffedd5', text: '#9a3412' })}
      `;
    }

    if (offlineList.length > 0) {
      issueTablesHtml += `
        <h3 style="color: #475569; margin: 24px 0 8px 0; font-size: 16px; border-left: 4px solid #64748b; padding-left: 8px;">
          Offline / Erro de Comunicação — ${offlineList.length} impressora(s)
        </h3>
        ${renderTable(offlineList, { bg: '#f1f5f9', text: '#334155' })}
      `;
    }
  }

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Relatório Matinal SysPrint TI</title>
    </head>
    <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 720px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <!-- Top Bar -->
        <tr>
          <td style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8;">Central de Consultas • TI</div>
            <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">Relatório Matinal — Parque de Impressão</h1>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Data: ${dateStr} • Horário: 08:00</div>
          </td>
        </tr>

        <!-- KPI Summary Cards -->
        <tr>
          <td style="padding: 20px 24px 10px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="24%" style="background-color: #fee2e2; border-radius: 6px; padding: 12px; text-align: center;">
                  <div style="font-size: 24px; font-weight: 800; color: #991b1b;">${criticalList.length}</div>
                  <div style="font-size: 11px; font-weight: 600; color: #b91c1c; text-transform: uppercase; margin-top: 2px;">Toner Crítico</div>
                </td>
                <td width="3%"></td>
                <td width="24%" style="background-color: #ffedd5; border-radius: 6px; padding: 12px; text-align: center;">
                  <div style="font-size: 24px; font-weight: 800; color: #9a3412;">${lowList.length}</div>
                  <div style="font-size: 11px; font-weight: 600; color: #c2410c; text-transform: uppercase; margin-top: 2px;">Alerta Toner</div>
                </td>
                <td width="3%"></td>
                <td width="24%" style="background-color: #f1f5f9; border-radius: 6px; padding: 12px; text-align: center;">
                  <div style="font-size: 24px; font-weight: 800; color: #334155;">${offlineList.length}</div>
                  <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 2px;">Offline / Erro</div>
                </td>
                <td width="3%"></td>
                <td width="24%" style="background-color: #f8fafc; border-radius: 6px; padding: 12px; text-align: center; border: 1px solid #e2e8f0;">
                  <div style="font-size: 24px; font-weight: 800; color: #0284c7;">${totalPrinters}</div>
                  <div style="font-size: 11px; font-weight: 600; color: #0369a1; text-transform: uppercase; margin-top: 2px;">Total Parque</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Table Details -->
        <tr>
          <td style="padding: 10px 24px 20px 24px;">
            ${issueTablesHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">Este é um relatório diário automático gerado pelo <b>SysPrint TI</b>.</p>
            <p style="margin: 0; color: #94a3b8;">Central de Consultas — Monitoramento de Impressoras e Auditoria PaperCut</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Gera o template HTML de Alerta de Alteração de Status ao longo do dia
 */
function buildStatusChangeHtml(changes, timestampStr) {
  const alerts = changes.filter(c => c.type === 'ALERT');
  const resolved = changes.filter(c => c.type === 'RESOLVED');

  let contentHtml = '';

  if (alerts.length > 0) {
    contentHtml += `
      <h3 style="color: #b91c1c; margin: 16px 0 8px 0; font-size: 15px; border-left: 4px solid #ef4444; padding-left: 8px;">
        Novos Alertas Detectados (${alerts.length})
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <thead>
          <tr style="background-color: #fef2f2; color: #991b1b; text-align: left; border-bottom: 2px solid #fecaca;">
            <th style="padding: 8px 10px;">Unidade</th>
            <th style="padding: 8px 10px;">Impressora</th>
            <th style="padding: 8px 10px;">IP</th>
            <th style="padding: 8px 10px;">Novo Status</th>
            <th style="padding: 8px 10px;">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map((item, idx) => `
            <tr style="border-bottom: 1px solid #fee2e2; background-color: ${idx % 2 === 0 ? '#ffffff' : '#fff5f5'};">
              <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${item.printer.unit || 'Geral'}</td>
              <td style="padding: 8px 10px; color: #334155;">${item.printer.name}</td>
              <td style="padding: 8px 10px; font-family: monospace; color: #0284c7;">${item.printer.ip || '-'}</td>
              <td style="padding: 8px 10px; font-weight: bold; color: #b91c1c;">${item.newStatusText}</td>
              <td style="padding: 8px 10px; color: #64748b; font-size: 12px;">${item.details || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  if (resolved.length > 0) {
    contentHtml += `
      <h3 style="color: #065f46; margin: 16px 0 8px 0; font-size: 15px; border-left: 4px solid #10b981; padding-left: 8px;">
        Problemas Corrigidos / Toner Substituído (${resolved.length})
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <thead>
          <tr style="background-color: #ecfdf5; color: #065f46; text-align: left; border-bottom: 2px solid #a7f3d0;">
            <th style="padding: 8px 10px;">Unidade</th>
            <th style="padding: 8px 10px;">Impressora</th>
            <th style="padding: 8px 10px;">IP</th>
            <th style="padding: 8px 10px;">Status Atual</th>
            <th style="padding: 8px 10px;">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          ${resolved.map((item, idx) => `
            <tr style="border-bottom: 1px solid #d1fae5; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f0fdf4'};">
              <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${item.printer.unit || 'Geral'}</td>
              <td style="padding: 8px 10px; color: #334155;">${item.printer.name}</td>
              <td style="padding: 8px 10px; font-family: monospace; color: #0284c7;">${item.printer.ip || '-'}</td>
              <td style="padding: 8px 10px; font-weight: bold; color: #065f46;">${item.newStatusText}</td>
              <td style="padding: 8px 10px; color: #047857; font-size: 12px;">${item.details || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Alteração de Status SysPrint TI</title>
    </head>
    <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 720px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <tr>
          <td style="background-color: #1e293b; padding: 18px 24px; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8;">SysPrint TI • Monitoramento em Tempo Real</div>
            <h1 style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: #ffffff;">Notificação de Mudança de Status</h1>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Horário da Detecção: ${timestampStr}</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 24px;">
            ${contentHtml}
          </td>
        </tr>
        <tr>
          <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b;">
            Notificação gerada pela varredura contínua de hardware (SNMP / Spooler).
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Dispara o Relatório Matinal das 08h
 */
async function sendDailyReport(printers, targetEmail = null) {
  const totalPrinters = printers.length;
  const criticalList = [];
  const lowList = [];
  const offlineList = [];

  for (const p of printers) {
    if (!p.isOnline || p.status === 'offline' || p.status === 'error' || p.status === 'unreachable_snmp') {
      offlineList.push(p);
    } else if (p.status === 'critical_toner') {
      criticalList.push(p);
    } else if (p.status === 'low_toner') {
      lowList.push(p);
    }
  }

  const dateStr = new Date().toLocaleDateString('pt-BR');
  const html = buildDailyReportHtml({
    totalPrinters,
    criticalList,
    lowList,
    offlineList,
    dateStr
  });

  const subject = `[SysPrint TI] Relatório Matinal - Status de Toners & Parque de Impressão (${dateStr})`;

  return sendMail({
    to: targetEmail,
    subject,
    html
  });
}

/**
 * Dispara o alerta de mudanças detectadas
 */
async function sendStatusChangeAlert(changes, targetEmail = null) {
  if (!changes || changes.length === 0) return;

  const timestampStr = new Date().toLocaleString('pt-BR');
  const alertCount = changes.filter(c => c.type === 'ALERT').length;
  const resolvedCount = changes.filter(c => c.type === 'RESOLVED').length;

  const parts = [];
  if (alertCount > 0) parts.push(`${alertCount} novo(s) alerta(s)`);
  if (resolvedCount > 0) parts.push(`${resolvedCount} corrigido(s)`);

  const subject = `[SysPrint TI Alerta] Mudança de Status: ${parts.join(', ')}`;
  const html = buildStatusChangeHtml(changes, timestampStr);

  return sendMail({
    to: targetEmail,
    subject,
    html
  });
}

module.exports = {
  verifyConnection,
  sendMail,
  sendDailyReport,
  sendStatusChangeAlert
};

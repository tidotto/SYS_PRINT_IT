const config = require('./config');
const { verifyConnection, sendDailyReport } = require('./emailService');
const { getCachedData } = require('./scanner');

async function runTest() {
  console.log('=======================================================');
  console.log(' Teste de Envio de E-mail via Zimbra SMTP');
  console.log(` Servidor:     ${config.email.smtpServer}:${config.email.smtpPort}`);
  console.log(` Usuário:      ${config.email.user}`);
  console.log(` Destinatário: ${config.email.notifyTo}`);
  console.log('=======================================================');

  console.log('\n1. Testando conexão e autenticação com o Zimbra...');
  const verify = await verifyConnection();
  if (!verify.ok) {
    console.error('[ERRO] Falha na conexão SMTP:', verify.message);
    process.exit(1);
  }
  console.log('[OK] Conexão com Zimbra validada com sucesso!');

  console.log('\n2. Obtendo impressoras do cache para simular o relatório matinal...');
  const cache = getCachedData();
  let printers = cache && cache.printers ? cache.printers : [];

  if (printers.length === 0) {
    console.log('[AVISO] Nenhum dado no cache, gerando impressoras de teste...');
    printers = [
      {
        id: 'teste_canoas_01',
        name: 'HP LaserJet Canoas Recepção',
        unit: 'Canoas',
        ip: '192.168.10.50',
        status: 'critical_toner',
        statusText: 'Toner Crítico (K: 8%)',
        isOnline: true,
        toners: { black: 8, cyan: null, magenta: null, yellow: null }
      },
      {
        id: 'teste_azenha_01',
        name: 'Brother MFC Azenha Triagem',
        unit: 'Azenha',
        ip: '192.168.12.35',
        status: 'low_toner',
        statusText: 'Toner Baixo (K: 15%)',
        isOnline: true,
        toners: { black: 15, cyan: null, magenta: null, yellow: null }
      },
      {
        id: 'teste_gravatai_01',
        name: 'Kyocera Gravataí Consultório 03',
        unit: 'Gravataí',
        ip: '192.168.14.80',
        status: 'offline',
        statusText: 'Offline',
        isOnline: false,
        toners: { black: null, cyan: null, magenta: null, yellow: null }
      },
      {
        id: 'teste_df47_01',
        name: 'HP M404 Dr Flores 47 Andar 2',
        unit: 'DF 47',
        ip: '192.168.20.10',
        status: 'ready',
        statusText: 'Pronta',
        isOnline: true,
        toners: { black: 75, cyan: null, magenta: null, yellow: null }
      }
    ];
  } else {
    console.log(`[INFO] Carregadas ${printers.length} impressoras reais do cache.`);
  }

  const mode = process.argv[2] || 'daily';

  if (mode === 'alert' || mode === 'all') {
    console.log(`\n3. Enviando e-mail de simulação de alteração de status para ${config.email.notifyTo}...`);
    const { sendStatusChangeAlert } = require('./emailService');
    const mockChanges = [
      {
        printer: {
          name: 'HP LaserJet Canoas Recepção',
          unit: 'Canoas',
          ip: '192.168.10.50'
        },
        type: 'ALERT',
        previousStatus: 'ready',
        previousStatusText: 'Pronta',
        newStatus: 'critical_toner',
        newStatusText: 'Toner Crítico (K: 7%)',
        details: 'Nível de Toner caiu: K: 7%'
      },
      {
        printer: {
          name: 'Brother MFC Azenha Triagem',
          unit: 'Azenha',
          ip: '192.168.12.35'
        },
        type: 'RESOLVED',
        previousStatus: 'low_toner',
        previousStatusText: 'Toner Baixo (15%)',
        newStatus: 'ready',
        newStatusText: 'Pronta',
        details: 'Toner substituído com sucesso (K: 100%)'
      }
    ];

    const alertSuccess = await sendStatusChangeAlert(mockChanges, config.email.notifyTo);
    if (alertSuccess) {
      console.log('[OK] Notificação de alteração de status enviada com sucesso!');
    }
  }

  console.log(`\n4. Enviando e-mail do Relatório Matinal para ${config.email.notifyTo}...`);
  const success = await sendDailyReport(printers, config.email.notifyTo);

  if (success) {
    console.log('\n[SUCESSO] E-mail do Relatório Matinal disparado com sucesso!');
    console.log(`Destinatário: ${config.email.notifyTo}`);
  } else {
    console.error('\n[ERRO] Ocorreu um erro ao enviar o relatório matinal.');
  }
}

runTest().catch(console.error);

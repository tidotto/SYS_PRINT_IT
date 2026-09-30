# SysPrint TI — Gestão & Auditoria de Impressões

Sistema corporativo para monitoramento em tempo real do parque de impressoras mapeadas em servidores Windows Spooler e auditoria de fechamento de ciclo do PaperCut Print Logger.

---

## Como Iniciar

1. **Configurar Variáveis de Ambiente:**
   Copie o arquivo `.env.example` para `.env` e ajuste os parâmetros da sua infraestrutura:

   ```bash
   cp .env.example .env
   ```

2. **Instalar Dependências:**

   ```bash
   npm install
   ```

3. **Iniciar o Servidor:**

   ```bash
   npm start
   # ou
   node server.js
   ```

4. **Acessar o Painel no Navegador:**
   - **Local:** [http://localhost:3000](http://localhost:3000)
   - **Rede Corporativa:** `http://<IP_DO_SERVIDOR>:3000`

---

## Variáveis de Ambiente (.env)

Todas as configurações operacionais, de rede e credenciais são isoladas no `.env`:

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `PORT` | `3000` | Porta HTTP do painel web |
| `HOST` | `0.0.0.0` | Interface de escuta de rede |
| `PRINT_SERVER_HOST` | `192.168.1.211` | Host/IP do servidor de impressão Windows |
| `PRINT_SERVER_NAME` | `SRV-TS` | Nome de exibição do servidor de impressão |
| `PAPERCUT_SHARE_UNC` | `\\SRV-TS\PaperCut Print Logger` | Caminho UNC do compartilhamento de rede SMB |
| `PAPERCUT_SHARE_USER` | `central.local\suporte` | Usuário para autenticação no compartilhamento SMB |
| `PAPERCUT_SHARE_PASSWORD` | - | Senha do usuário do compartilhamento SMB |
| `PAPERCUT_LOGS_DIR` | `\\SRV-TS\...\logs\csv\daily` | Pasta contendo os arquivos diários de log do PaperCut |
| `PAPERCUT_SYNC_INTERVAL_MIN` | `5` | Periodicidade (minutos) de sincronização dos logs |
| `PAPERCUT_SYNC_DAYS_BACK` | `2` | Dias para trás verificados a cada intervalo |
| `SNMP_COMMUNITY` | `public` | Comunidade SNMP v2c para leitura direta das impressoras |
| `SNMP_TIMEOUT_MS` | `2500` | Timeout por impressora em milissegundos |
| `SNMP_CONCURRENCY` | `10` | Quantidade de consultas SNMP simultâneas |
| `SCAN_INTERVAL_MIN` | `5` | Intervalo da varredura geral do parque |

---

## Arquitetura do Sistema

- **Ingestão Incremental CDC:** O motor PaperCut monitora os arquivos diários sem reprocessar dias fechados inalterados, preservando a rede corporativa.
- **SQLite com WAL Mode:** Leituras no painel não bloqueiam e nem sofrem contenção durante a inserção de registros em segundo plano.
- **Auto-Montagem SMB:** Se a sessão de rede SMB com o servidor de logs for perdida, o sistema tenta autenticar automaticamente via `net use`.

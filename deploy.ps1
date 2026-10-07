# ==============================================================================
# SysPrint TI - Script Padronizado de Deploy e Atualizacao em Producao
# Servidor Alvo: 192.168.1.248 (C:\inetpub\wwwroot\SysPrintTI)
# ==============================================================================

$ServiceName = "SysPrintTI"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "            DEPLOY & ATUALIZACAO - SYSPRINT TI (PRODUCAO)                       " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Diretorio do Projeto: $ProjectRoot" -ForegroundColor Gray
Write-Host "Data/Hora:            $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray

Set-Location -Path $ProjectRoot

# 1. PARAR O SERVICO WINDOWS
Write-Host ""
Write-Host "[1/4] Verificando e parando servico Windows $ServiceName..." -ForegroundColor Yellow
$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($Service) {
    if ($Service.Status -eq 'Running') {
        try {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            Write-Host "[OK] Servico $ServiceName parado com sucesso." -ForegroundColor Green
        } catch {
            Write-Host "[AVISO] Falha ao parar via Stop-Service. Tentando nssm/net..." -ForegroundColor Yellow
            try {
                & nssm stop $ServiceName 2>$null
            } catch {
                & net stop $ServiceName 2>$null
            }
        }
    } else {
        Write-Host "[INFO] Servico $ServiceName ja se encontra parado." -ForegroundColor Gray
    }
} else {
    Write-Host "[AVISO] Servico Windows $ServiceName nao encontrado neste ambiente." -ForegroundColor Yellow
}

# 2. ATUALIZAR CODIGO FONTE VIA GIT
Write-Host ""
Write-Host "[2/4] Buscando atualizacoes no repositorio Git..." -ForegroundColor Yellow
if (Test-Path ".git") {
    try {
        git fetch origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Falha no git fetch. Verifique autenticacao ou conexao com o GitHub." -ForegroundColor Red
            exit 1
        }
        git reset --hard origin/main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Falha ao resetar para origin/main." -ForegroundColor Red
            exit 1
        }
        Write-Host "[OK] Codigo fonte sincronizado com a branch main." -ForegroundColor Green
    } catch {
        Write-Host "[ERRO] Erro ao executar Git." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[AVISO] Diretorio .git nao encontrado. Pulando etapa de pull." -ForegroundColor Yellow
}

# 3. ATUALIZAR DEPENDENCIAS NODE.JS
Write-Host ""
Write-Host "[3/4] Instalando/atualizando dependencias Node.js..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    try {
        npm install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            npm install
        }
        Write-Host "[OK] Dependencias Node.js atualizadas com sucesso." -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] Falha na instalacao de dependencias." -ForegroundColor Yellow
    }
}

# Garantir diretorio de dados
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" -Force | Out-Null
}

# 4. REINICIAR O SERVICO WINDOWS
Write-Host ""
Write-Host "[4/4] Iniciando servico Windows $ServiceName..." -ForegroundColor Yellow
if ($Service) {
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop
        Start-Sleep -Seconds 2
        $StatusFinal = (Get-Service -Name $ServiceName).Status
        Write-Host "[OK] Servico $ServiceName iniciado. Status: $StatusFinal" -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] Falha ao iniciar via Start-Service. Tentando nssm/net start..." -ForegroundColor Yellow
        try {
            & nssm start $ServiceName 2>$null
            & net start $ServiceName 2>$null
        } catch {}
        Start-Sleep -Seconds 2
        $StatusFinal = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
        if ($StatusFinal) {
            Write-Host "[INFO] Status atual do servico: $StatusFinal" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "[INFO] Ambiente sem servico configurado. Para iniciar manualmente: npm start" -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "                      DEPLOY FINALIZADO COM SUCESSO                             " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

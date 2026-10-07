# ==============================================================================
# Script de Atualizacao Rapida (Alias para deploy.ps1)
# ==============================================================================

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $ProjectRoot

Write-Host "Iniciando script oficial de deploy (deploy.ps1)..." -ForegroundColor Cyan
& ".\deploy.ps1"

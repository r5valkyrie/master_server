# Quick Docker setup script for R5Valkyrie Master Server (PowerShell)
# This script helps with the initial Docker setup on Windows

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "R5Valkyrie Master Server - Docker Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    docker --version | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not installed!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker daemon is running
try {
    docker info | Out-Null
    Write-Host "[OK] Docker is installed and running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is installed but not running!" -ForegroundColor Red
    Write-Host "" -ForegroundColor White
    Write-Host "Please start Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  1. Open Docker Desktop from the Start menu" -ForegroundColor White
    Write-Host "  2. Wait for Docker to fully start (icon in system tray should be steady)" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "If Docker Desktop is already open, it may still be starting up." -ForegroundColor Yellow
    Write-Host "Please wait a minute and try again." -ForegroundColor Yellow
    exit 1
}

# Check if Docker Compose is available
try {
    docker compose version | Out-Null
    $composeCmd = "docker compose"
} catch {
    try {
        docker-compose --version | Out-Null
        $composeCmd = "docker-compose"
    } catch {
        Write-Host "[ERROR] Docker Compose is not installed!" -ForegroundColor Red
        Write-Host "Please install Docker Compose from: https://docs.docker.com/compose/install/" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""

# Check if .env exists
if (Test-Path .env) {
    Write-Host "[WARNING] .env file already exists!" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "Keeping existing .env file" -ForegroundColor Yellow
    } else {
        Copy-Item docker.env.example .env -Force
        Write-Host "[OK] Created new .env file from docker.env.example" -ForegroundColor Green
    }
} else {
    Copy-Item docker.env.example .env
    Write-Host "[OK] Created .env file from docker.env.example" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Security Configuration" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[IMPORTANT] Generating secure passwords and secrets..." -ForegroundColor Yellow
Write-Host ""

# Generate secure passwords
function New-RandomPassword {
    $bytes = New-Object byte[] 32
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

$adminSecret = New-RandomPassword
$mysqlRootPass = New-RandomPassword
$mysqlUserPass = New-RandomPassword

Write-Host "Generated secure passwords" -ForegroundColor Green
Write-Host ""

# Update the .env file with secure values
$envContent = Get-Content .env -Raw
$envContent = $envContent -replace 'ADMIN_SESSION_SECRET=.*', "ADMIN_SESSION_SECRET=$adminSecret"
$envContent = $envContent -replace 'MYSQL_ROOT_PASSWORD=.*', "MYSQL_ROOT_PASSWORD=$mysqlRootPass"
$envContent = $envContent -replace 'MYSQL_PASS=.*', "MYSQL_PASS=$mysqlUserPass"
$envContent | Set-Content .env -NoNewline

Write-Host "[OK] Updated .env with secure passwords" -ForegroundColor Green
Write-Host ""

# Check if auth keys exist
if ((Test-Path auth.key) -and (Test-Path auth.key.pub)) {
    Write-Host "[OK] RSA keys already exist" -ForegroundColor Green
} else {
    Write-Host "Generating RSA keys for JWT authentication..." -ForegroundColor Yellow
    
    # Check if OpenSSL is available
    try {
        openssl version | Out-Null
        openssl genrsa -out auth.key 2048 2>$null
        openssl rsa -in auth.key -pubout -out auth.key.pub 2>$null
        Write-Host "[OK] Generated RSA keys (auth.key and auth.key.pub)" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] OpenSSL not found. Keys will be generated inside Docker container." -ForegroundColor Yellow
        Write-Host "You can install OpenSSL from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Starting Docker Containers" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Starting services with $composeCmd..." -ForegroundColor Yellow

# Check if containers exist from a previous failed setup
$existingContainers = Invoke-Expression "$composeCmd ps -q" 2>$null
if ($existingContainers) {
    Write-Host "[WARNING] Existing containers found. Removing for fresh setup..." -ForegroundColor Yellow
    Invoke-Expression "$composeCmd down -v"
    Write-Host "[OK] Cleaned up old containers and volumes" -ForegroundColor Green
}

Invoke-Expression "$composeCmd up -d"

Write-Host ""
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your R5Valkyrie Master Server is now running!" -ForegroundColor Green
Write-Host ""
Write-Host "Access the application:" -ForegroundColor White
Write-Host "  - Main Site:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "  - Admin Panel:  http://localhost:3000/admin/login" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default Admin Credentials:" -ForegroundColor White
Write-Host "  - Username: admin" -ForegroundColor Yellow
Write-Host "  - Password: changeme" -ForegroundColor Yellow
Write-Host "  [WARNING] CHANGE THIS PASSWORD IMMEDIATELY!" -ForegroundColor Red
Write-Host ""
Write-Host "Your secure passwords have been saved to .env" -ForegroundColor Green
Write-Host "Keep your .env file secure and never commit it!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  - View logs:        $composeCmd logs -f" -ForegroundColor Cyan
Write-Host "  - Stop services:    $composeCmd down" -ForegroundColor Cyan
Write-Host "  - Restart services: $composeCmd restart" -ForegroundColor Cyan
Write-Host ""
Write-Host "For more information, see DOCKER.md" -ForegroundColor White
Write-Host ""


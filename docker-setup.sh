#!/bin/bash
# Quick Docker setup script for R5Valkyrie Master Server
# This script helps with the initial Docker setup

set -e

echo "=========================================="
echo "R5Valkyrie Master Server - Docker Setup"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed!"
    echo "Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "[ERROR] Docker is installed but not running!"
    echo ""
    echo "Please start Docker:"
    echo "  - On Windows: Open Docker Desktop from the Start menu"
    echo "  - On Mac: Open Docker Desktop from Applications"
    echo "  - On Linux: Run 'sudo systemctl start docker'"
    echo ""
    echo "Wait for Docker to fully start, then run this script again."
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "[ERROR] Docker Compose is not installed!"
    echo "Please install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "[OK] Docker is installed and running"
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "[WARNING] .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file"
    else
        cp docker.env.example .env
        echo "[OK] Created new .env file from docker.env.example"
    fi
else
    cp docker.env.example .env
    echo "[OK] Created .env file from docker.env.example"
fi

echo ""
echo "=========================================="
echo "Security Configuration"
echo "=========================================="
echo ""
echo "[IMPORTANT] You must change the default passwords and secrets!"
echo ""

# Generate a secure admin session secret
echo "Generating secure ADMIN_SESSION_SECRET..."
ADMIN_SECRET=$(openssl rand -base64 32)
echo "Generated: $ADMIN_SECRET"
echo ""

# Prompt for MySQL root password
read -sp "Enter MySQL root password (or press Enter for auto-generated): " MYSQL_ROOT_PASS
echo ""
if [ -z "$MYSQL_ROOT_PASS" ]; then
    MYSQL_ROOT_PASS=$(openssl rand -base64 24)
    echo "Generated MySQL root password: $MYSQL_ROOT_PASS"
fi

# Prompt for MySQL user password
read -sp "Enter MySQL user password (or press Enter for auto-generated): " MYSQL_USER_PASS
echo ""
if [ -z "$MYSQL_USER_PASS" ]; then
    MYSQL_USER_PASS=$(openssl rand -base64 24)
    echo "Generated MySQL user password: $MYSQL_USER_PASS"
fi

echo ""
echo "Updating .env file with secure values..."

# Update the .env file with secure values
sed -i.bak "s|ADMIN_SESSION_SECRET=.*|ADMIN_SESSION_SECRET=$ADMIN_SECRET|" .env
sed -i.bak "s|MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASS|" .env
sed -i.bak "s|MYSQL_PASS=.*|MYSQL_PASS=$MYSQL_USER_PASS|" .env

# Remove backup file
rm -f .env.bak

echo "[OK] Updated .env with secure passwords"
echo ""

# Check if auth keys exist
if [ -f auth.key ] && [ -f auth.key.pub ]; then
    echo "[OK] RSA keys already exist"
else
    echo "Generating RSA keys for JWT authentication..."
    openssl genrsa -out auth.key 2048 2>/dev/null
    openssl rsa -in auth.key -pubout -out auth.key.pub 2>/dev/null
    chmod 600 auth.key
    chmod 644 auth.key.pub
    echo "[OK] Generated RSA keys (auth.key and auth.key.pub)"
fi

echo ""
echo "=========================================="
echo "Starting Docker Containers"
echo "=========================================="
echo ""

# Use docker compose (new) or docker-compose (old)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "Starting services with $COMPOSE_CMD..."

# Check if MySQL volume exists from a previous failed setup
if $COMPOSE_CMD ps -q mysql 2>/dev/null | grep -q .; then
    echo "[WARNING] Existing MySQL container found. Removing for fresh setup..."
    $COMPOSE_CMD down -v
    echo "[OK] Cleaned up old containers and volumes"
fi

$COMPOSE_CMD up -d

echo ""
echo "Waiting for services to be ready..."
sleep 15

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Your R5Valkyrie Master Server is now running!"
echo ""
echo "Access the application:"
echo "  - Main Site:    http://localhost:3000"
echo "  - Admin Panel:  http://localhost:3000/admin/login"
echo ""
echo "Default Admin Credentials:"
echo "  - Username: admin"
echo "  - Password: changeme"
echo "  [WARNING] CHANGE THIS PASSWORD IMMEDIATELY!"
echo ""
echo "Your secure passwords have been saved to .env:"
echo "  - MySQL Root: $MYSQL_ROOT_PASS"
echo "  - MySQL User: $MYSQL_USER_PASS"
echo "  - Keep your .env file secure and never commit it!"
echo ""
echo "Useful commands:"
echo "  - View logs:        $COMPOSE_CMD logs -f"
echo "  - Stop services:    $COMPOSE_CMD down"
echo "  - Restart services: $COMPOSE_CMD restart"
echo ""
echo "For more information, see DOCKER.md"
echo ""


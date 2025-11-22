# Docker Setup Guide

This guide explains how to run the R5Valkyrie Master Server using Docker. Docker setup is **optional** - you can still use the traditional installation method described in the main README.

## Why Use Docker?

Docker provides several benefits:
- **Easy Setup**: All dependencies (MariaDB, Redis, Node.js) are automatically configured
- **Consistency**: Works the same on any operating system
- **Isolation**: Doesn't affect your system's installed packages
- **Quick Start**: Get running in minutes with a single command

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (20.10 or newer)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0 or newer, usually included with Docker Desktop)

## Quick Start

### Automated Setup (Easiest)

We provide setup scripts that automate the entire process:

**Linux/Mac:**
```bash
git clone https://github.com/r5valkyrie/master_server.git
cd master_server
chmod +x docker-setup.sh
./docker-setup.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/r5valkyrie/master_server.git
cd master_server
.\docker-setup.ps1
```

These scripts will:
- Check if Docker is installed
- Generate secure passwords and secrets
- Create and configure the `.env` file
- Generate RSA keys for JWT authentication
- Start all Docker containers
- Verify everything is running

**That's it! Skip to [Verify It's Running](#4-verify-its-running)** if you used the automated setup.

### Manual Setup

If you prefer to set things up manually:

### 1. Clone the Repository

```bash
git clone https://github.com/r5valkyrie/master_server.git
cd master_server
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp docker.env.example .env
```

Edit the `.env` file and **change the default passwords and secrets**:

```bash
# Minimum required changes for security:
MYSQL_ROOT_PASSWORD=your_secure_root_password
MYSQL_PASS=your_secure_db_password
ADMIN_SESSION_SECRET=your_secure_random_string_at_least_32_chars
```

**Generate a secure admin session secret:**

```bash
# On Linux/Mac:
openssl rand -base64 32

# On Windows (PowerShell):
$bytes = New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes); [Convert]::ToBase64String($bytes)
```

### 3. Start the Stack

```bash
# Start all services (MariaDB, Redis, and the app)
docker-compose up -d
```

This will:
- Download required Docker images (first time only)
- Create and start MariaDB, Redis, and the application containers
- Automatically import the database schema
- Generate RSA keys for JWT authentication (if they don't exist)
- Start the application on port 3000

### 4. Verify It's Running

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f app
```

Access the application:
- **Main Site**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin/login
- **Default Admin Credentials**:
  - Username: `admin`
  - Password: `changeme`
  - **[WARNING] CHANGE THIS IMMEDIATELY** after first login!

### 5. Stop the Stack

```bash
# Stop services
docker-compose down

# Stop and remove all data (WARNING: This deletes your database!)
docker-compose down -v
```

## Development Setup

If you want to develop locally with hot-reload while using Docker for MariaDB and Redis:

```bash
# Start only MySQL and Redis
docker-compose -f docker-compose.dev.yml up -d

# Run the app locally (in another terminal)
npm install
npm run dev
```

This gives you:
- Docker-managed database and cache
- Hot-reload for local development
- Full access to source code for debugging

## Docker Commands Reference

### Managing Containers

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart a specific service
docker-compose restart app

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app

# Check service status
docker-compose ps
```

### Database Management

```bash
# Access MariaDB/MySQL shell
docker-compose exec mysql mysql -u root -p

# Import schema manually (if needed)
docker-compose exec -T mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DB} < schema.sql

# Backup database
docker-compose exec mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DB} > backup.sql

# Restore database
docker-compose exec -T mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DB} < backup.sql
```

### Redis Management

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# If Redis has a password:
docker-compose exec redis redis-cli -a ${REDIS_PASSWORD}

# View Redis info
docker-compose exec redis redis-cli INFO

# Clear Redis cache
docker-compose exec redis redis-cli FLUSHALL
```

### Application Management

```bash
# Access application shell
docker-compose exec app sh

# View application logs
docker-compose logs -f app

# Rebuild and restart app after code changes
docker-compose up -d --build app
```

## Advanced Configuration

### Custom Ports

Edit `.env` to change exposed ports:

```env
MYSQL_PORT=3307
REDIS_PORT=6380
APP_PORT=8080
```

### Using Your Own RSA Keys

If you have existing RSA keys for JWT authentication:

1. Place your keys in the project root:
   - `auth.key` (private key)
   - `auth.key.pub` (public key)

2. Docker will automatically use them instead of generating new ones

### Disabling Redis

If you don't want to use Redis caching:

```env
DISABLE_REDIS=1
```

### Production Deployment

For production deployments with Docker:

1. **Use Docker Secrets** or a secrets manager instead of `.env` files
2. **Enable TLS/SSL** with a reverse proxy (nginx, Traefik, Caddy)
3. **Set up automated backups** for the MariaDB volume
4. **Monitor containers** with Docker health checks
5. **Use Docker Swarm or Kubernetes** for high availability

Example with nginx reverse proxy:

```bash
# In your docker-compose.yml, remove port mapping for app:
# Comment out or remove:
#   ports:
#     - "3000:3000"

# Then use nginx to proxy to app:3000
```

### Resource Limits

Add resource constraints in `docker-compose.yml`:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Troubleshooting

### Docker Desktop Not Running (Windows/Mac)

**Error:** `unable to get image` or `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`

This means Docker Desktop is not running on your system.

**Solution:**

1. **Open Docker Desktop**
   - Windows: Search for "Docker Desktop" in the Start menu and open it
   - Mac: Open Docker Desktop from Applications folder

2. **Wait for it to start**
   - Look for the Docker icon in your system tray (Windows) or menu bar (Mac)
   - The icon should be steady, not animated
   - Initial startup can take 1-2 minutes

3. **Verify it's running**
   ```bash
   docker info
   ```
   If this works without errors, Docker is ready!

4. **Run your command again**

**Common Issues:**
- Docker Desktop is installed but never launched
- Docker Desktop is still starting up (wait a bit longer)
- WSL2 not installed on Windows - [Install WSL2](https://docs.microsoft.com/en-us/windows/wsl/install)
- Docker Desktop requires admin permissions to start

### Container Won't Start

```bash
# Check logs for errors
docker-compose logs app

# Verify environment variables
docker-compose config

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Errors

```bash
# Check if MariaDB is healthy
docker-compose ps mysql

# Verify MariaDB is accepting connections
docker-compose exec mysql mysqladmin ping -h localhost -u root -p

# Check MariaDB logs
docker-compose logs mysql
```

### Permission Issues (Linux)

If you get permission errors on Linux:

```bash
# Set proper ownership
sudo chown -R $USER:$USER .

# Or run as root (not recommended)
sudo docker-compose up -d
```

### Port Already in Use

If you get "port already in use" errors:

```bash
# Find what's using the port
# Linux/Mac:
sudo lsof -i :3000

# Windows (PowerShell):
netstat -ano | findstr :3000

# Change the port in .env
APP_PORT=8080
```

### Reset Everything

To completely reset and start fresh:

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove Docker images (optional)
docker-compose down --rmi all

# Remove generated files
rm -f auth.key auth.key.pub

# Start fresh
docker-compose up -d
```

## Updating the Application

When you pull new changes from git:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Check for database schema updates (if any)
docker-compose exec -T mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DB} < schema.sql
```

## Data Persistence

Docker volumes persist your data even when containers are stopped:

- **mysql_data**: Database files
- **redis_data**: Redis cache data

These volumes are preserved when you run `docker-compose down`. To delete them:

```bash
# WARNING: This deletes all your data!
docker-compose down -v
```

## Security Best Practices

1. **Never use default passwords** in production
2. **Keep .env out of version control** (already in .gitignore)
3. **Regularly update Docker images**: `docker-compose pull`
4. **Use Docker secrets** for sensitive data in production
5. **Run containers as non-root** (already configured in Dockerfile)
6. **Enable Docker Content Trust**: `export DOCKER_CONTENT_TRUST=1`
7. **Scan images for vulnerabilities**: `docker scan r5valk-app`

## Support

If you encounter issues with Docker setup:

1. Check this guide's Troubleshooting section
2. Review Docker logs: `docker-compose logs`
3. Ensure your Docker version is up to date
4. For application-specific issues, see the main [README.md](README.md)

## Migrating from Traditional Setup

If you're already running without Docker:

### Export Your Data

```bash
# Backup your database
mysqldump -u root -p r5 > backup.sql

# Copy your RSA keys
cp auth.key auth.key.backup
cp auth.key.pub auth.key.pub.backup
```

### Import to Docker

```bash
# Start Docker stack
docker-compose up -d

# Wait for MariaDB to be ready
sleep 20

# Import your data
docker-compose exec -T mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DB} < backup.sql

# Your auth keys will be automatically used if present in the project root
```

---

**Happy Dockering!**

For the traditional setup method, see [README.md](README.md).


# Valkyrie Master Server

A master server implementation for R5Valkyrie (Apex Legends) that provides server registration, client authentication, and comprehensive admin management tools.

## Tech Stack

- **Framework**: [Astro](https://astro.build/) (Server-Side Rendering)
- **Language**: TypeScript
- **Database**: MySQL (with parameterized queries for security)
- **Caching**: Redis
- **Authentication**: RSA-256 JWT tokens for game clients, session-based for admin panel
- **Encryption**: AES-128-GCM for secure server communication
- **Styling**: Plain CSS

## Features

### Public Frontend Website

- **Home Page**: Welcome screen with server status overview
- **Server Browser**: Searchable list of active game servers with player counts and status
- **Downloads**: Game client downloads and installation guides
- **Documentation**: Custom docs solution with markdown support and hierarchical navigation
- **EULA & License**: End-user license agreement and legal information
- **Contributors**: Community contributors acknowledgment page

### Core Functionality

- **Server Browser API**: Server registration and listing for the in-game server browser
- **Client Authentication**: Challenge-response authentication with Steam integration
- **Version Management**: Game version validation and checksum verification
- **Ban System**: Comprehensive ban management with Discord webhook notifications
- **MOTD System**: Message of the Day management for in-game notifications

### Admin Panel

Complete web-based administration interface for managing:

- **Dashboard**: System overview and key statistics
- **Admins**: Create and manage admin/moderator accounts with role-based access control
- **Users**: Query and manage player accounts
- **Ban Management**: View, add, and manage player bans with expiration support
- **Banlist Analytics**: Charts and trends for ban statistics
- **Server Monitoring**: Real-time server status, player counts, and activity
- **Version Control**: Manage supported game versions with edit/delete capabilities
- **Checksum Management**: Gamemode/version integrity verification
- **Verified Mods**: Manage approved Thunderstore modifications
- **API Keys**: Generate and manage API keys for external integrations
- **Settings**: Configure Discord webhooks, system settings, MOTD, and EULA
- **Analytics Dashboard**: Player statistics, ban trends, and system health monitoring

### Security Features

- SQL injection prevention with parameterized queries
- Timing-safe API key comparison
- Rate limiting and request validation
- Session-based authentication for admin panel
- Encrypted server communication

## Project Structure

```
src/
├── pages/              # Pages and API endpoints
│   ├── api/           # Backend API routes
│   │   ├── admin/     # Admin-only endpoints
│   │   ├── client/    # Game client endpoints
│   │   ├── server/    # Server management endpoints
│   │   └── versions/  # Version management
│   └── admin/         # Admin dashboard pages
├── components/        # Reusable Astro components
├── layouts/           # Page layout templates
├── lib/               # Core backend logic
│   ├── auth.ts       # JWT authentication
│   ├── db.ts         # Database connection
│   ├── gameServerClient.ts  # Server challenge-response protocol
│   ├── security.ts   # Security utilities
│   ├── sql-security.ts  # SQL injection prevention
│   └── ...           # Other utilities
└── types/            # TypeScript type definitions

public/               # Static assets (CSS, images)
```

---

## Getting Started

You have two options to run this project:

### Option 1: Docker (Recommended for Quick Setup) 🐳

**Perfect for users who want an easy, automated setup with all dependencies included.**

Docker handles all the installation and configuration automatically. Simply install Docker and run:

```bash
git clone https://github.com/r5valkyrie/master_server.git
cd master_server
cp docker.env.example .env
# Edit .env and change the passwords/secrets
docker-compose up -d
```

**That's it!** The application, MariaDB, and Redis will be running and configured.

**[Full Docker Setup Guide](DOCKER.md)** - Complete documentation for Docker installation, development, and troubleshooting.

### Option 2: Traditional Installation

**For users who prefer manual control or want to develop locally.**

Follow the instructions below for a traditional setup on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [MariaDB](https://mariadb.org/) server (v10.5 or newer)
- [Redis](https://redis.io/) server for caching server presence data
- RSA key pair for JWT signing (see Authentication Setup below)

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/r5valkyrie/master_server.git
cd master_server
npm install
```

### 2. Authentication Setup

Generate RSA key pair for JWT token signing:

```bash
# Generate private key (optionally with passphrase protection)
openssl genrsa -out auth.key 2048

# Generate public key
openssl rsa -in auth.key -pubout -out auth.pem

# (Optional) Generate passphrase-protected private key
openssl genrsa -aes256 -out auth.key 2048
```

**Security Warning**: Never commit these keys to version control. They are already in `.gitignore`.

### 3. Environment Variables

Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and fill in the required values:

```
# MySQL Database (Required)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASS=password
MYSQL_DB=r5

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=
# Disable Redis even if configured (set to "1" to disable)
DISABLE_REDIS=

# Server Time-To-Live in Redis (in seconds)
SERVER_TTL=35

# Admin Session Secret (Required)
# Secret key used to sign and verify admin web panel session tokens (JWT)
# Can be any strong password or random string of your choice
# Examples:
#   - Use a strong password: MyP@ssw0rd!SecureAdminKey2024
#   - Generate random: openssl rand -base64 32
#   - Simple memorable string: admin_secret_key_12345
# Minimum 16 characters recommended for security
ADMIN_SESSION_SECRET=your_secure_session_secret_here

# JWT Private Key Passphrase (Required if auth.key is passphrase-protected)
AUTH_KEY_PASSPHRASE=

# Application Environment (development or production)
NODE_ENV=development

# Allowed Hosts (Optional - comma-separated list for Vite server)
ALLOWED_HOSTS=
```

**Important Security Notes:**
- **Never commit** the `.env` file, `auth.key`, `auth.key.pub`, or `auth.pem` to version control
- The admin web panel uses **database user accounts** (managed via `/admin/userManagement`), not environment variables
- Change all default secrets before deploying to production
- Use strong, randomly generated secrets (at least 32 characters)
- Obtain your Steam Web API key from https://steamcommunity.com/dev/apikey
- After generating keys, regenerate them if ever exposed in git history

### 4. Database Setup

Import the database schema using the provided `schema.sql` file:

```bash
# Create the database
mysql -u root -p -e "CREATE DATABASE r5 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import the schema
mysql -u root -p r5 < schema.sql
```

Or import directly in one step:

```bash
# Schema will use existing database or you can uncomment the CREATE DATABASE line in schema.sql
mysql -u root -p < schema.sql
```

The `schema.sql` file includes:
- All required tables (users, banned_users, servers, checksums, versions, etc.)
- Optimized indexes for fast queries
- Cleanup procedures for expired bans and stale servers
- Default data (MOTD, EULA)
- **Default admin account** (see below)
- Detailed comments and documentation

#### Default Admin Account

The schema creates a default admin account for initial setup:

- **Username**: `admin`
- **Password**: `changeme`
- **Role**: `master` (full access)
- **Status**: Must change password on first login

**IMPORTANT SECURITY STEPS:**
1. Log in to the admin panel immediately after first deployment
2. Change the default password to a strong, unique password
3. Create additional admin/moderator accounts as needed
4. Delete or disable the default admin account once you have other accounts set up

**Optional**: Create a dedicated MySQL user for better security:

```bash
mysql -u root -p
```

```sql
CREATE USER 'r5valk'@'localhost' IDENTIFIED BY 'secure_password_here';
GRANT SELECT, INSERT, UPDATE, DELETE ON r5.* TO 'r5valk'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Then update your `.env` file with the new credentials.

### 5. External Repository Setup (Documentation & Contributors)

The project includes a custom documentation system that pulls markdown files from an external GitHub repository (`r5valkyrie/docs`). This allows you to maintain documentation and contributor information separately from the codebase.

**To configure documentation and contributors:**

1. Set up a GitHub repository for your documentation with the following structure:

```
docs-repo/
├── docs/
│   ├── sidebar.json
│   ├── welcome.md
│   ├── getting-started.md
│   └── your-custom-guide.md
└── contributors/
    ├── contributors.json
    └── r5reloaded_contributors.json
```

2. Create `docs/sidebar.json` to define the documentation navigation structure:

```json
{
    "startPage": "welcome",
    "sidebar": [
        {
            "title": "Introduction",
            "pages": [
                {
                    "title": "Welcome",
                    "slug": "welcome"
                },
                {
                    "title": "Getting Started",
                    "slug": "getting-started"
                },
                {
                    "title": "My Custom Guide",
                    "slug": "my-guide"
                }
            ]
        }
    ]
}
```

3. Create `contributors/contributors.json` with the following structure:

```json
[
    {
        "name": "Contributor Name",
        "role": "Role/Position",
        "avatar": "avatar_url"
    }
]
```

4. The master server will pull:
   - Documentation from `docs/` folder and serve at `/docs/{slug}` on the main website
   - Contributors data from `contributors/` folder and display on the `/contributors` page

**Note**: Update the GitHub repository configuration in the main server code to point to your documentation repository URL (default: `r5valkyrie/docs`).

### 6. Running the Development Server

Start the Astro development server:

```bash
npm run dev
```

The application will be available at:

- Main site: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin/login`

### 7. Building for Production

To create a production-ready build:

```bash
npm run build
```

This will output the built files to the `dist/` directory. Preview the production build locally:

```bash
npm run preview
```

---

## API Documentation

### Authentication

**Admin Panel**: Uses session-based authentication with database user accounts (master/admin/moderator roles).

### Key Endpoints

- `POST /api/client/auth` - Client authentication with challenge-response
- `GET /api/servers` - List active game servers
- `POST /api/servers/add` - Register a new server
- `GET /api/banlist` - Get ban list
- `GET /api/versions/list` - Get supported versions
- `POST /api/admin/*` - Admin-only endpoints (require API key)

---

## Security

This project implements multiple security measures:

- **SQL Injection Prevention**: All queries use parameterized statements
- **Timing Attack Protection**: Constant-time comparisons for sensitive operations
- **Input Validation**: Comprehensive validation on all user inputs
- **Rate Limiting**: Protection against abuse (implementation varies by endpoint)
- **Session Management**: Secure JWT sessions for admin panel
- **Encryption**: AES-128-GCM for server communication

---

## Contributing

Contributions are welcome! Please ensure:

1. All sensitive data is properly configured via environment variables
2. No hardcoded credentials or keys in code
3. SQL queries use parameterized statements
4. New endpoints include proper authentication checks
5. Code follows existing patterns and conventions

---

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPLv3) - see the [LICENSE](LICENSE) file for details.

**What this means:**
- You can use, modify, and distribute this software
- You can run it as a service for your community
- If you modify and deploy it as a network service, you must share your changes
- Any derivative works must also be licensed under AGPLv3

---

## Acknowledgments

- Built for R5Valkyrie community
- Uses Steam for authentication
- Discord integration for community notifications

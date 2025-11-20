# Valkyrie Master Server

A master server implementation for R5Valkyrie (Apex Legends) that provides server registration, client authentication, and comprehensive admin management tools.

## Tech Stack

- **Framework**: [Astro](https://astro.build/) (Server-Side Rendering)
- **Language**: TypeScript
- **Database**: MySQL (with parameterized queries for security)
- **Caching**: Redis (optional)
- **Authentication**: RSA-256 JWT tokens for game clients, session-based for admin panel
- **Encryption**: AES-128-GCM for secure server communication
- **Styling**: Plain CSS

## Features

### Core Functionality
- **Server Browser API**: Server registration and listing for the in-game server browser
- **Client Authentication**: Challenge-response authentication with Steam integration
- **Version Management**: Game version validation and checksum verification
- **Ban System**: Comprehensive ban management with Discord webhook notifications
- **MOTD System**: Message of the Day management for in-game notifications

### Admin Panel
Complete web-based administration interface for managing:
- **User Management**: Create and manage admin/moderator accounts with role-based access
- **Ban Management**: View, add, and manage player bans with expiration support
- **Server Monitoring**: Real-time server status and player counts
- **Version Control**: Manage supported game versions
- **Checksum Management**: Gamemode verification system
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

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [MySQL](https://www.mysql.com/) server (v8.0 or newer)
- (Optional) [Redis](https://redis.io/) server for caching server presence data
- RSA key pair for JWT signing (see Authentication Setup below)

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/r5valkyrie/r5valk-ms-astro.git
cd r5valk-ms-astro
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

# Redis (Optional - the app will run without it)
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=
# Disable Redis even if configured (set to "1" to disable)
DISABLE_REDIS=

# Server Time-To-Live in Redis (in seconds)
SERVER_TTL=35

# API Key for Client/Programmatic Access (Required)
# Used by game clients and external tools to authenticate API requests
# This is NOT for the admin web panel - that uses user accounts from the database
API_KEY=your_secure_api_key_here

# Admin Session Secret (Required)
# Used for admin web panel JWT session tokens
ADMIN_SESSION_SECRET=your_secure_session_secret_here

# JWT Private Key Passphrase (Required if auth.key is passphrase-protected)
AUTH_KEY_PASSPHRASE=

# Steam API Configuration (Required for Steam authentication)
STEAM_WEB_API_KEY=your_steam_api_key_here
STEAM_APP_ID=480

# Discord Bot Configuration (Optional - for logging and notifications)
# A single Discord bot token is used for all messaging features
DISCORD_BOT_TOKEN=

# Discord Channel IDs (Optional - where the bot sends messages)
# Admin log channel for administrative actions and general system notifications (bans, checksums, versions, security alerts, user cleanups, etc.)
DISCORD_ADMIN_LOG_CHANNEL_ID=
# Server browser channel for server browser embed updates
DISCORD_SERVER_BROWSER_CHANNEL_ID=
# Server count channel - bot renames this channel to show live server count (e.g., "servers online: 42")
DISCORD_SERVER_COUNT_CHANNEL_ID=
# Player count channel - bot renames this channel to show live player count (e.g., "players online: 128")
DISCORD_PLAYER_COUNT_CHANNEL_ID=
# Mod updates channel for all Thunderstore mod update notifications
DISCORD_MOD_UPDATES_CHANNEL_ID=

# Discord Command Authorization (Optional - comma-separated user IDs allowed to run bot commands)
DISCORD_COMMAND_ALLOW_IDS=

# Thunderstore watcher (Optional)
# Community key on Thunderstore (default: r5valkyrie)
THUNDERSTORE_COMMUNITY=r5valkyrie
# Poll interval in milliseconds (default 300000 = 5 minutes)
THUNDERSTORE_CHECK_INTERVAL_MS=300000

# Ban and User Cleanup Configuration (optional)
# Interval for expired ban cleanup in hours (default: 12)
BAN_CLEANUP_INTERVAL_HOURS=12
# Inactivity threshold for user cleanup in hours (default: 24)
USER_CLEANUP_INACTIVE_HOURS=24

# Game Server Configuration (optional)
# Default server port for authentication fallback (default: 37015)
DEFAULT_SERVER_PORT=37015

# Application Environment
NODE_ENV=development

# Allowed Hosts (Optional - comma-separated list for Vite server)
ALLOWED_HOSTS=
```

**Important Security Notes:**
- **Never commit** the `.env` file, `auth.key`, `auth.key.pub`, or `auth.pem` to version control
- The admin web panel uses **database user accounts** (managed via `/admin/userManagement`), not environment variables
- The `API_KEY` is for **game clients and programmatic API access**, not for web panel login
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

### 5. Running the Development Server

Start the Astro development server:

```bash
npm run dev
```

The application will be available at:
- Main site: `http://localhost:4321`
- Admin panel: `http://localhost:4321/admin/dashboard`

Use the `--host` flag to make it accessible on your local network:

```bash
npm run dev -- --host
```

### 6. Building for Production

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

**Game Client API**: Include `x-r5v-key` header with your `API_KEY` value for all client endpoints.

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

See `SECURITY.md` for more detailed information.

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

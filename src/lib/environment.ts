/**
 * Secure environment variable handling
 */

interface EnvironmentConfig {
    MYSQL_HOST: string;
    MYSQL_USER: string;
    MYSQL_PASS: string;
    MYSQL_DB: string;
    API_KEY: string;
    STEAM_API_KEY?: string;
    STEAM_WEB_API_KEY?: string;
    STEAM_APP_ID?: string;
    AUTH_KEY_PASSPHRASE?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_WEBHOOK_ADMIN?: string;
    DISCORD_WEBHOOK_GENERAL?: string;
    DISCORD_WEBHOOK_SERVERS?: string;
    DISCORD_SERVERS_CHANNEL_ID?: string;
    DISCORD_SERVERS_LOG_CHANNEL_ID?: string;
    DISCORD_PLAYERS_CHANNEL_ID?: string;
    DISCORD_COMMAND_ALLOW_IDS?: string;
    THUNDERSTORE_COMMUNITY?: string;
    THUNDERSTORE_DISCORD_WEBHOOK?: string;
    THUNDERSTORE_CHECK_INTERVAL_MS?: string;
    NODE_ENV?: string;
}

/**
 * Validates that all required environment variables are present
 */
export function validateEnvironment(): EnvironmentConfig {
    const requiredVars = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DB', 'API_KEY'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return {
        MYSQL_HOST: process.env.MYSQL_HOST!,
        MYSQL_USER: process.env.MYSQL_USER!,
        MYSQL_PASS: process.env.MYSQL_PASS || '',
        MYSQL_DB: process.env.MYSQL_DB!,
        API_KEY: process.env.API_KEY!,
        STEAM_API_KEY: process.env.STEAM_API_KEY,
        STEAM_WEB_API_KEY: process.env.STEAM_WEB_API_KEY,
        STEAM_APP_ID: process.env.STEAM_APP_ID,
        AUTH_KEY_PASSPHRASE: process.env.AUTH_KEY_PASSPHRASE,
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
        DISCORD_WEBHOOK_ADMIN: process.env.DISCORD_WEBHOOK_ADMIN,
        DISCORD_WEBHOOK_GENERAL: process.env.DISCORD_WEBHOOK_GENERAL,
        DISCORD_WEBHOOK_SERVERS: process.env.DISCORD_WEBHOOK_SERVERS,
        DISCORD_SERVERS_CHANNEL_ID: process.env.DISCORD_SERVERS_CHANNEL_ID,
        DISCORD_SERVERS_LOG_CHANNEL_ID: process.env.DISCORD_SERVERS_LOG_CHANNEL_ID,
        DISCORD_PLAYERS_CHANNEL_ID: process.env.DISCORD_PLAYERS_CHANNEL_ID,
        DISCORD_COMMAND_ALLOW_IDS: process.env.DISCORD_COMMAND_ALLOW_IDS,
        THUNDERSTORE_COMMUNITY: process.env.THUNDERSTORE_COMMUNITY,
        THUNDERSTORE_DISCORD_WEBHOOK: process.env.THUNDERSTORE_DISCORD_WEBHOOK,
        THUNDERSTORE_CHECK_INTERVAL_MS: process.env.THUNDERSTORE_CHECK_INTERVAL_MS,
        NODE_ENV: process.env.NODE_ENV || 'development'
    };
}

/**
 * Safely log environment status without exposing secrets
 */
export function logEnvironmentStatus(): void {
    const config = validateEnvironment();
    
    console.log('[Environment] Configuration:');
    console.log(`   NODE_ENV: ${config.NODE_ENV}`);
    console.log(`   MYSQL: ${config.MYSQL_HOST}/${config.MYSQL_DB} as ${config.MYSQL_USER}`);
    console.log(`   API_KEY: ${config.API_KEY ? 'Set' : 'Missing'}`);
    console.log(`   STEAM_API_KEY: ${config.STEAM_API_KEY ? 'Set' : 'Not set'}`);
}

/**
 * Check if we're in a production environment
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

/**
 * Check if we're in a development environment
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production';
}

-- R5Valkyrie Master Server Database Schema
-- MariaDB 10.5+ or MySQL 8.0+ Required
-- 
-- This schema includes all tables, indexes, and constraints needed for the R5Valkyrie master server.
-- Run this script to quickly set up a new database instance.
--
-- Usage:
--   mysql -u root -p < schema.sql
--   OR
--   mysql -u root -p your_database_name < schema.sql

-- Create database (optional - uncomment if needed)
-- CREATE DATABASE IF NOT EXISTS r5 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE r5;

-- ============================================================================
-- USERS TABLE
-- Stores player information from game clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS `users` (
    `steam_id` VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'Steam ID 64-bit as string',
    `name` VARCHAR(255) NOT NULL COMMENT 'Current player name',
    `first_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'First time player connected',
    `last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last time player was seen',
    `flagged` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Manual flag for suspicious activity',
    
    INDEX `idx_last_seen` (`last_seen` DESC) COMMENT 'For recent activity queries',
    INDEX `idx_first_seen` (`first_seen` DESC) COMMENT 'For user growth statistics',
    INDEX `idx_name` (`name`) COMMENT 'For name-based searches',
    INDEX `idx_flagged` (`flagged`) COMMENT 'For filtering flagged users'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Player accounts and activity tracking';

-- ============================================================================
-- DAILY PLAYER COUNT TABLE
-- Tracks daily unique player statistics
-- ============================================================================
CREATE TABLE IF NOT EXISTS `daily_playercount` (
    `date` DATE NOT NULL PRIMARY KEY COMMENT 'Date of the player count',
    `total_players` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total unique players for this day',
    
    INDEX `idx_date` (`date` DESC) COMMENT 'For chronological queries'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Daily unique player statistics';

-- ============================================================================
-- USERNAME HISTORY TABLE
-- Tracks all username changes for each player
-- ============================================================================
CREATE TABLE IF NOT EXISTS `username_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `steam_id` VARCHAR(20) NOT NULL COMMENT 'References users.steam_id',
    `name` VARCHAR(255) NOT NULL COMMENT 'Username at this point in time',
    `last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last time this username was used',
    
    UNIQUE KEY `unique_steam_name` (`steam_id`, `name`) COMMENT 'Prevent duplicate name entries',
    INDEX `idx_steam_id` (`steam_id`) COMMENT 'For user lookup',
    INDEX `idx_last_seen` (`last_seen` DESC) COMMENT 'For recent changes',
    INDEX `idx_name` (`name`) COMMENT 'For name-based searches'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Username change history for tracking';

-- ============================================================================
-- BANNED USERS TABLE
-- Stores ban information for players and IPs
-- ============================================================================
CREATE TABLE IF NOT EXISTS `banned_users` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `identifier` VARCHAR(64) NOT NULL COMMENT 'Steam ID or IP address',
    `identifier_type` ENUM('steam_id', 'ip') NOT NULL DEFAULT 'steam_id' COMMENT 'Type of ban identifier',
    `ban_reason` TEXT NOT NULL COMMENT 'Reason for the ban',
    `ban_type` ENUM('permanent', 'temporary') NOT NULL DEFAULT 'permanent' COMMENT 'Ban duration type',
    `ban_expiry_date` DATETIME NULL DEFAULT NULL COMMENT 'Expiry date for temporary bans',
    `ban_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Deprecated: Use created_at instead',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When ban was created',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    UNIQUE KEY `unique_identifier` (`identifier`) COMMENT 'One ban per identifier',
    INDEX `idx_identifier_type` (`identifier_type`) COMMENT 'For filtering by ban type',
    INDEX `idx_ban_type` (`ban_type`) COMMENT 'For permanent vs temporary stats',
    INDEX `idx_expiry` (`ban_expiry_date`) COMMENT 'For cleanup of expired bans',
    INDEX `idx_created_at` (`created_at` DESC) COMMENT 'For recent ban statistics'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Player and IP ban management';

-- ============================================================================
-- SERVERS TABLE
-- Active game server listings (managed via Redis TTL in production)
-- Note: This table may be used for persistence or as fallback when Redis is unavailable
-- ============================================================================
CREATE TABLE IF NOT EXISTS `servers` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `ip` VARCHAR(45) NOT NULL COMMENT 'Server IP address (IPv4 or IPv6)',
    `port` INT UNSIGNED NOT NULL COMMENT 'Server port',
    `name` VARCHAR(255) NOT NULL COMMENT 'Server display name',
    `description` TEXT COMMENT 'Server description',
    `map` VARCHAR(100) COMMENT 'Current map',
    `playlist` VARCHAR(100) COMMENT 'Current playlist/gamemode',
    `version` VARCHAR(50) COMMENT 'Game version',
    `num_players` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Current player count',
    `max_players` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Maximum player capacity',
    `checksum` VARCHAR(64) COMMENT 'Server checksum for verification',
    `token` VARCHAR(64) COMMENT 'Server authentication token',
    `hidden` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Hide from public server list',
    `has_password` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Password protected',
    `password` VARCHAR(255) COMMENT 'Server password (if has_password=1)',
    `required_mods` JSON COMMENT 'Array of required mod objects',
    `enabled_mods` JSON COMMENT 'Array of enabled mod objects',
    `last_heartbeat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last heartbeat from server',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When server was first registered',
    
    UNIQUE KEY `unique_ip_port` (`ip`, `port`) COMMENT 'One server per IP:port combination',
    INDEX `idx_last_heartbeat` (`last_heartbeat` DESC) COMMENT 'For cleanup of stale servers',
    INDEX `idx_hidden` (`hidden`) COMMENT 'For public server list filtering',
    INDEX `idx_num_players` (`num_players` DESC) COMMENT 'For sorting by player count',
    INDEX `idx_version` (`version`) COMMENT 'For version-based filtering'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Active game server registry';

-- ============================================================================
-- VERSIONS TABLE
-- Supported game client versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS `versions` (
    `name` VARCHAR(50) NOT NULL PRIMARY KEY COMMENT 'Version identifier (e.g., v3.0.0)',
    `supported` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Is this version currently supported?',
    `flags` INT NOT NULL DEFAULT 0 COMMENT 'Version flags (bitfield)',
    `checksums_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Enable checksum validation for this version',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When version was added',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_supported` (`supported`) COMMENT 'For filtering active versions'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Game version management';

-- ============================================================================
-- CHECKSUMS TABLE
-- Valid file checksums for anti-cheat verification
-- ============================================================================
CREATE TABLE IF NOT EXISTS `checksums` (
    `checksum` VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'SHA256 or similar file hash',
    `sdkversion` VARCHAR(50) NOT NULL COMMENT 'Associated SDK/game version',
    `description` TEXT COMMENT 'File or module description',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When checksum was added',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_sdkversion` (`sdkversion`) COMMENT 'For version-specific checksum lookups',
    FOREIGN KEY (`sdkversion`) REFERENCES `versions`(`name`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='File checksum whitelist for anti-cheat';

-- ============================================================================
-- VERIFIED MODS TABLE
-- Approved/whitelisted mods for the game
-- ============================================================================
CREATE TABLE IF NOT EXISTS `verified_mods` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL COMMENT 'Mod name',
    `owner` VARCHAR(255) NOT NULL COMMENT 'Mod author/owner',
    `thunderstore_link` VARCHAR(500) COMMENT 'Thunderstore URL',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When mod was verified',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    UNIQUE KEY `unique_name_owner` (`name`, `owner`) COMMENT 'Prevent duplicate mod entries',
    INDEX `idx_name` (`name`) COMMENT 'For mod name searches',
    INDEX `idx_owner` (`owner`) COMMENT 'For author searches',
    INDEX `idx_created_at` (`created_at` DESC) COMMENT 'For recent additions'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Whitelisted mods approved for use';

-- ============================================================================
-- ADMIN USERS TABLE
-- Admin panel user accounts with role-based access
-- ============================================================================
CREATE TABLE IF NOT EXISTS `admin_users` (
    `username` VARCHAR(100) NOT NULL PRIMARY KEY COMMENT 'Admin username for login',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed password',
    `role` ENUM('master', 'admin', 'moderator') NOT NULL DEFAULT 'moderator' COMMENT 'Access level',
    `must_change_password` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Force password change on next login',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation time',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_role` (`role`) COMMENT 'For role-based queries'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin panel user accounts';

-- Insert default admin account: username="admin" password="changeme"
-- Password hash is bcrypt hash of "changeme" (cost factor 12)
-- IMPORTANT: Change this password on first login!
INSERT INTO `admin_users` (`username`, `password_hash`, `role`, `must_change_password`) VALUES 
('admin', '$2b$12$biBWYIXUobBihY7wNJmbHuTMHKn2.3Y/Xp2EL7TqnerbfO/m67QCO', 'master', 1)
ON DUPLICATE KEY UPDATE `username`=`username`;

-- ============================================================================
-- ADMIN ACTIVITY LOG TABLE (Optional)
-- Tracks admin actions for audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS `admin_activity_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(100) NOT NULL COMMENT 'Admin who performed the action',
    `action` VARCHAR(100) NOT NULL COMMENT 'Action type (ban_user, unban_user, etc)',
    `target` VARCHAR(255) COMMENT 'Target of the action (user ID, IP, etc)',
    `details` TEXT COMMENT 'Additional action details (JSON recommended)',
    `ip_address` VARCHAR(45) COMMENT 'Admin IP address',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When action was performed',
    
    INDEX `idx_username` (`username`) COMMENT 'For user activity queries',
    INDEX `idx_action` (`action`) COMMENT 'For action type filtering',
    INDEX `idx_created_at` (`created_at` DESC) COMMENT 'For recent activity',
    INDEX `idx_target` (`target`) COMMENT 'For target-based lookups'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin action audit trail';

-- ============================================================================
-- MOTD TABLE
-- Message of the Day for clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS `motd` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `content` TEXT NOT NULL COMMENT 'Message content (HTML or plain text)',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Message of the day';

-- Insert default MOTD if table is empty
INSERT INTO `motd` (`id`, `content`) VALUES (1, 'Welcome to R5Valkyrie!')
ON DUPLICATE KEY UPDATE `id`=`id`;

-- ============================================================================
-- EULA TABLE
-- End User License Agreement in multiple languages
-- ============================================================================
CREATE TABLE IF NOT EXISTS `eula` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `lang` VARCHAR(50) NOT NULL COMMENT 'Language code (e.g., english, spanish)',
    `contents` MEDIUMTEXT NOT NULL COMMENT 'EULA text content',
    `modified` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    UNIQUE KEY `unique_lang` (`lang`) COMMENT 'One EULA per language'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='End User License Agreement';

-- Insert default EULA
INSERT INTO `eula` (`lang`, `contents`) VALUES 
('english', 'By using R5Valkyrie, you agree to follow the community guidelines and rules.')
ON DUPLICATE KEY UPDATE `lang`=`lang`;

-- ============================================================================
-- LOBBY NEWS TABLE
-- News items displayed in game lobby
-- ============================================================================
CREATE TABLE IF NOT EXISTS `lobby_news` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL COMMENT 'News headline',
    `content` TEXT NOT NULL COMMENT 'News content',
    `image_url` VARCHAR(500) COMMENT 'Optional image URL',
    `link_url` VARCHAR(500) COMMENT 'Optional link URL',
    `priority` INT NOT NULL DEFAULT 0 COMMENT 'Display priority (higher = more prominent)',
    `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Is this news item active?',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Publication date',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update',
    
    INDEX `idx_active_priority` (`active`, `priority` DESC) COMMENT 'For displaying active news',
    INDEX `idx_created_at` (`created_at` DESC) COMMENT 'For chronological ordering'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='In-game lobby news feed';

-- ============================================================================
-- PERFORMANCE OPTIMIZATION NOTES
-- ============================================================================
-- 1. All primary keys use appropriate data types (VARCHAR for Steam IDs, INT/BIGINT for IDs)
-- 2. Indexes added on frequently queried columns (last_seen, steam_id, identifier, etc)
-- 3. Foreign keys ensure referential integrity where applicable
-- 4. utf8mb4_unicode_ci collation for proper Unicode support (emoji, special characters)
-- 5. InnoDB engine for ACID compliance and foreign key support
-- 6. JSON columns for flexible mod data storage (MySQL 5.7.8+)
-- 7. ON UPDATE CURRENT_TIMESTAMP for automatic timestamp tracking
-- 8. Comments on all tables and columns for documentation

-- ============================================================================
-- ADDITIONAL OPTIMIZATION RECOMMENDATIONS
-- ============================================================================
-- 1. For large deployments (>100k users), consider partitioning:
--    - Partition `username_history` by date range
--    - Partition `admin_activity_log` by date range
--    - Archive old data to separate tables
--
-- 2. Monitor slow queries with:
--    SET GLOBAL slow_query_log = 'ON';
--    SET GLOBAL long_query_time = 2;
--
-- 3. Regular maintenance:
--    OPTIMIZE TABLE users, username_history, banned_users;
--    ANALYZE TABLE users, username_history, banned_users;
--
-- 4. Consider adding Redis for:
--    - Active server listings (with TTL)
--    - Player session data
--    - Rate limiting
--
-- 5. Enable query cache for read-heavy operations:
--    SET GLOBAL query_cache_size = 268435456; # 256MB
--    SET GLOBAL query_cache_type = 1;

-- ============================================================================
-- SECURITY RECOMMENDATIONS
-- ============================================================================
-- 1. Create a dedicated MySQL user with limited privileges:
--    CREATE USER 'r5valk'@'localhost' IDENTIFIED BY 'secure_password_here';
--    GRANT SELECT, INSERT, UPDATE, DELETE ON r5.* TO 'r5valk'@'localhost';
--    FLUSH PRIVILEGES;
--
-- 2. Never store passwords in plain text (app uses bcrypt)
-- 3. Use prepared statements for all queries (app already does this)
-- 4. Regularly backup the database:
--    mysqldump -u root -p r5 > backup_$(date +%Y%m%d).sql
--
-- 5. Enable binary logging for point-in-time recovery:
--    Add to my.cnf:
--    [mysqld]
--    log-bin=mysql-bin
--    expire_logs_days=7

-- ============================================================================
-- CLEANUP PROCEDURES
-- ============================================================================

-- Remove expired temporary bans (run via cron job or scheduled task)
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS `cleanup_expired_bans`()
BEGIN
    DELETE FROM `banned_users` 
    WHERE `ban_type` = 'temporary' 
    AND `ban_expiry_date` IS NOT NULL 
    AND `ban_expiry_date` < NOW();
END$$
DELIMITER ;

-- Remove stale servers (if not using Redis TTL)
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS `cleanup_stale_servers`()
BEGIN
    DELETE FROM `servers` 
    WHERE `last_heartbeat` < DATE_SUB(NOW(), INTERVAL 5 MINUTE);
END$$
DELIMITER ;

-- Archive old admin activity logs (keeps last 90 days)
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS `archive_old_activity_logs`()
BEGIN
    -- Create archive table if it doesn't exist
    CREATE TABLE IF NOT EXISTS `admin_activity_log_archive` LIKE `admin_activity_log`;
    
    -- Move old records to archive
    INSERT INTO `admin_activity_log_archive`
    SELECT * FROM `admin_activity_log`
    WHERE `created_at` < DATE_SUB(NOW(), INTERVAL 90 DAY);
    
    -- Delete archived records from main table
    DELETE FROM `admin_activity_log`
    WHERE `created_at` < DATE_SUB(NOW(), INTERVAL 90 DAY);
END$$
DELIMITER ;

-- ============================================================================
-- DISCORD CONFIG TABLE
-- Stores Discord bot channel IDs and configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS `discord_config` (
    `config_key` VARCHAR(100) NOT NULL PRIMARY KEY COMMENT 'Configuration key identifier',
    `config_value` VARCHAR(500) NOT NULL COMMENT 'Configuration value (usually channel ID)',
    `description` TEXT COMMENT 'Human-readable description of what this config does',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_updated_at` (`updated_at` DESC) COMMENT 'For tracking recent changes'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Discord bot configuration and channel IDs';

-- Insert default Discord config keys
INSERT INTO `discord_config` (`config_key`, `config_value`, `description`) VALUES 
('DISCORD_BOT_TOKEN', '', 'Discord bot token for API authentication'),
('DISCORD_ADMIN_LOG_CHANNEL_ID', '', 'Channel for admin log events and server startup messages'),
('DISCORD_SERVER_BROWSER_CHANNEL_ID', '', 'Channel for active server browser embed'),
('DISCORD_SERVER_COUNT_CHANNEL_ID', '', 'Channel name that displays server count'),
('DISCORD_PLAYER_COUNT_CHANNEL_ID', '', 'Channel name that displays total player count'),
('DISCORD_MOD_UPDATES_CHANNEL_ID', '', 'Channel for Thunderstore mod update notifications'),
('DISCORD_COMMAND_ALLOW_IDS', '', 'Comma-separated list of Discord user IDs allowed to run bot commands')
ON DUPLICATE KEY UPDATE `config_key`=`config_key`;

-- ============================================================================
-- API KEYS TABLE
-- Stores API keys for client and programmatic access
-- ============================================================================
CREATE TABLE IF NOT EXISTS `api_keys` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key_name` VARCHAR(255) NOT NULL COMMENT 'Friendly name for the API key',
    `key_hash` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Hashed API key (bcrypt)',
    `key_prefix` VARCHAR(10) NOT NULL COMMENT 'First 10 chars of key for identification',
    `description` TEXT COMMENT 'Description of what this key is used for',
    `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Whether this key is active',
    `last_used` DATETIME COMMENT 'Last time this key was used',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the key was created',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_key_prefix` (`key_prefix`) COMMENT 'For quick key lookup',
    INDEX `idx_active` (`active`) COMMENT 'For finding active keys',
    INDEX `idx_created_at` (`created_at` DESC) COMMENT 'For recent keys'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API key management for client and programmatic access';

-- ============================================================================
-- SYSTEM SETTINGS TABLE
-- Stores system configuration settings previously in environment variables
-- ============================================================================
CREATE TABLE IF NOT EXISTS `system_settings` (
    `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY COMMENT 'Setting identifier (e.g., STEAM_WEB_API_KEY)',
    `setting_value` TEXT NOT NULL COMMENT 'Setting value',
    `description` TEXT COMMENT 'Human-readable description of this setting',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification time',
    
    INDEX `idx_updated_at` (`updated_at` DESC) COMMENT 'For tracking recent changes'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System configuration settings from environment variables';

-- Insert default system settings
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`) VALUES 
('STEAM_WEB_API_KEY', '', 'Steam Web API key for Steam profile lookups'),
('STEAM_APP_ID', '1172470', 'Steam App ID to use (Will show as the game being played)'),
('THUNDERSTORE_COMMUNITY', 'r5valkyrie', 'Community key on Thunderstore for mod tracking'),
('THUNDERSTORE_CHECK_INTERVAL_MS', '300000', 'Poll interval in milliseconds for Thunderstore updates (default: 5 minutes)'),
('BAN_CLEANUP_INTERVAL_HOURS', '12', 'Interval for expired ban cleanup in hours'),
('USER_CLEANUP_INACTIVE_HOURS', '24', 'Inactivity threshold for user cleanup in hours'),
('DEFAULT_SERVER_PORT', '37015', 'Default server port for authentication fallback')
ON DUPLICATE KEY UPDATE `setting_key`=`setting_key`;

-- ============================================================================
-- SCHEMA VERSION INFO
-- ============================================================================
CREATE TABLE IF NOT EXISTS `schema_version` (
    `version` VARCHAR(20) NOT NULL PRIMARY KEY,
    `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `description` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `schema_version` (`version`, `description`) VALUES 
('1.0.0', 'Initial schema for R5Valkyrie Master Server'),
('1.1.0', 'Added discord_config table for storing Discord bot channel IDs'),
('1.2.0', 'Added api_keys table for API key management'),
('1.3.0', 'Added system_settings table for system configuration')
ON DUPLICATE KEY UPDATE `version`=`version`;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to verify the schema was created successfully:
--
-- SHOW TABLES;
-- SHOW CREATE TABLE users;
-- SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE();
-- SHOW INDEXES FROM users;
-- SHOW INDEXES FROM banned_users;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- Schema created for R5Valkyrie Master Server
-- Repository: https://github.com/r5valkyrie/r5valk-ms-astro
-- License: GNU Affero General Public License v3.0 (AGPLv3)
-- For support and documentation, see README.md
-- ============================================================================

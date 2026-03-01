import type { APIRoute } from 'astro';
import { getAllSystemSettings, setSystemSetting } from '../../../lib/db';
import { logger } from '../../../lib/logger';
import { validateString } from '../../../lib/input-validation';

// Allowlist of valid system setting keys — prevents arbitrary key injection
const ALLOWED_SETTING_KEYS = new Set([
    'site_name', 'site_description', 'maintenance_mode', 'maintenance_message',
    'max_servers', 'server_timeout', 'registration_enabled', 'motd_enabled',
    'ban_appeal_url', 'max_login_attempts', 'session_timeout',
    'discord_notifications_enabled', 'update_check_enabled',
]);

/**
 * GET /api/admin/systemSettings - Retrieve all system settings
 * POST /api/admin/systemSettings - Update system settings
 * 
 * Note: Access control is handled by middleware.ts (master-only)
 */
export const GET: APIRoute = async (context) => {
  try {
    const settings = await getAllSystemSettings();
    return new Response(JSON.stringify({ success: true, settings }), { status: 200 });
  } catch (error) {
    logger.error(`Error fetching system settings: ${error}`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json() as any;
    const updates = body.updates as Array<{ key: string; value: string }> || [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No updates provided' }), { status: 400 });
    }

    // Update each setting
    for (const update of updates) {
      const key = String(update.key || '').trim();
      const value = String(update.value || '').trim();
      
      if (!key) continue;

      // Enforce setting key allowlist
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        logger.warn(`Rejected unknown system setting key: ${key}`, { prefix: 'SYSTEM_SETTINGS' });
        continue;
      }

      // Validate value length
      const valCheck = validateString(value, 0, 2000);
      if (!valCheck.valid) {
        logger.warn(`Rejected invalid value for setting ${key}: ${valCheck.error}`, { prefix: 'SYSTEM_SETTINGS' });
        continue;
      }
      
      const result = await setSystemSetting(key, value);
      if (!result) {
        logger.warn(`Failed to update system setting: ${key}`, { prefix: 'SYSTEM_SETTINGS' });
      }
    }

    logger.info(`Updated ${updates.length} system setting(s)`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: true, updated: updates.length }), { status: 200 });
  } catch (error) {
    logger.error(`Error updating system settings: ${error}`, { prefix: 'SYSTEM_SETTINGS' });
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};

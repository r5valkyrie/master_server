import type { APIRoute } from 'astro';
import { addBan } from '../../../lib/bansystem';
import { validateString, validateSteamId, validateIpAddress } from '../../../lib/input-validation';
import { checkRateLimit, isValidBanReason } from '../../../lib/security';

export const POST: APIRoute = async ({ request, clientAddress }) => {
    try {
        // Rate limiting — 30 requests per minute per IP
        const clientIp = clientAddress || 'unknown';
        if (!checkRateLimit(`banUser-api-${clientIp}`, 30, 60000)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Rate limit exceeded. Please wait before making more requests.'
            }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }

        const url = new URL(request.url);
        const steamId = url.searchParams.get('steamId')?.trim() || null;
        const ipAddr = url.searchParams.get('ipAddr')?.trim() || null;
        const days = url.searchParams.get('days');
        const reason = url.searchParams.get('reason') || '';

        // Validate identifiers
        if (steamId) {
            const check = validateSteamId(steamId);
            if (!check.valid) {
                return new Response(JSON.stringify({ success: false, error: `Invalid Steam ID: ${check.error}` }), { status: 400 });
            }
        } else if (ipAddr) {
            const check = validateIpAddress(ipAddr);
            if (!check.valid) {
                return new Response(JSON.stringify({ success: false, error: `Invalid IP address: ${check.error}` }), { status: 400 });
            }
        } else {
            return new Response(JSON.stringify({ success: false, error: 'A Steam ID or IP address is required' }), { status: 400 });
        }

        // Validate ban reason
        if (!isValidBanReason(reason)) {
            return new Response(JSON.stringify({ success: false, error: 'Ban reason must be between 3 and 500 characters' }), { status: 400 });
        }

        // Parse expiry
        let expiry: Date | null = null;
        if (days) {
            const d = parseInt(days, 10);
            if (!isNaN(d) && d > 0 && d <= 3650) {
                expiry = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
            }
        }

        if (steamId) {
            const banStatus = await addBan(steamId, reason, 1, expiry);
            return new Response(JSON.stringify(banStatus), { status: 200 });
        } else {
            const banStatus = await addBan(ipAddr!, reason, 0, expiry);
            return new Response(JSON.stringify(banStatus), { status: 200 });
        }
    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'An internal server error occurred.' 
        }), { status: 500 });
    }
}

import { getServerKeys, getKnownServerKeys, replaceKnownServerKeys, getServerByIPAndPort, upsertServerMeta, getServerMeta, removeServerMeta } from './servers.ts';
import { logGeneralEmbed, logServersEmbed, updateServersCountChannel, updatePlayersCountChannel, deleteAllChannelMessages, deleteOtherChannelMessages, postBotMessage, editBotMessage, startPrefixCommandListener, registerCommand } from './discord.ts';
import { getServers, getActiveServersListMessageId, setActiveServersListMessageId } from './servers.ts';
import { logger } from './logger.ts';

let trackerStarted = false;

function parseKey(key: string): { ip: string, port: number } | null {
    // key format: servers:IP:PORT
    const parts = key.split(':');
    if (parts.length < 3) return null;
    const portStr = parts.pop() as string;
    const ip = parts.slice(1).join(':'); // in case IPv6 literal without brackets
    const port = parseInt(portStr, 10);
    if (!ip || Number.isNaN(port)) return null;
    return { ip, port };
}

export function startServerPresenceTracker(intervalSeconds = 15): void {
    if (trackerStarted) return;
    trackerStarted = true;

    const intervalMs = Math.max(5, intervalSeconds) * 1000;

    const tick = async () => {
        try {
            const currentKeys = await getServerKeys();
            const previousSet = await getKnownServerKeys();
            const currentSet = new Set(currentKeys);

            // Added = current - previous
            const added: string[] = [];
            for (const k of currentSet) if (!previousSet.has(k)) added.push(k);
            // Removed = previous - current
            const removed: string[] = [];
            for (const k of previousSet) if (!currentSet.has(k)) removed.push(k);

            // Log additions with server details (no IPs in content)
            for (const key of added) {
                const parsed = parseKey(key);
                if (!parsed) continue;
                try {
                    const sv = await getServerByIPAndPort(parsed.ip, parsed.port);
                    if (sv && sv.name) {
                        const name = sv.name;
                        const map = sv.map || '';
                        const playlist = sv.playlist || '';
                        const requiredMods: string[] = (() => { try { const arr = JSON.parse(sv.requiredMods || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; } })();
                        await upsertServerMeta(parsed.ip, parsed.port, { name, map, playlist, requiredMods });
                    }
                } catch {}
            }

            // Log removals
            for (const key of removed) {
                const parsed = parseKey(key);
                if (!parsed) continue;
                const meta = await getServerMeta(parsed.ip, parsed.port);
                await removeServerMeta(parsed.ip, parsed.port);
            }

            // Replace known set with current
            await replaceKnownServerKeys(Array.from(currentSet));
        } catch (e) {
            // swallow
        }
    };

    // Run immediately, then on interval
    tick().catch(() => {});
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

let serverCountUpdaterStarted = false;

export function startServerCountUpdater(intervalSeconds = 600): void {
    if (serverCountUpdaterStarted) return;
    serverCountUpdaterStarted = true;
    
    const intervalMs = intervalSeconds * 1000;
    const tick = async () => {
        try {
            const servers = await getServers(true) as any[];
            const publicServers = (servers || []).filter(s => s && (s.hidden === false || s.hidden === 'false'));
            await updateServersCountChannel(publicServers.length);
            const totalPlayers = publicServers.reduce((sum, s) => sum + (typeof s.playerCount === 'number' ? s.playerCount : parseInt(s.playerCount || '0')), 0);
            await updatePlayersCountChannel(totalPlayers);
        } catch {}
    };
    tick().catch(() => {});
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

let activeServersListUpdaterStarted = false;

export function startActiveServersListUpdater(intervalSeconds = 300): void {
    if (activeServersListUpdaterStarted) return;
    activeServersListUpdaterStarted = true;
    
    const channelId = process.env.DISCORD_SERVER_BROWSER_CHANNEL_ID || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) {
        logger.warn('DISCORD_SERVER_BROWSER_CHANNEL_ID not configured; server browser updater not started', { prefix: 'SERVER-BROWSER' });
        return;
    }
    const intervalMs = intervalSeconds * 1000;

    const render = (servers: any[]): { content?: string; embeds?: any[] } => {
        const toFlag = (code: string) => {
            if (!code || code.length !== 2) return '';
            const upper = code.toUpperCase();
            const A = 65; // 'A'
            const base = 127397; // regional indicator offset
            const cp1 = upper.charCodeAt(0);
            const cp2 = upper.charCodeAt(1);
            if (cp1 < A || cp1 > 90 || cp2 < A || cp2 > 90) return '';
            return String.fromCodePoint(cp1 + base) + String.fromCodePoint(cp2 + base);
        };
        const totalServers = servers.length;
        const totalPlayers = servers.reduce((sum, s) => sum + (typeof s.playerCount === 'number' ? s.playerCount : parseInt(s.playerCount || '0')), 0);
        const maxLines = 30;
        const lines: string[] = servers.slice(0, maxLines).map((s: any) => {
            const flag = toFlag((s.region || 'XX').toString());
            const lock = s.hasPassword ? '🔒' : '';
            const name = s.name || 'Unnamed';
            const mode = s.playlist || 'unknown';
            const map = s.map || '';
            const players = `${s.playerCount}/${s.maxPlayers}`;
            const parts = [flag, lock, name].filter(Boolean).join(' ').trim();
            return `• ${parts} — ${players} — ${mode} — ${map}`;
        });
        if (totalServers > maxLines) {
            lines.push(`… and ${totalServers - maxLines} more`);
        }
        const header = totalServers > 0 ? `Servers: ${totalServers} | Players: ${totalPlayers}` : 'No servers online';
        const description = [header, '', ...lines].join('\n');
        return {
            embeds: [{
                title: 'Active Servers',
                description: description.slice(0, 4096),
                color: 0x5865F2,
                timestamp: new Date().toISOString(),
                footer: { text: 'Updated' }
            }]
        };
    };

    const tick = async () => {
        try {
            const servers = await getServers(true) as any[];
            const publicServers = (servers || []).filter(s => s && (s.hidden === false || s.hidden === 'false'));
            const body = render(publicServers);
            
            let msgId = await getActiveServersListMessageId();
            
            if (!msgId) {
                // First run: delete all messages in the channel and post the embed
                try {
                    await deleteAllChannelMessages(channelId);
                } catch (err) {
                    logger.error(`Error deleting old messages: ${err}`, { prefix: 'SERVER-BROWSER' });
                }
                
                msgId = await postBotMessage(channelId, body);
                if (msgId) {
                    await setActiveServersListMessageId(msgId);
                    logger.info(`Posted new server browser embed (${msgId})`, { prefix: 'SERVER-BROWSER' });
                } else {
                    logger.error('Failed to post server browser embed', { prefix: 'SERVER-BROWSER' });
                }
            } else {
                // Update existing message and clean up any other messages
                try {
                    await editBotMessage(channelId, msgId, body);
                    // Ensure only one message remains (cleanup any manually posted messages)
                    await deleteOtherChannelMessages(channelId, msgId);
                } catch (err) {
                    logger.error(`Error updating embed: ${err}`, { prefix: 'SERVER-BROWSER' });
                    // If edit fails, delete and repost
                    msgId = '';
                    await setActiveServersListMessageId('');
                }
            }
        } catch (err) {
            logger.error(`Error in tick: ${err}`, { prefix: 'SERVER-BROWSER' });
        }
    };

    // Kick off immediately, then on interval
    tick().catch(() => {});
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

// Register simple ban/unban commands using existing bansystem
import { addBan, removeBan } from './bansystem.ts';
import { GetSteamIdByUsername, SearchSteamIdsByUsername } from './db.ts';

function isNumericString(s: string): boolean { return /^\d+$/.test(s); }

registerCommand('ban', async (args, message: any) => {
    if (args.length === 0) { await message.reply('Usage: !ban <steam_id|ip> [days] [reason]'); return; }
    const target = args[0];
    let days: number | null = null;
    let reason: string | null = null;
    if (args.length >= 2 && /^\d+$/.test(args[1])) {
        days = parseInt(args[1], 10);
        reason = args.slice(2).join(' ') || null;
    } else {
        reason = args.slice(1).join(' ') || null;
    }
    const expiry = days && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const identifier = target; // keep as string to avoid precision loss
    const res = await addBan(identifier, reason, 0, expiry);
    const dur = expiry ? ` for ${days}d` : ' (permanent)';
    await message.reply(res.success ? `Banned ${target}${dur}${reason ? ` (${reason})` : ''}` : `Failed to ban: ${res.message}`);
});

registerCommand('unban', async (args, message: any) => {
    if (args.length === 0) { await message.reply('Usage: !unban <steam_id|ip>'); return; }
    const target = args[0];
    const identifier = target; // keep as string to avoid precision loss
    const res = await removeBan(identifier);
    await message.reply(res.success ? `Unbanned ${target}` : `Failed to unban: ${res.message}`);
});

registerCommand('id', async (args, message: any) => {
    if (args.length === 0) { await message.reply('Usage: !id <username>'); return; }
    const name = args.join(' ');
    const exact = await GetSteamIdByUsername(name);
    if (exact) { await message.reply(`${name} → ${exact}`); return; }
    const suggestions = await SearchSteamIdsByUsername(name, 5);
    if (suggestions.length === 0) { await message.reply('No match found'); return; }
    const lines = suggestions.map(u => `${u.name} → ${u.steam_id}`);
    await message.reply(`No exact match. Did you mean:
${lines.join('\n')}`);
});



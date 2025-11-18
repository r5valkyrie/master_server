export async function postDiscordWebhook(webhookUrl: string, content: string): Promise<void> {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
    } catch (err) {
        // Only log non-timeout errors
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            console.error('Discord webhook error:', err);
        }
    }
}

async function postDiscordBotMessage(channelId: string, body: any): Promise<void> {
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) return;
    try {
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
    } catch (err) {
        // Only log non-timeout errors
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            console.error('Discord bot send error:', err);
        }
    }
}

export async function deleteAllChannelMessages(channelId: string): Promise<void> {
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) return;
    try {
        // Discord API limits bulk delete to messages <=14 days; for simplicity fetch recent and delete individually
        const listResp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
            headers: { 'Authorization': `Bot ${botToken}` },
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        if (!listResp.ok) return;
        const msgs = await listResp.json();
        for (const m of msgs) {
            try {
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${m.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bot ${botToken}` },
                    signal: AbortSignal.timeout(5000) // 5 second timeout per delete
                });
            } catch {
                // Silently ignore individual delete failures
            }
        }
    } catch (err) {
        // Only log non-timeout errors
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            console.error('deleteAllChannelMessages error:', err);
        }
    }
}

export async function deleteOtherChannelMessages(channelId: string, keepMessageId: string): Promise<void> {
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken || !keepMessageId) return;
    try {
        const listResp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
            headers: { 'Authorization': `Bot ${botToken}` },
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        if (!listResp.ok) return;
        const msgs = await listResp.json();
        for (const m of msgs) {
            if (m.id === keepMessageId) continue;
            try {
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${m.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bot ${botToken}` },
                    signal: AbortSignal.timeout(5000) // 5 second timeout per delete
                });
            } catch {
                // Silently ignore individual delete failures
            }
        }
    } catch (err) { 
        // Only log if it's not a timeout error to reduce noise
        if (err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError') {
            console.error('deleteOtherChannelMessages error:', err);
        }
    }
}

export async function postBotMessage(channelId: string, body: any): Promise<string | null> {
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) return null;
    try {
        const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return data?.id || null;
    } catch (err) { console.error('postBotMessage error:', err); return null; }
}

export async function editBotMessage(channelId: string, messageId: string, body: any): Promise<void> {
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken || !messageId) return;
    try {
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    } catch (err) { console.error('editBotMessage error:', err); }
}

// Lightweight message-based command handler for prefix commands
type CommandHandler = (args: string[], message: any) => Promise<void>;
const commandHandlers: Record<string, CommandHandler> = {};

export function registerCommand(name: string, handler: CommandHandler) {
    commandHandlers[name.toLowerCase()] = handler;
}

function isUserAllowed(userId: string): boolean {
    const allow = process.env.DISCORD_COMMAND_ALLOW_IDS || '';
    if (!allow) return false;
    const set = new Set(allow.split(',').map(s => s.trim()).filter(Boolean));
    return set.has(userId);
}

let commandListenerStarted = false;
export function startPrefixCommandListener(): void {
    if (commandListenerStarted) return;
    commandListenerStarted = true;
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!botToken) return;

    // Use dynamic ESM import to load discord.js under ESM environment
    (async () => {
        try {
            const mod: any = await import('discord.js');
            const { Client, GatewayIntentBits, Partials, Events } = mod;
            const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
            client.on(Events.MessageCreate, async (message: any) => {
                try {
                    if (!message || message.author?.bot) return;
                    const content: string = String(message.content || '');
                    if (!content.startsWith('!')) return;
                    if (!isUserAllowed(String(message.author?.id || ''))) return;
                    const parts = content.slice(1).trim().split(/\s+/);
                    const cmd = (parts.shift() || '').toLowerCase();
                    const handler = commandHandlers[cmd];
                    if (!handler) return;
                    await handler(parts, message);
                } catch {}
            });
            await client.login(botToken);
        } catch (e) {
            console.error('Failed to start prefix command listener:', e);
        }
    })();
}

export async function postDiscordEmbed(webhookUrl: string, embed: any): Promise<void> {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (err) {
        console.error('Discord webhook error:', err);
    }
}

export async function logAdminEvent(message: string): Promise<void> {
    const url = process.env.DISCORD_WEBHOOK_ADMIN || '';
    await postDiscordWebhook(url, message);
}

export async function logGeneralEvent(message: string): Promise<void> {
    const url = process.env.DISCORD_WEBHOOK_GENERAL || '';
    await postDiscordWebhook(url, message);
}

export async function logGeneralEmbed(embed: any): Promise<void> {
    const channelId = process.env.DISCORD_SERVERS_CHANNEL_ID || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (channelId && botToken) {
        await postDiscordBotMessage(channelId, { embeds: [embed] });
        return;
    }
    const url = process.env.DISCORD_WEBHOOK_SERVERS || '';
    await postDiscordEmbed(url, embed);
}

export async function logServersEmbed(embed: any): Promise<void> {
    const channelId = process.env.DISCORD_SERVERS_LOG_CHANNEL_ID || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (channelId && botToken) {
        await postDiscordBotMessage(channelId, { embeds: [embed] });
        return;
    }
    const url = process.env.DISCORD_WEBHOOK_SERVERS || '';
    await postDiscordEmbed(url, embed);
}

let lastServersChannelName = '';
export async function updateServersCountChannel(count: number): Promise<void> {
    const channelId = process.env.DISCORD_SERVERS_CHANNEL_ID || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) return;
    const desiredName = `servers online: ${count}`;
    if (desiredName === lastServersChannelName) return;
    try {
        const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: desiredName })
        });
        if (!resp.ok) {
            // Swallow errors but log once
            console.error('Failed to update Discord channel name:', resp.status, await resp.text());
            return;
        }
        lastServersChannelName = desiredName;
    } catch (err) {
        console.error('Discord channel rename error:', err);
    }
}

let lastPlayersChannelName = '';
export async function updatePlayersCountChannel(count: number): Promise<void> {
    const channelId = process.env.DISCORD_PLAYERS_CHANNEL_ID || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!channelId || !botToken) return;
    const desiredName = `players online: ${count}`;
    if (desiredName === lastPlayersChannelName) return;
    try {
        const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: desiredName })
        });
        if (!resp.ok) {
            console.error('Failed to update Discord players channel name:', resp.status, await resp.text());
            return;
        }
        lastPlayersChannelName = desiredName;
    } catch (err) {
        console.error('Discord players channel rename error:', err);
    }
}



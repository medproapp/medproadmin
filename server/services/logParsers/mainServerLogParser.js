'use strict';

// Parser for medpro-backend textual logs
// Handles lines like:
// [2025-08-13T16:30:24.220Z] GET    304 /login/... 3ms [user@demo]
// [date] ERROR Failed to ...
// Route markers with file path and ANSI codes

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const LEADING_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2}T[^\s]*:)\s+/; // e.g., 2025-08-13T13:30:24:

function stripAnsi(s) {
    return String(s || '').replace(ANSI_REGEX, '');
}

function normalizeLine(raw) {
    let line = stripAnsi(raw).trim();
    // Drop leading machine timestamp prefix if present
    line = line.replace(LEADING_PREFIX_REGEX, '');
    return line;
}

function parseHttpLine(line) {
    // [timestamp] METHOD STATUS PATH DURATIONms [user?]
    // timestamp can be ISO or locale; we don't validate format strictly
    const m = line.match(/^\[(?<ts>[^\]]+)\]\s+(?<method>GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(?<status>\d{3})\s+(?<path>\S+)(?:\s+(?<duration>\d+)ms)?(?:\s+\[(?<user>[^\]]+)\])?/);
    if (!m) return null;
    const { ts, method, status, path, duration, user } = m.groups;
    return {
        type: 'http',
        time: ts,
        method,
        status: Number(status),
        path,
        duration_ms: duration ? Number(duration) : null,
        user: user || null
    };
}

function parseLevelLine(line) {
    // [timestamp] LEVEL message (message may include emojis)
    const m = line.match(/^\[(?<ts>[^\]]+)\]\s+(?<level>INFO|WARN|ERROR|DEBUG)\s+(?<msg>[\s\S]+)$/);
    if (!m) return null;
    const { ts, level, msg } = m.groups;
    return { type: 'event', time: ts, level: level.toLowerCase(), message: msg.trim() };
}

function parseRouteMarker(line) {
    // [timestamp] [path:file:line:col] Route ...
    if (!line.includes('] Route ')) return null;
    // Remove initial bracketed timestamp of any format
    const cleaned = line.replace(/^\[[^\]]+\]\s*/, '');
    const m = cleaned.match(/^\[(?<file>[^\]]+)\]\s+Route\s+(?<msg>[\s\S]+)$/);
    if (!m) return null;
    return { type: 'route', file: m.groups.file, message: m.groups.msg };
}

function parseLine(raw) {
    const line = normalizeLine(raw);
    if (!line) return null;
    return parseHttpLine(line) || parseLevelLine(line) || parseRouteMarker(line) || { type: 'log', message: line };
}

function parse(lines = []) {
    const entries = [];
    for (const raw of lines) {
        try {
            const e = parseLine(raw);
            if (e) entries.push(e);
        } catch (_) {
            entries.push({ type: 'log', message: String(raw) });
        }
    }
    return entries;
}

module.exports = { parse };



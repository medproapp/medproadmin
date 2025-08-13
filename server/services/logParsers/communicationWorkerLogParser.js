'use strict';

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const LEADING_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2}T[^\s]*:)\s+/; // e.g., 2025-08-13T13:28:40:

function stripAnsi(s) { return String(s || '').replace(ANSI_REGEX, ''); }
function normalizeLine(raw) { return stripAnsi(raw).trim().replace(LEADING_PREFIX_REGEX, ''); }
function extractPrefixTimestamp(raw) {
  const m = String(raw || '').match(/^(\d{4}-\d{2}-\d{2}T[^\s]*):\s+/);
  return m ? m[1] : null;
}

function parse(lines = []) {
  const entries = [];
  for (const raw of lines) {
    const ts = extractPrefixTimestamp(raw);
    const line = normalizeLine(raw);
    if (!line) continue;

    // Env checks
    let m = line.match(/^\[COMMUNICATION-WORKER\]\s+Env check:\s+(?<key>[A-Z0-9_]+)\s+present:\s+(?<present>true|false)/i);
    if (m) { entries.push({ type: 'env_check', time: ts, key: m.groups.key, present: m.groups.present === 'true' }); continue; }

    // Service init
    if (line.includes('[Twilio Service]') && /initialized\./i.test(line)) { entries.push({ type: 'service_init', time: ts, service: 'twilio' }); continue; }
    if (line.includes('[SendGrid Service]') && /initialized\./i.test(line)) { entries.push({ type: 'service_init', time: ts, service: 'sendgrid' }); continue; }

    // Lifecycle
    if (/^\[COMMUNICATION-WORKER\]\s+Starting communication worker/.test(line)) { entries.push({ type: 'lifecycle', time: ts, event: 'starting' }); continue; }
    m = line.match(/^\[COMMUNICATION-WORKER\]\s+Worker started with interval\s+(?<ms>\d+)ms/i);
    if (m) { entries.push({ type: 'lifecycle', time: ts, event: 'started', interval_ms: Number(m.groups.ms) }); continue; }

    // Cycle
    if (/^\[COMMUNICATION-WORKER\]\s+Processing communication queue\.\.\./.test(line)) { entries.push({ type: 'cycle', time: ts, phase: 'start' }); continue; }
    if (/^\[COMMUNICATION-WORKER\]\s+Generating new communication events\.\.\./.test(line)) { entries.push({ type: 'cycle', time: ts, phase: 'generating' }); continue; }
    if (/^\[COMMUNICATION-WORKER\]\s+No scheduled events to process/.test(line)) { entries.push({ type: 'cycle', time: ts, phase: 'empty' }); continue; }
    if (/^\[COMMUNICATION-WORKER\]\s+Queue processing completed/.test(line)) { entries.push({ type: 'cycle', time: ts, phase: 'completed' }); continue; }

    // Message events (generic worker phrasing)
    let ms = line.match(/^\[COMMUNICATION-WORKER\]\s+(?<channel>SMS|WHATSAPP|Whatsapp|Email|EMAIL)\s+(?<action>sent|delivered)\s+to\s+(?<target>\S+)(?:.*?\b(id|sid)[:=]\s*(?<id>[A-Za-z0-9_-]+))?/i);
    if (ms) {
      const ch = ms.groups.channel.toLowerCase();
      entries.push({ type: 'message', time: ts, channel: ch === 'whatsapp' || ch === 'whatsapp'.toLowerCase() ? 'whatsapp' : ch, action: ms.groups.action.toLowerCase(), target: ms.groups.target, id: ms.groups.id || null, provider: (ch === 'email' ? 'sendgrid' : 'twilio') });
      continue;
    }
    ms = line.match(/^\[COMMUNICATION-WORKER\]\s+Failed to send\s+(?<channel>SMS|WHATSAPP|Whatsapp|Email|EMAIL)\s+to\s+(?<target>\S+)(?:.*?code[:=]\s*(?<code>\w+))?(?:.*?reason[:=]\s*(?<reason>.+))?/i);
    if (ms) {
      const ch = ms.groups.channel.toLowerCase();
      entries.push({ type: 'message', time: ts, channel: ch === 'whatsapp' ? 'whatsapp' : ch, action: 'failed', target: ms.groups.target, code: ms.groups.code || null, reason: (ms.groups.reason || '').trim() || null, provider: (ch === 'email' ? 'sendgrid' : 'twilio') });
      continue;
    }

    // Twilio/SendGrid service flavored lines
    if (/\[Twilio/i.test(line)) {
      const tw = line.match(/\b(SMS|WhatsApp)\b.*?\b(sent|delivered|failed)\b.*?(sid|id)[:=]\s*([A-Za-z0-9_-]+)/i);
      if (tw) {
        const ch = tw[1].toLowerCase() === 'whatsapp' ? 'whatsapp' : 'sms';
        entries.push({ type: 'message', time: ts, channel: ch, action: tw[2].toLowerCase(), id: tw[4], provider: 'twilio', message: line });
        continue;
      }
    }
    if (/\[SendGrid/i.test(line)) {
      const sg = line.match(/Email\s+(sent|delivered|failed).*?to\s+(\S+)/i);
      if (sg) {
        entries.push({ type: 'message', time: ts, channel: 'email', action: sg[1].toLowerCase(), target: sg[2], provider: 'sendgrid', message: line });
        continue;
      }
    }

    // Errors
    if (/(error|failed)/i.test(line)) { entries.push({ type: 'error', time: ts, message: line }); continue; }

    entries.push({ type: 'log', time: ts, message: line });
  }
  return entries;
}

module.exports = { parse };



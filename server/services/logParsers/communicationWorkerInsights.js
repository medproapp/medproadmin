'use strict';

const { parse } = require('./communicationWorkerLogParser');

function build(lines = []) {
  const entries = parse(lines);
  const env = entries.filter(e => e.type === 'env_check');
  const services = entries.filter(e => e.type === 'service_init');
  const cycles = entries.filter(e => e.type === 'cycle');
  const errors = entries.filter(e => e.type === 'error');
  const messages = entries.filter(e => e.type === 'message');
  const lifecycle = entries.filter(e => e.type === 'lifecycle');

  // Count cycles and phases in last window
  const totalCycles = cycles.filter(e => e.phase === 'completed').length;
  const emptyCycles = cycles.filter(e => e.phase === 'empty').length;

  // Interval
  const intervalMs = (lifecycle.find(e => e.event === 'started') || {}).interval_ms || null;

  // Service status
  const serviceStatus = {
    twilio: services.some(s => s.service === 'twilio') ? 'initialized' : 'unknown',
    sendgrid: services.some(s => s.service === 'sendgrid') ? 'initialized' : 'unknown'
  };

  // Env checks (booleans if present)
  const envChecks = {};
  for (const e of env) envChecks[e.key] = e.present;

  // Message stats derived strictly from logs
  const byChannel = { whatsapp: { sent: 0, delivered: 0, failed: 0 }, sms: { sent: 0, delivered: 0, failed: 0 }, email: { sent: 0, delivered: 0, failed: 0 } };
  for (const m of messages) {
    const ch = (m.channel || '').toLowerCase();
    const act = (m.action || '').toLowerCase();
    if (!byChannel[ch]) continue;
    if (act === 'sent') byChannel[ch].sent++;
    else if (act === 'delivered') byChannel[ch].delivered++;
    else if (act === 'failed') byChannel[ch].failed++;
  }
  const totals = Object.values(byChannel).reduce((acc, v) => ({ sent: acc.sent + v.sent, delivered: acc.delivered + v.delivered, failed: acc.failed + v.failed }), { sent: 0, delivered: 0, failed: 0 });

  return {
    kpis: {
      cycles_completed: totalCycles,
      cycles_empty: emptyCycles,
      interval_ms: intervalMs,
      errors: errors.length
    },
    service_status: serviceStatus,
    env_checks: envChecks,
    recent_errors: errors.slice(-10),
    messages: {
      totals,
      by_channel: byChannel
    }
  };
}

module.exports = { build };



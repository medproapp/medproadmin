'use strict';

const { parse } = require('./mainServerLogParser');

function percentile(values, p) {
    if (!values.length) return null;
    const arr = [...values].sort((a,b)=>a-b);
    const idx = Math.floor((p/100) * (arr.length-1));
    return arr[idx];
}

function groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
        const k = keyFn(item);
        const list = map.get(k) || [];
        list.push(item);
        map.set(k, list);
    }
    return map;
}

function build(lines = []) {
    const entries = parse(lines);
    const http = entries.filter(e => e.type === 'http');
    const events = entries.filter(e => e.type === 'event');

    // KPIs
    const totalReq = http.length;
    const errors = http.filter(e => e.status >= 500).length;
    const clientErrors = http.filter(e => e.status >= 400 && e.status < 500).length;
    const durations = http.map(e => e.duration_ms).filter(v => typeof v === 'number');
    const p50 = percentile(durations, 50);
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);

    // Slow endpoints
    const SLOW_MS = 300;
    const slow = http.filter(e => (e.duration_ms || 0) >= SLOW_MS)
        .sort((a,b)=> (b.duration_ms||0) - (a.duration_ms||0))
        .slice(0, 10);

    // Top endpoints by volume
    const byPath = groupBy(http, e => e.method + ' ' + e.path);
    const topEndpoints = Array.from(byPath.entries())
        .map(([k, v]) => ({ endpoint: k, count: v.length, errors: v.filter(e=>e.status>=500).length, p95: percentile(v.map(e=>e.duration_ms).filter(Boolean),95) }))
        .sort((a,b)=> b.count - a.count)
        .slice(0, 10);

    // Recent errors (events or 5xx)
    const recentHttpErrors = http.filter(e => e.status >= 500).slice(-10);
    const recentEventErrors = events.filter(e => (e.level||'').toLowerCase()==='error').slice(-10);

    // Health signals from events
    const health = events.filter(e => (e.message||'').includes('System Health Check')).slice(-1)[0] || null;

    return {
        kpis: {
            total_requests: totalReq,
            http_5xx: errors,
            http_4xx: clientErrors,
            latency_ms: { p50, p95, p99 }
        },
        slow_endpoints: slow,
        top_endpoints: topEndpoints,
        recent_errors: {
            http: recentHttpErrors,
            events: recentEventErrors
        },
        health_signal: health
    };
}

module.exports = { build };



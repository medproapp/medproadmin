class WorkersApp {
    constructor() {
        this.selectedProcess = null;
        this.autoRefresh = false;
        this.intervalId = null;
        this.init();
    }

    async init() {
        const auth = await checkAdminAuth();
        if (!auth) { window.location.href = '/medproadmin/login.html'; return; }
        const emailEl = document.getElementById('admin-email'); if (emailEl) emailEl.textContent = auth.email;

        await window.environmentContext.init();
        const currentEnv = window.environmentContext.getCurrentEnvironment();
        if (currentEnv) window.workersApi.setEnvironment(currentEnv.id);
        window.environmentContext.addEventListener((event, data) => {
            if (event === 'environmentChanged' && data?.current?.id) {
                window.workersApi.setEnvironment(data.current.id);
                this.selectedProcess = null;
                this.toggleDetailCards(false);
                this.loadWorkers();
            }
        });

        document.getElementById('refresh-workers-btn').addEventListener('click', () => this.loadWorkers());
        document.getElementById('refresh-logs-btn').addEventListener('click', () => this.refreshLogs());
        document.getElementById('auto-refresh-toggle').addEventListener('click', () => this.toggleAutoRefresh());
        const parsedToggle = document.getElementById('parsed-logs-toggle');
        if (parsedToggle) parsedToggle.addEventListener('change', () => this.refreshLogs());
        const insightsBtn = document.getElementById('refresh-insights-btn');
        if (insightsBtn) insightsBtn.addEventListener('click', () => this.refreshInsights());

        // hide detail cards initially
        this.toggleDetailCards(false);

        this.loadWorkers();
    }

    toggleDetailCards(show) {
        const logsCard = document.getElementById('logs-card');
        const insightsCard = document.getElementById('insights-card');
        if (logsCard) logsCard.style.display = show ? '' : 'none';
        if (insightsCard) insightsCard.style.display = show ? '' : 'none';
    }

    setStatus(el, text, ok) {
        el.classList.add('status-badge');
        el.classList.toggle('status-online', ok);
        el.classList.toggle('status-stopped', !ok);
        el.textContent = text;
    }

    async refreshInsights() {
        const container = document.getElementById('insights');
        if (!container) return;
        const name = this.selectedProcess || 'medpro-backend';
        const sel = document.getElementById('insights-selected');
        if (sel) sel.textContent = name;
        container.innerHTML = '<div class="text-muted">Loading insights...</div>';
        try {
            const data = await window.workersApi.insights(name, { lines: 600, type: 'both' });
            const ins = data.insights || {};
            const isComm = !!ins.messages || name.toLowerCase() === 'medpro-communication-worker';
            if (isComm) {
                const k = ins.kpis || {};
                const svc = ins.service_status || {};
                const env = ins.env_checks || {};
                const msg = ins.messages || { totals: { sent: 0, delivered: 0, failed: 0 }, by_channel: {} };
                const byCh = msg.by_channel || {};
                const errs = Array.isArray(ins.recent_errors) ? ins.recent_errors : (ins.recent_errors?.events || []);
                container.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-3"><div class="p-3 border rounded"><div class="small text-muted">Cycles completed</div><div class="h4 mb-0">${k.cycles_completed ?? 0}</div></div></div>
                        <div class="col-md-3"><div class="p-3 border rounded"><div class="small text-muted">Empty cycles</div><div class="h4 mb-0">${k.cycles_empty ?? 0}</div></div></div>
                        <div class="col-md-3"><div class="p-3 border rounded"><div class="small text-muted">Interval (ms)</div><div class="h5 mb-0">${k.interval_ms ?? '-'}</div></div></div>
                        <div class="col-md-3"><div class="p-3 border rounded"><div class="small text-muted">Errors</div><div class="h4 mb-0 text-danger">${k.errors ?? 0}</div></div></div>
                    </div>
                    <div class="row g-3 mt-3">
                        <div class="col-md-6"><div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Services</div>
                            <div>Twilio: <span class="badge ${svc.twilio==='initialized'?'bg-success':'bg-secondary'}">${svc.twilio || 'unknown'}</span></div>
                            <div>SendGrid: <span class="badge ${svc.sendgrid==='initialized'?'bg-success':'bg-secondary'}">${svc.sendgrid || 'unknown'}</span></div>
                        </div></div>
                        <div class="col-md-6"><div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Env checks</div>
                            ${Object.keys(env).length? Object.entries(env).map(([k,v])=>`<div>${this.escape(k)}: <span class=\"badge ${v?'bg-success':'bg-danger'}\">${v?'present':'missing'}</span></div>`).join('') : '<div class=\"text-muted\">No data</div>'}
                        </div></div>
                    </div>
                    <div class="row g-3 mt-3">
                        <div class="col-md-6"><div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Messages - totals</div>
                            <div class="d-flex gap-3"><span class="badge bg-secondary">sent ${msg.totals?.sent ?? 0}</span><span class="badge bg-success">delivered ${msg.totals?.delivered ?? 0}</span><span class="badge bg-danger">failed ${msg.totals?.failed ?? 0}</span></div>
                        </div></div>
                        <div class="col-md-6"><div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Messages - by channel</div>
                            ${['whatsapp','sms','email'].map(ch=>{
                                const c=byCh[ch]||{sent:0,delivered:0,failed:0};
                                return `<div>${ch.toUpperCase()}: <span class=\"badge bg-secondary\">sent ${c.sent}</span> <span class=\"badge bg-success\">delivered ${c.delivered}</span> <span class=\"badge bg-danger\">failed ${c.failed}</span></div>`;
                            }).join('')}
                        </div></div>
                    </div>
                    <div class="mt-3 p-3 border rounded">
                        <div class="mb-2 fw-bold">Recent errors</div>
                        ${errs && errs.length ? errs.map(e=>`<div class=\"text-danger\">${this.escape(e.message||'')}</div>`).join('') : '<div class=\"text-muted\">None</div>'}
                    </div>
                `;
                return;
            }
            // Main server (HTTP) insights rendering
            const k = ins.kpis || {};
            const slow = Array.isArray(ins.slow_endpoints) ? ins.slow_endpoints : [];
            const top = Array.isArray(ins.top_endpoints) ? ins.top_endpoints : [];
            const errsHttp = (ins.recent_errors && Array.isArray(ins.recent_errors.http)) ? ins.recent_errors.http : [];
            const errsEvt = (ins.recent_errors && Array.isArray(ins.recent_errors.events)) ? ins.recent_errors.events : [];
            const health = ins.health_signal || null;
            container.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-3">
                        <div class="p-3 border rounded">
                            <div class="small text-muted">Requests</div>
                            <div class="h4 mb-0">${k.total_requests ?? 0}</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded">
                            <div class="small text-muted">5xx</div>
                            <div class="h4 mb-0 text-danger">${k.http_5xx ?? 0}</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded">
                            <div class="small text-muted">4xx</div>
                            <div class="h4 mb-0 text-warning">${k.http_4xx ?? 0}</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="p-3 border rounded">
                            <div class="small text-muted">Latency p50/p95/p99 (ms)</div>
                            <div class="h6 mb-0">${k.latency_ms?.p50 ?? '-'} / ${k.latency_ms?.p95 ?? '-'} / ${k.latency_ms?.p99 ?? '-'}</div>
                        </div>
                    </div>
                </div>
                <div class="row g-3 mt-3">
                    <div class="col-md-6">
                        <div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Top endpoints</div>
                            <div>${top.map(t => `<div class=\"d-flex justify-content-between\"><span class=\"monospace\">${this.escape(t.endpoint)}</span><span class=\"text-muted\">${t.count} req${t.errors?`, ${t.errors} 5xx`:''}${t.p95?`, p95 ${t.p95}ms`:''}</span></div>`).join('') || '<div class=\"text-muted\">No data</div>'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Slow endpoints (>=300ms)</div>
                            <div>${slow.map(s => `<div class=\"d-flex justify-content-between\"><span class=\"monospace\">${this.escape(s.method)} ${this.escape(s.path)}</span><span class=\"text-muted\">${s.duration_ms}ms</span></div>`).join('') || '<div class=\"text-muted\">No data</div>'}</div>
                        </div>
                    </div>
                </div>
                <div class="row g-3 mt-3">
                    <div class="col-md-6">
                        <div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Recent HTTP errors</div>
                            <div>${errsHttp.map(e => `<div><span class=\"badge bg-danger\">${e.status}</span> ${this.escape(e.method)} ${this.escape(e.path)} ${e.duration_ms?`<span class=\"text-muted\">${e.duration_ms}ms</span>`:''} <span class=\"text-muted\">${this.escape(e.time||'')}</span></div>`).join('') || '<div class=\"text-muted\">None</div>'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-3 border rounded">
                            <div class="mb-2 fw-bold">Recent errors (events)</div>
                            <div>${errsEvt.map(e => `<div><span class=\"badge bg-danger\">ERROR</span> ${this.escape(e.message||'')} <span class=\"text-muted\">${this.escape(e.time||'')}</span></div>`).join('') || '<div class=\"text-muted\">None</div>'}</div>
                        </div>
                    </div>
                </div>
                ${health ? `<div class=\"mt-3 p-3 border rounded\"><div class=\"fw-bold\">Health</div><div class=\"text-muted\">${this.escape(health.message || 'System Health Check')}</div></div>` : ''}
            `;
        } catch (e) {
            container.innerHTML = '<span class="text-danger">' + this.escape(e.message) + '</span>';
        }
    }

    async loadWorkers() {
        const tbody = document.getElementById('workers-tbody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><div class="spinner-border text-primary"></div></td></tr>`;
        try {
            const list = await window.workersApi.list();
            const rows = list.map(p => this.renderRow(p)).join('');
            tbody.innerHTML = rows || `<tr><td colspan="7" class="text-center text-muted">No processes found</td></tr>`;
            this.bindTableEvents();
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${this.escape(e.message)}</td></tr>`;
        }
    }

    renderRow(p) {
        const status = (p.status || 'unknown').toLowerCase();
        const statusOk = status === 'online' || status === 'launching' || status === 'waiting';
        const cpu = (p.cpu || 0) + '%';
        const memMb = p.memory ? Math.round(p.memory / 1024 / 1024) + ' MB' : '0 MB';
        const uptime = p.uptime ? `${this.formatDateTime(p.uptime)} (${this.formatDuration(Math.max(0, Date.now() - Number(p.uptime)))})` : '-';
        const rawName = p.name || '';
        const name = this.escape(rawName);
        const kind = this.processKind(rawName);
        const icon = this.kindIconHtml(kind);
        return `
        <tr data-name="${name}">
            <td class="monospace">${icon}${name}</td>
            <td><span class="status-badge ${this.statusClass(status)}">${this.escape(p.status || 'unknown')}</span></td>
            <td>${this.escape(p.namespace || 'default')}</td>
            <td>${this.escape(p.version || '')}</td>
            <td>${this.escape(p.exec_mode || '')}</td>
            <td>${this.escape(String(p.pm_id ?? ''))}</td>
            <td>${this.escape(String(p.pid ?? ''))}</td>
            <td>${p.restarts || 0}</td>
            <td>${cpu}</td>
            <td>${memMb}</td>
            <td>${uptime}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-secondary" data-action="start" data-name="${name}"><i class="fas fa-play"></i></button>
                    <button class="btn btn-outline-secondary" data-action="restart" data-name="${name}"><i class="fas fa-redo"></i></button>
                    <button class="btn btn-outline-secondary" data-action="stop" data-name="${name}"><i class="fas fa-stop"></i></button>
                    <button class="btn btn-outline-primary" data-action="logs" data-name="${name}"><i class="fas fa-file-alt"></i></button>
                </div>
            </td>
        </tr>`;
    }

    statusClass(status) {
        switch (status) {
            case 'online': return 'status-online';
            case 'stopped': return 'status-stopped';
            case 'errored': return 'status-errored';
            case 'restarting': return 'status-restarting';
            case 'waiting': return 'status-waiting';
            case 'launching': return 'status-launching';
            case 'stopping': return 'status-stopping';
            default: return 'status-unknown';
        }
    }

    processKind(rawName) {
        const n = String(rawName || '').toLowerCase();
        if (n === 'medpro-backend' || n === 'medpro-message-server') return 'server';
        return 'worker';
    }

    kindIconHtml(kind) {
        if (kind === 'server') return '<i class="fas fa-server me-2" title="Server" aria-label="Server"></i>';
        return '<i class="fas fa-cogs me-2" title="Worker" aria-label="Worker"></i>';
    }

    bindTableEvents() {
        const tbody = document.getElementById('workers-tbody');
        // Row selection for logs + insights
        tbody.querySelectorAll('tr[data-name]').forEach(row => {
            row.addEventListener('click', (evt) => {
                if (evt.target.closest('button')) return;
                const name = row.getAttribute('data-name');
                if (!name) return;
                // highlight selection
                tbody.querySelectorAll('tr[data-name]').forEach(r => r.classList.remove('row-selected'));
                row.classList.add('row-selected');
                this.selectedProcess = name;
                this.toggleDetailCards(true);
                this.refreshLogs();
                if (document.getElementById('insights')) this.refreshInsights();
            });
        });
        tbody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.getAttribute('data-action');
                const name = btn.getAttribute('data-name');
                if (action === 'logs') { this.selectedProcess = name; this.refreshLogs(); return; }
                try {
                    this.setRowInProgress(name, action, true, btn);
                    await window.workersApi.control(name, action);
                    this.showAlert(`Action ${action} sent to ${name}`, 'info');
                    // Poll for state stabilization
                    const targetStatuses = (action === 'stop') ? ['stopped', 'offline', 'stopping'] : ['online'];
                    try {
                        await this.waitForProcessState(name, p => targetStatuses.includes((p.status || '').toLowerCase()), 12000, 1000);
                        this.showAlert(`${name} is now ${targetStatuses[0]}`, 'success');
                    } catch (pollErr) {
                        this.showAlert(`Timed out waiting for ${name} to ${action}`, 'warning');
                    }
                    await this.loadWorkers();
                } catch (err) {
                    this.showAlert(err.message || 'Action failed', 'danger');
                } finally {
                    this.setRowInProgress(name, action, false, btn);
                }
            });
        });
    }

    setRowInProgress(name, action, inProgress, clickedBtn) {
        const tbody = document.getElementById('workers-tbody');
        const row = tbody.querySelector(`tr[data-name="${CSS.escape(name)}"]`);
        if (!row) return;
        // Disable/enable all action buttons in the row
        row.querySelectorAll('button[data-action]').forEach(b => { b.disabled = inProgress; });
        // Status badge feedback
        const badge = row.querySelector('.status-badge');
        if (badge && inProgress) {
            const txt = (action === 'start' || action === 'restart') ? 'launching' : 'stopping';
            badge.className = `status-badge ${this.statusClass(txt)}`;
            badge.textContent = `${txt}...`;
        }
        // Spinner on the clicked button
        if (clickedBtn) {
            if (inProgress) {
                clickedBtn.dataset._origHtml = clickedBtn.innerHTML;
                clickedBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>` + clickedBtn.innerHTML;
            } else if (clickedBtn.dataset._origHtml) {
                clickedBtn.innerHTML = clickedBtn.dataset._origHtml;
                delete clickedBtn.dataset._origHtml;
            }
        }
    }

    async waitForProcessState(name, predicateOrStatuses, timeoutMs = 10000, intervalMs = 1000) {
        const isPredicate = typeof predicateOrStatuses === 'function';
        const end = Date.now() + timeoutMs;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const list = await window.workersApi.list();
            const proc = Array.isArray(list) ? list.find(p => (p.name || '').toLowerCase() === name.toLowerCase()) : null;
            if (proc) {
                const ok = isPredicate
                    ? predicateOrStatuses(proc)
                    : predicateOrStatuses.includes((proc.status || '').toLowerCase());
                if (ok) return proc;
            }
            if (Date.now() >= end) throw new Error('timeout');
            await new Promise(r => setTimeout(r, intervalMs));
        }
    }

    formatDateTime(ts) {
        try {
            const d = new Date(Number(ts));
            return d.toLocaleString();
        } catch (_) {
            return '-';
        }
    }

    formatDuration(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return '0s';
        const sec = Math.floor(ms / 1000);
        const days = Math.floor(sec / 86400);
        const hours = Math.floor((sec % 86400) / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const seconds = sec % 60;
        const parts = [];
        if (days) parts.push(days + 'd');
        if (hours) parts.push(hours + 'h');
        if (minutes) parts.push(minutes + 'm');
        if (!days && !hours && !minutes) parts.push(seconds + 's');
        return parts.join(' ');
    }

    async refreshLogs() {
        const name = this.selectedProcess;
        const logsEl = document.getElementById('logs');
        const selEl = document.getElementById('selected-process');
        const type = document.getElementById('log-type').value;
        const lines = parseInt(document.getElementById('log-lines').value || '200', 10);
        const parsed = !!document.getElementById('parsed-logs-toggle')?.checked;
        if (!name) { if (selEl) selEl.textContent = 'None'; if (logsEl) logsEl.textContent = ''; this.toggleDetailCards(false); return; }
        this.toggleDetailCards(true);
        selEl.textContent = name;
        logsEl.innerHTML = '<div class="text-muted">Loading...</div>';
        try {
            const data = await window.workersApi.logs(name, { lines, type, parsed });
            if (parsed && data.entries) {
                logsEl.innerHTML = data.entries.map(e => this.renderParsedEntry(e)).join('');
            } else {
                const out = (data.out || []).map(this.escape).join('\n');
                const err = (data.err || []).map(this.escape).join('\n');
                logsEl.textContent = [out, err].filter(Boolean).join('\n');
            }
            logsEl.scrollTop = logsEl.scrollHeight;
        } catch (e) {
            logsEl.innerHTML = '<span class="text-danger">' + this.escape(e.message) + '</span>';
        }
    }

    renderParsedEntry(e) {
        const type = e.type || 'log';
        if (type === 'http') {
            const dur = e.duration_ms != null ? ' <span class="text-muted">' + e.duration_ms + 'ms</span>' : '';
            const user = e.user ? ' <span class="text-muted">[' + this.escape(e.user) + ']</span>' : '';
            const statusClass = e.status >= 500 ? 'bg-danger' : (e.status >= 400 ? 'bg-warning text-dark' : 'bg-success');
            return '<div><span class="badge bg-secondary">HTTP</span> <strong>' + this.escape(e.method) + ' ' + this.escape(e.path) + '</strong> <span class="badge ' + statusClass + '">' + e.status + '</span>' + dur + user + ' <span class="text-muted">' + this.escape(e.time) + '</span></div>';
        }
        if (type === 'event') {
            const level = (e.level || 'info').toLowerCase();
            const levelClass = level === 'error' ? 'bg-danger' : (level === 'warn' ? 'bg-warning text-dark' : 'bg-secondary');
            return '<div><span class="badge ' + levelClass + '">' + this.escape(level.toUpperCase()) + '</span> ' + this.escape(e.message || '') + ' <span class="text-muted">' + this.escape(e.time || '') + '</span></div>';
        }
        if (type === 'route') {
            return '<div><span class="badge bg-info text-dark">ROUTE</span> ' + this.escape(e.message || '') + ' <span class="text-muted">' + this.escape(e.file || '') + '</span></div>';
        }
        return '<div>' + this.escape(e.message || '') + '</div>';
    }

    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        const btn = document.getElementById('auto-refresh-toggle');
        btn.classList.toggle('btn-outline-secondary', !this.autoRefresh);
        btn.classList.toggle('btn-secondary', this.autoRefresh);
        btn.innerHTML = this.autoRefresh ? '<i class="fas fa-pause"></i> Auto Refresh' : '<i class="fas fa-play"></i> Auto Refresh';
        if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
        if (this.autoRefresh) {
            this.intervalId = setInterval(() => { this.loadWorkers(); if (this.selectedProcess) this.refreshLogs(); }, 5000);
        }
    }

    showAlert(message, type='info') {
        const c = document.getElementById('alert-container');
        const el = document.createElement('div');
        el.className = `alert alert-${type}`;
        el.innerHTML = this.escape(message);
        c.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    escape(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.workersApp = new WorkersApp();
});



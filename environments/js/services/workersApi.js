class WorkersApiService {
    constructor() {
        this.baseUrl = '/api/v1/environments';
        this.currentEnvironmentId = null;
    }

    setEnvironment(environmentId) {
        this.currentEnvironmentId = environmentId;
    }

    async list(environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) throw new Error('No environment selected');
        const res = await authenticatedFetch(`${this.baseUrl}/${envId}/workers`);
        if (!res.success) throw new Error(res.error || 'Failed to load workers');
        return res.data;
    }

    async control(name, action, environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) throw new Error('No environment selected');
        const res = await authenticatedFetch(`${this.baseUrl}/${envId}/workers/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
        if (!res.success) throw new Error(res.error || 'Failed to control worker');
        return res.data;
    }

    async logs(name, { lines = 200, type = 'both', parsed = false } = {}, environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) throw new Error('No environment selected');
        const params = new URLSearchParams({ lines: String(lines), type });
        if (parsed) params.set('parsed', '1');
        const res = await authenticatedFetch(`${this.baseUrl}/${envId}/workers/${encodeURIComponent(name)}/logs?${params}`);
        if (!res.success) throw new Error(res.error || 'Failed to fetch logs');
        return res.data;
    }

    async insights(name, { lines = 500, type = 'both' } = {}, environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) throw new Error('No environment selected');
        const params = new URLSearchParams({ lines: String(lines), type, insights: '1' });
        const res = await authenticatedFetch(`${this.baseUrl}/${envId}/workers/${encodeURIComponent(name)}/logs?${params}`);
        if (!res.success) throw new Error(res.error || 'Failed to fetch insights');
        return res.data;
    }
}

window.workersApi = new WorkersApiService();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkersApiService;
}


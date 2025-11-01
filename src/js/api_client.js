// api_client.js
export class ApiClient {
    constructor(resource = '', defaultHeaders = {}) {
        this.apiUrl = 'http://localhost:8081/api/v1/';
        this.baseUrl = `${this.clean(this.apiUrl)}/${this.clean(resource)}`;
        
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            ...defaultHeaders
        };
    }

    async request(path, { method = 'GET', data = null, headers = {} } = {}) {
        const options = {
            method,
            headers: { ...this.defaultHeaders, ...headers },
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const res = await fetch(`${this.baseUrl}/${path}`, options);
        if (!res.ok) {
            const msg = await res.text().catch(() => res.statusText);
            throw new Error(`API ${res.status} ${res.statusText}: ${msg}`);
        }

        // try to parse JSON, fallback to text
        try {
            return await res.json();
        } catch {
            return await res.text();
        }
    }

    get(path, params = {}, opts = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`${path}${query ? '?' + query : ''}`, { ...opts, method: 'GET' });
    }

    post(path, data, opts = {}) {
        return this.request(path, { ...opts, method: 'POST', data });
    }

    put(path, data, opts = {}) {
        return this.request(path, { ...opts, method: 'PUT', data });
    }

    delete(path, opts = {}) {
        return this.request(path, { ...opts, method: 'DELETE' });
    }

    clean(path) {
        return path.replace(/\/$/, ''); // remove trailing slash
    }
}

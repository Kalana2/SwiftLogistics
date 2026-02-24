/**
 * Service Registry — Lightweight service discovery with health checks
 * 
 * Services register on startup with { name, host, port }.
 * Registry polls /health endpoints every 10s.
 * getService(name) returns HTTP URL of a healthy instance.
 */

const axios = require('axios');
const { createLogger } = require('./logger');

const logger = createLogger('service-registry');

class ServiceRegistry {
    constructor() {
        this.services = new Map();
        this.healthCheckInterval = null;
    }

    /**
     * Register a service instance
     */
    register(name, host, port, metadata = {}) {
        const key = `${name}:${host}:${port}`;
        const entry = {
            name,
            host,
            port,
            url: `http://${host}:${port}`,
            status: 'UP',
            lastHeartbeat: new Date(),
            registeredAt: new Date(),
            metadata,
            failCount: 0
        };

        this.services.set(key, entry);
        logger.info(`Service registered: ${name}`, { host, port });

        return entry;
    }

    /**
     * Unregister a service instance
     */
    unregister(name, host, port) {
        const key = `${name}:${host}:${port}`;
        this.services.delete(key);
        logger.info(`Service unregistered: ${name}`, { host, port });
    }

    /**
     * Get a healthy service URL by name
     */
    getService(name) {
        const instances = this.getInstances(name).filter(s => s.status === 'UP');

        if (instances.length === 0) {
            logger.warn(`No healthy instances for service: ${name}`);
            return null;
        }

        // Simple round-robin: pick random healthy instance
        const instance = instances[Math.floor(Math.random() * instances.length)];
        return instance.url;
    }

    /**
     * Get all instances of a service
     */
    getInstances(name) {
        return Array.from(this.services.values()).filter(s => s.name === name);
    }

    /**
     * Get all registered services
     */
    getAllServices() {
        const result = {};
        for (const [key, entry] of this.services) {
            if (!result[entry.name]) {
                result[entry.name] = [];
            }
            result[entry.name].push({
                url: entry.url,
                status: entry.status,
                lastHeartbeat: entry.lastHeartbeat,
                uptime: Date.now() - entry.registeredAt.getTime()
            });
        }
        return result;
    }

    /**
     * Start periodic health checks (every 10s)
     */
    startHealthChecks(intervalMs = 10000) {
        if (this.healthCheckInterval) return;

        this.healthCheckInterval = setInterval(async () => {
            for (const [key, entry] of this.services) {
                try {
                    const res = await axios.get(`${entry.url}/health`, { timeout: 3000 });
                    entry.status = 'UP';
                    entry.lastHeartbeat = new Date();
                    entry.failCount = 0;
                } catch (err) {
                    entry.failCount++;
                    if (entry.failCount >= 3) {
                        const wasUp = entry.status === 'UP';
                        entry.status = 'DOWN';
                        if (wasUp) {
                            logger.warn(`Service DOWN: ${entry.name}`, {
                                url: entry.url,
                                failCount: entry.failCount
                            });
                        }
                    }
                }
            }
        }, intervalMs);

        logger.info('Health check monitoring started', { intervalMs });
    }

    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
}

// Singleton registry instance
const registry = new ServiceRegistry();

module.exports = { ServiceRegistry, registry };

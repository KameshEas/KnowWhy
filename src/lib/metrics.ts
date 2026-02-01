import client from 'prom-client';

// Use a Registry so we can expose a /api/metrics endpoint and reset in tests
const register = new client.Registry();
// Collect some default Node metrics (optional)
client.collectDefaultMetrics({ register });

const counters: Map<string, client.Counter> = new Map();
// Keep an internal numeric map so get() is deterministic in tests
const values: Map<string, number> = new Map();

function ensureCounter(name: string) {
  if (!counters.has(name)) {
    const counter = new client.Counter({
      name,
      help: `${name} counter`,
      registers: [register],
    });
    counters.set(name, counter);
  }
  return counters.get(name)!;
}

export const metrics = {
  increment: (name: string, value = 1) => {
    const c = ensureCounter(name);
    c.inc(value);
    values.set(name, (values.get(name) || 0) + value);
  },
  // Return stored numeric value
  get: (name: string) => {
    return values.get(name) || 0;
  },
  reset: () => {
    // Remove our counters from the registry and clear internal maps so tests can re-register metrics cleanly
    for (const name of Array.from(counters.keys())) {
      try {
        register.removeSingleMetric(name);
      } catch (e) {
        // ignore
      }
    }
    // Reset default metrics and any remaining metrics
    register.resetMetrics();
    counters.clear();
    values.clear();
  },
  prometheus: async () => {
    return register.metrics();
  },
};

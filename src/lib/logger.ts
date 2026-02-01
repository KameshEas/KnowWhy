type Meta = Record<string, any>;

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

export const logger = {
  info: (message: string, meta: Meta = {}) => {
    console.log(safeStringify({ level: 'info', message, ...meta }));
  },
  warn: (message: string, meta: Meta = {}) => {
    console.warn(safeStringify({ level: 'warn', message, ...meta }));
  },
  error: (message: string, meta: Meta = {}) => {
    console.error(safeStringify({ level: 'error', message, ...meta }));
  },
  audit: (event: string, meta: Meta = {}) => {
    console.log(safeStringify({ level: 'audit', event, ...meta }));
  }
};

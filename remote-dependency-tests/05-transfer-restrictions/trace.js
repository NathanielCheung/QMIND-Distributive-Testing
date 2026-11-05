'use strict';
const http = require('node:http');
const https = require('node:https');
const { AsyncLocalStorage } = require('node:async_hooks');

// Count raw HTTP response-body chunks before the XHR layer decodes them.
function traceRequests(events, blocked, onBlocked = () => {}) {
  const context = new AsyncLocalStorage();
  const originals = new Map();
  for (const transport of [http, https]) {
    const original = transport.request;
    originals.set(transport, original);
    transport.request = function (...args) {
      const active = context.getStore();
      const request = original.apply(this, args);
      if (!active) return request;
      const options = args[0];
      const entry = { type: 'module-http', protocol: transport === https ? 'https' : 'http',
        host: options.hostname || options.host || null, method: options.method || 'GET', bodyBytes: 0 };
      events.push(entry);
      if (typeof blocked === 'function' ? blocked() : blocked) {
        entry.blocked = true;
        onBlocked();
        request.destroy(new Error('Simulated restriction: dependency HTTP request blocked'));
        return request;
      }
      request.prependListener('response', response => {
        entry.status = response.statusCode;
        entry.contentLength = response.headers['content-length'] || null;
        entry.contentEncoding = response.headers['content-encoding'] || null;
        const push = response.push;
        response.push = function (chunk, ...rest) {
          if (chunk != null) entry.bodyBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
          return push.call(this, chunk, ...rest);
        };
        response.on('end', () => { entry.complete = true; });
      });
      return request;
    };
  }
  return { run: fn => context.run(true, fn), without: fn => context.run(false, fn), restore: () => { for (const [transport, original] of originals) transport.request = original; } };
}
module.exports = { traceRequests };

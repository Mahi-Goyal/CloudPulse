// src/server.js

const express = require('express');
const client = require('prom-client');

const app = express();
const port = process.env.PORT || 3000;

// ---- Prometheus Metrics Setup ----
client.collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: 'cloudpulse_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpErrorCounter = new client.Counter({
  name: 'cloudpulse_http_errors_total',
  help: 'Total number of HTTP 5xx responses',
  labelNames: ['method', 'route']
});

const httpRequestDuration = new client.Histogram({
  name: 'cloudpulse_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    const diff = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route && req.route.path ? req.route.path : req.path;
    const status = res.statusCode;
    const method = req.method;
    httpRequestCounter.inc({ method, route, status: String(status) });
    httpRequestDuration.observe({ method, route, status: String(status) }, diff);
    if (status >= 500 && status < 600) {
      httpErrorCounter.inc({ method, route });
    }
    return originalEnd.apply(this, args);
  };
  next();
});

app.get('/', (req, res) => {
  res.json({
    service: 'cloudpulse-monitoring-target',
    message: 'Application is running',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/work', (req, res) => {
  const data = { work: 'sample payload', timestamp: new Date().toISOString() };
  res.json(data);
});

app.get('/simulate-error', (req, res) => {
  res.status(500).json({ error: 'Intentional error for testing purposes' });
});

app.get('/metrics', async (req, res) => {
  try {
    const metrics = await client.register.metrics();
    res.set('Content-Type', client.register.contentType);
    res.end(metrics);
  } catch (ex) {
    res.status(500).end(ex);
  }
});

app.listen(port, () => {
  console.log(`cloudpulse-monitoring-target listening on port ${port}`);
});

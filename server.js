/* ================================================================
   Chicken Kitchen — BILL.com Proxy Server
   ================================================================
   Servidor local que:
   1. Sirve el index.html en http://localhost:3000
   2. Proxea /api/v2/* hacia https://api.bill.com/api/v2/*
      eliminando el problema de CORS completamente.

   USO:
     node server.js

   Luego abrir: http://localhost:3000
   ================================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BILL_HOST = 'api.bill.com';
const BILL_BASE = '/api/v2/';

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // --- Proxy: /api/v2/* -> https://api.bill.com/api/v2/* ---
  if (pathname.startsWith('/api/v2/')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const options = {
        hostname: BILL_HOST,
        port: 443,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          // If BILL.com returns HTML instead of JSON (403/rate-limit), wrap it
          const isJson = data.trimStart().startsWith('{') || data.trimStart().startsWith('[');
          if (!isJson) {
            res.writeHead(503, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              response_status: 1,
              response_message: 'BILL.com temporalmente no disponible (rate-limit o mantenimiento). Intenta de nuevo en unos minutos.',
              response_data: { error_code: 'PROXY_RATE_LIMIT', error_message: 'HTTP ' + proxyRes.statusCode }
            }));
            return;
          }
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });

      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // --- Static files ---
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  const extMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };

  const ext = path.extname(filePath).toLowerCase();
  const contentType = extMap[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║   CHICKEN KITCHEN — Bill Approval Server         ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║   Servidor corriendo en: http://localhost:${PORT}    ║`);
  console.log('  ║   Proxy BILL.com:        /api/v2/*               ║');
  console.log('  ║                                                   ║');
  console.log('  ║   Abrir en el navegador: http://localhost:3000    ║');
  console.log('  ║   Ctrl+C para detener                            ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
});

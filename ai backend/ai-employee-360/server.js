'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Auto-load .env if GEMINI_API_KEY is not set or is a placeholder
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const k = match[1];
        const v = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
        if (v && (!process.env[k] || process.env[k] === 'MY_GEMINI_API_KEY')) {
          process.env[k] = v;
        }
      }
    }
  }
}

const catalystFunction = require('./functions/employee_360_ai_function/index.js');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];
  const accept = req.headers['accept'] || '';

  // 1. If it's a Catalyst API route, Health check, or Catalyst serverless path, dispatch directly to the Catalyst function
  if (pathname.startsWith('/v1/') || pathname === '/health' || pathname.startsWith('/server/employee_360_ai_function')) {
    return catalystFunction(req, res);
  }

  // 2. If it's the root path requested as JSON, dispatch to the Catalyst function (service discovery)
  if (pathname === '/' && accept.includes('application/json') && !accept.includes('text/html')) {
    return catalystFunction(req, res);
  }

  // 3. Serve frontend static assets from frontend/app/
  const staticPath = path.join(__dirname, 'frontend', 'app', pathname.replace(/^\/app\//, '/'));
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(staticPath).pipe(res);
    return;
  }

  // 4. Serve the AI Employee 360 interactive dashboard on root
  if (pathname === '/' || pathname === '/index.html') {
    const targetHtml = fs.existsSync(path.join(__dirname, 'frontend', 'app', 'index.html'))
      ? path.join(__dirname, 'frontend', 'app', 'index.html')
      : INDEX_HTML_PATH;
    fs.readFile(targetHtml, 'utf-8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to load application index');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(content);
    });
    return;
  }

  // 4. Default: delegate to Catalyst function for 404 handling or custom routes
  return catalystFunction(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AI Employee 360] Server listening on http://0.0.0.0:${PORT}`);
  console.log(`[AI Employee 360] Catalyst Advanced I/O function mounted at /v1/employees/* and /health`);
});

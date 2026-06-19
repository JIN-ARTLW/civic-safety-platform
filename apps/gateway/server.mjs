// 게이트웨이 (터널 단일 URL용)
// /v1/* → 백엔드(127.0.0.1:9523) 프록시, 그 외 → 프론트 정적(apps/web/public).
// cloudflared 가 이 포트(기본 9500) 하나만 노출해도 FE+API 가 동일 출처로 동작.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'web', 'public');
const PORT = Number(process.env.GATEWAY_PORT || 9500);
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.API_PORT || 9523);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function proxyToApi(req, res) {
  const opts = {
    host: API_HOST, port: API_PORT, path: req.url, method: req.method,
    headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
  };
  const up = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });
  up.on('error', () => { res.statusCode = 502; res.end(JSON.stringify({ error: 'bad gateway' })); });
  req.pipe(up);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // API 프록시
  if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) return proxyToApi(req, res);

  // 정적
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  if (path === '/officer') path = '/officer.html';
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  try {
    const data = await readFile(join(PUBLIC, safe));
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(safe)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<h1>404</h1>');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`[gateway] http://0.0.0.0:${PORT} (static + /v1→:${API_PORT})`));

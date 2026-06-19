// 프론트엔드 정적 서버 (Node 내장 http, 의존성 없음)
// 포트 9503, 0.0.0.0 바인딩 → 도메인 p3.sumzip.com 접근 보장.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = Number(process.env.WEB_PORT || 9503);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (path === '/') path = '/index.html';
  if (path === '/officer') path = '/officer.html';
  // 디렉터리 탈출 방지
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, safe);
  try {
    const data = await readFile(file);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404</h1>');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[web] listening on http://${HOST}:${PORT} (domain: p3.sumzip.com)`);
});

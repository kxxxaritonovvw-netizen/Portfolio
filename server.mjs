import http from 'node:http';
import { readFile } from 'node:fs/promises';

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/favicon.svg', ['assets/favicon.svg', 'image/svg+xml']],
  ['/assets/signature.svg', ['assets/signature.svg', 'image/svg+xml']],
  ['/assets/badge-front.png', ['assets/badge-front.png', 'image/png']],
  ['/assets/badge-back.png', ['assets/badge-back.png', 'image/png']],
  ['/badge.js', ['badge.js', 'text/javascript; charset=utf-8']],
  ['/intro.js', ['intro.js', 'text/javascript; charset=utf-8']],
  ['/badge.css', ['badge.css', 'text/css; charset=utf-8']],
  ['/vendor/three.module.js', ['vendor/three.module.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three.core.js', ['vendor/three.core.js', 'text/javascript; charset=utf-8']],
]);

http.createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end();
  }
}).listen(4173, process.argv[2] || '127.0.0.1', () => console.log(`Preview: http://${process.argv[2] || '127.0.0.1'}:4173`));

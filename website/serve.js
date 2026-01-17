/**
 * Simple development server for the Better Vibe landing page
 * Usage: bun run serve.js [--port PORT]
 */

const port = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }

    // Try to serve the file
    const filePath = `.${pathname}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const ext = pathname.substring(pathname.lastIndexOf('.'));
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 404 - try serving index.html for SPA-like behavior
    const indexFile = Bun.file('./index.html');
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`
  Better Vibe Website
  -------------------
  Local:   http://localhost:${port}
  Network: http://${getNetworkAddress()}:${port}

  Press Ctrl+C to stop
`);

function getNetworkAddress() {
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    return 'localhost';
  }
  return 'localhost';
}

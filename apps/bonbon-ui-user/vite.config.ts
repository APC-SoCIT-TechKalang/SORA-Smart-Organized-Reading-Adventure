import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'local-kiosk-reader',
      configureServer(server) {
        server.middlewares.use('/api/kiosk/rfid-login', (request, response, next) => {
          const address = request.socket.remoteAddress;
          const host = request.headers.host ?? '';
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '');
          const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
          // Only the browser on this local kiosk may use the development proxy.
          // Remote deployments must use an authenticated native reader bridge.
          const sameOrigin = request.headers.origin === `http://${host}`;
          if (!local || !localHost || !sameOrigin || request.method !== 'POST') {
            response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ error: 'Use the card reader on the local kiosk.' }));
            return;
          }
          if (!env.KIOSK_RFID_BRIDGE_KEY) {
            response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ error: 'Card detected. Ask staff to configure the local reader bridge.' }));
            return;
          }
          next();
        });
      },
    }],
    server: {
      proxy: {
        '/api/kiosk/rfid-login': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          headers: { 'x-kiosk-reader-key': env.KIOSK_RFID_BRIDGE_KEY ?? '' },
        },
      },
    },
  };
});

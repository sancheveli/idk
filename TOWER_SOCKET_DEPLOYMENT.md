# Terrifying Towering Socket Deployment

Terrifying Towering global multiplayer uses `server/socket-server.js` as an
always-on Socket.IO server. Vercel hosts the frontend, but it does not run this
persistent multiplayer process.

## Frontend on Vercel

Set these environment variables on the Vercel project:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_SOCKET_URL=https://your-tower-socket-host.example
```

Redeploy the frontend after changing `VITE_SOCKET_URL`.

## Socket Server Host

Deploy the project to a WebSocket-capable Node host such as Render, Railway,
Fly.io, or a VPS. Start the service with:

```text
npm run dev:socket
```

Set these variables on the socket host:

```text
PORT=3001
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
```

The host can check `GET /health`; a healthy server returns JSON with `ok: true`.

## Local Development

Run both processes:

```text
npm run dev
npm run dev:socket
```

By default local Vite connects to `http://localhost:3001`. To test the hosted
socket server from local dev, set:

```text
VITE_USE_REMOTE_SOCKET=true
VITE_SOCKET_URL=https://your-tower-socket-host.example
```

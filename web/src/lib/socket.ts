import { io, Socket } from 'socket.io-client';
import axios from 'axios';

let socket: Socket | null = null;
let recovering = false;
let recoverAttempts = 0;
// Token levado ao último handshake. Reabrir um socket derrubado só faz
// sentido com um token DIFERENTE do que o gateway acabou de recusar —
// com o mesmo ele derruba de novo. Também é o que nos mantém fora do
// caminho da reconexão automática numa queda de rede (mesmo token).
let lastAttemptedToken: string | null = null;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function readAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;
  try {
    // axios puro (não o client com interceptors) pra não entrar em loop de 401.
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
      refreshToken,
    });
    localStorage.setItem('access_token', data.data.accessToken);
    localStorage.setItem('refresh_token', data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// Quando o gateway derruba a conexão no handshake (token expirado →
// client.disconnect() no backend), o socket.io-client recebe reason
// "io server disconnect" e NÃO reconecta sozinho. Sem este recovery,
// uma única expiração de access_token mata o realtime até o usuário
// dar F5 — o REST continua funcionando (interceptor do axios renova o
// token), então o app parece vivo mas nenhum message:new chega.
async function recoverFromServerDisconnect() {
  if (recovering || !socket) return;
  recovering = true;
  try {
    // Backoff pra não loopar caso o servidor rejeite por outro motivo
    // (membership removida, org inválida) — aí reconectar nunca vai passar.
    const delay = Math.min(1000 * 2 ** recoverAttempts, 30000);
    recoverAttempts += 1;
    await new Promise((r) => setTimeout(r, delay));
    const ok = await refreshAccessToken();
    if (ok && socket) socket.connect();
  } finally {
    recovering = false;
  }
}

export function getSocket(): Socket {
  const token = readAccessToken();

  if (socket) {
    // Deslogado o socket nasce fechado (ver autoConnect abaixo); é aqui que
    // ele abre assim que o login grava o token. Sem isto o singleton morto
    // sobrevive à navegação client-side de /login pra /inbox e o realtime
    // só volta com F5. Token igual ao da última tentativa = não insistir:
    // ou o gateway já recusou este token, ou o socket.io está reconectando
    // sozinho e não queremos atropelar.
    if (token && socket.disconnected && token !== lastAttemptedToken) {
      lastAttemptedToken = token;
      socket.connect();
    }
    return socket;
  }

  const url = API_BASE.replace('/api/v1', '');

  socket = io(url, {
    auth: (cb) => {
      const currentToken = readAccessToken();
      const organizationId = localStorage.getItem('active_org_id');
      lastAttemptedToken = currentToken;
      cb({ token: currentToken, organizationId });
    },
    transports: ['websocket', 'polling'],
    // Sem token o gateway aceita o handshake e derruba na hora, com reason
    // "io server disconnect" — que o socket.io-client NÃO reconecta sozinho.
    // Abrir aqui só serviria pra deixar o singleton morto pra sessão que
    // vem logo depois do login.
    autoConnect: !!token,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Sem limite de tentativas: com reconnectionAttempts finito o socket
    // desiste PARA SEMPRE após N falhas (ex: deploy de 1min do backend)
    // e o usuário fica sem realtime até recarregar a página.
    reconnectionAttempts: Infinity,
  });

  // Marca a tentativa já na criação: o callback `auth` só roda quando o
  // handshake sai, e até lá outra montagem poderia pedir um connect() a mais.
  if (token) lastAttemptedToken = token;

  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return;
    void recoverFromServerDisconnect();
  });

  // Handshake completou de verdade (auth + rooms) — zera o backoff.
  socket.on('ready', () => {
    recoverAttempts = 0;
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastAttemptedToken = null;
  }
}

// Typed Socket.IO client. One connection per page (each iframe in the Director is its own page).
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

export type TachiSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TachiSocket | null = null;

export function getSocket(): TachiSocket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true });
  }
  return socket;
}

/** Upload a photo file → public url (served from /uploads/...). */
export async function uploadPhoto(file: File | Blob, filename = 'photo.jpg'): Promise<string> {
  const form = new FormData();
  form.append('photo', file, (file as File).name ?? filename);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const json = (await res.json()) as { url: string };
  return json.url;
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png' };
const server = createServer(async (request, response) => {
  if (request.url === '/scripts/secrets.js') {
    response.setHeader('Content-Type', 'text/javascript');
    return response.end("export const SECRET_KEYS={CUSTOM:'api_key_custom'};export const secret_state={api_key_custom:[{id:'secret-1',label:'本地密钥',active:true}]};export async function rotateSecret(_key,id){for(const row of secret_state.api_key_custom)row.active=row.id===id};export async function writeSecret(_key,_value,label){const id='secret-new';secret_state.api_key_custom.push({id,label,active:false});return id};");
  }
  if (request.url === '/api/backends/chat-completions/status' && request.method === 'POST') {
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ data: [{ id: 'demo-model' }, { id: 'another-model' }] }));
  }
  const relative = request.url === '/' ? 'tests/fixtures/mock-host.html' : decodeURIComponent(request.url.split('?')[0]).replace(/^\//, '');
  const file = normalize(join(root, relative));
  if (!file.startsWith(normalize(root))) { response.statusCode = 403; return response.end('Forbidden'); }
  try { const data = await readFile(file); response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); response.end(data); }
  catch { response.statusCode = 404; response.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Visual fixture: http://127.0.0.1:4173'));

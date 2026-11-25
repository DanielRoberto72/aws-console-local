import { request, type Agent } from 'node:https';

/**
 * Baixa um arquivo servido pelo próprio emulador (ex.: o zip de uma função Lambda).
 * A URL devolvida pelo emulador usa o endereço que ele enxerga (127.0.0.1); aqui ela
 * é reescrita para o endpoint configurado, que dentro do compose é "emulator".
 */
export function downloadFromEmulator(location: string, endpoint: string, agent: Agent): Promise<Buffer> {
  const url = new URL(location);
  const target = new URL(endpoint);
  url.protocol = target.protocol;
  url.host = target.host;

  return new Promise((resolve, reject) => {
    const req = request(url, { agent, method: 'GET', timeout: 60_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download do emulador retornou HTTP ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado no download do emulador')));
    req.on('error', reject);
    req.end();
  });
}

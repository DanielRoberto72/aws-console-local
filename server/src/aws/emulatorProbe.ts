import { request, type Agent } from 'node:https';
import type { TLSSocket } from 'node:tls';

export type EmulatorProbe =
  | { online: true; bootId: string }
  | { online: false; reason: string };

/**
 * Consulta o health do emulador. O certificado TLS é recriado a cada início do
 * emulador, então o fingerprint identifica a "instância" atual: quando muda, o
 * estado em memória foi perdido e precisa ser restaurado.
 */
export function probeEmulator(endpoint: string, agent: Agent, timeoutMs = 3_000): Promise<EmulatorProbe> {
  return new Promise((resolve) => {
    const url = new URL('/__admin/health', endpoint);
    const req = request(url, { agent, method: 'GET', timeout: timeoutMs }, (res) => {
      const fingerprint = (res.socket as TLSSocket).getPeerCertificate?.()?.fingerprint256;
      res.resume();
      if (res.statusCode !== 200) return resolve({ online: false, reason: `health retornou HTTP ${res.statusCode}` });
      if (!fingerprint) return resolve({ online: false, reason: 'certificado do emulador indisponível' });
      resolve({ online: true, bootId: fingerprint });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', (err) => resolve({ online: false, reason: err.message }));
    req.end();
  });
}

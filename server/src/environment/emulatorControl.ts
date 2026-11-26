import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVersionOutput, type InstalledVersion } from '../emulator/versions.js';

/**
 * Pasta compartilhada com o container do emulador (emulator/start.sh). O script grava a
 * versão do emulador e um marcador de que supervisiona o processo; o console pede um
 * reinício criando um arquivo, e o script reinicia o emulador, que volta sem estado.
 */
export class EmulatorControl {
  constructor(private readonly dir: string | undefined) {}

  async installedVersion(): Promise<InstalledVersion | null> {
    if (!this.dir) return null;
    try {
      return parseVersionOutput(await readFile(join(this.dir, 'version.txt'), 'utf8'));
    } catch {
      return null;
    }
  }

  /** Falso fora do Docker Compose ou com uma imagem do emulador anterior ao supervisor. */
  async canRestart(): Promise<boolean> {
    if (!this.dir) return false;
    try {
      await access(join(this.dir, 'supervised'));
      return true;
    } catch {
      return false;
    }
  }

  async requestRestart(): Promise<void> {
    if (!this.dir) throw new Error('pasta de controle do emulador não configurada');
    await writeFile(join(this.dir, 'restart-requested'), new Date().toISOString());
  }
}

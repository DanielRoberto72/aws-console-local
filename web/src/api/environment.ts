import { encode, request } from './http';

export interface EnvironmentStatus {
  /** Falso quando o console não consegue reiniciar o emulador (fora do compose, imagem antiga). */
  canReplace: boolean;
  reason: string | null;
}

export interface LabTemplate {
  id: string;
  title: string;
  description: string;
  /** Quantidade de recursos por serviço. */
  resources: Record<string, number>;
}

/** Link direto: o navegador baixa o arquivo com o nome enviado pelo servidor. */
export const EXPORT_URL = '/api/environment/export';

export const environmentApi = {
  status: (signal?: AbortSignal) => request<EnvironmentStatus>('/api/environment', { signal }),
  templates: (signal?: AbortSignal) => request<{ templates: LabTemplate[] }>('/api/environment/templates', { signal }),
  import: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ ok: true }>('/api/environment/import', { method: 'POST', body: form });
  },
  reset: () => request<{ ok: true }>('/api/environment/reset', { method: 'POST' }),
  loadTemplate: (id: string) => request<{ ok: true }>(`/api/environment/templates/${encode(id)}/load`, { method: 'POST' }),
};

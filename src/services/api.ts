const API_BASE = (import.meta as any).env.VITE_API_URL || "https://boteado-bot-442790495206.us-west2.run.app";

export interface ExtractedItem {
  monto: number | null;
  tipo: "ingreso" | "egreso";
  moneda: "ARS" | "USD";
  categoria: string;
  empresa: string | null;
  descripcion: string;
}

export type GeminiResponse =
  | { intent: "REGISTRAR"; items: ExtractedItem[] }
  | { intent: "GESTIONAR_EMPRESA"; action: "ADD" | "DELETE"; companyName: string }
  | { intent: "ELIMINAR_MOVIMIENTO"; target: "last" | string }
  | { intent: "CONSULTAR"; query: string }
  | { error: string };

export interface Movimiento {
  id: string;
  created_at: string;
  tipo: string;
  moneda: string;
  monto: number;
  categoria: string;
  empresa_nombre: string;
  descripcion: string;
  original_text: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  created_at: string;
}

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  async extract(text: string, categories: Categoria[]): Promise<GeminiResponse> {
    return fetchApi("/api/extract", {
      method: "POST",
      body: JSON.stringify({ text, categories }),
    });
  },

  async saveMovimientos(items: ExtractedItem[], originalText: string): Promise<Movimiento[]> {
    return fetchApi("/api/movimientos", {
      method: "POST",
      body: JSON.stringify({ items, originalText }),
    });
  },

  async addEmpresa(nombre: string): Promise<Empresa> {
    return fetchApi("/api/empresas", {
      method: "POST",
      body: JSON.stringify({ nombre }),
    });
  },

  async deleteMovimiento(id: string): Promise<void> {
    return fetchApi(`/api/movimientos/${id}`, { method: "DELETE" });
  },

  async deleteLastMovimiento(): Promise<{ ok: boolean; id: string | null }> {
    return fetchApi("/api/movimientos/last", { method: "DELETE" });
  },

  async deleteAllMovimientos(): Promise<void> {
    return fetchApi("/api/movimientos/all", { method: "DELETE" });
  },

  async deleteEmpresa(id: string): Promise<void> {
    return fetchApi(`/api/empresas/${id}`, { method: "DELETE" });
  },

  async deleteCategoria(id: string): Promise<void> {
    return fetchApi(`/api/categorias/${id}`, { method: "DELETE" });
  },

  async getMovimientos(limit = 100): Promise<Movimiento[]> {
    return fetchApi(`/api/movimientos?limit=${limit}`);
  },

  async getEmpresas(): Promise<Empresa[]> {
    return fetchApi("/api/empresas");
  },

  async getCategorias(): Promise<Categoria[]> {
    return fetchApi("/api/categorias");
  },
};

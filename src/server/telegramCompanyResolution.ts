export interface TelegramCompanyOption {
  id?: string;
  nombre: string;
}

export interface TelegramDraftItem {
  empresa: string | null | undefined;
}

export type TelegramCompanyResolution =
  | { kind: 'missing' }
  | { kind: 'exact'; company: TelegramCompanyOption }
  | { kind: 'suggest'; company: TelegramCompanyOption; score: number }
  | { kind: 'unresolved' };

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function similarityScore(input: string, candidate: string) {
  if (input === candidate) return 1;
  const inputParts = input.split(' ').filter(Boolean);
  const candidateParts = candidate.split(' ').filter(Boolean);
  const alignedTokenHint =
    inputParts.length === candidateParts.length && inputParts.length > 0
      ? inputParts.every((part, index) => levenshtein(part, candidateParts[index]) <= 2)
      : false;

  const inputTokens = new Set(inputParts);
  const candidateTokens = new Set(candidateParts);
  const intersection = [...inputTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...inputTokens, ...candidateTokens]).size || 1;
  const jaccard = intersection / union;

  const distance = levenshtein(input, candidate);
  const editRatio = 1 - distance / Math.max(input.length, candidate.length, 1);

  const containsBoost =
    input.length >= 4 && candidate.includes(input)
      ? 0.12
      : candidate.length >= 4 && input.includes(candidate)
        ? 0.08
        : 0;

  const alignedBoost = alignedTokenHint ? 0.18 : 0;
  return Math.min(1, jaccard * 0.45 + editRatio * 0.55 + containsBoost + alignedBoost);
}

export async function getTopEmpresasForDashboard(
  supabase: any,
  scope: { dashboardId: string | null; ownerUserId: string | null },
  limit = 8
): Promise<Array<{ id: string; nombre: string }>> {
  if (!scope.dashboardId && !scope.ownerUserId) return [];

  let empresasQuery = supabase
    .from("empresas")
    .select("id, nombre, created_at")
    .is("deleted_at", null);
  if (scope.dashboardId) {
    empresasQuery = empresasQuery.eq("dashboard_id", scope.dashboardId);
  } else {
    empresasQuery = empresasQuery.eq("owner_user_id", scope.ownerUserId);
  }
  const { data: empresas } = await empresasQuery;
  if (!empresas || empresas.length === 0) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let movQuery = supabase
    .from("movimientos")
    .select("empresa_nombre")
    .not("empresa_nombre", "is", null)
    .gte("created_at", thirtyDaysAgo);
  if (scope.dashboardId) {
    movQuery = movQuery.eq("dashboard_id", scope.dashboardId);
  } else {
    movQuery = movQuery.eq("owner_user_id", scope.ownerUserId);
  }
  const { data: movimientos } = await movQuery;

  const freq = new Map<string, number>();
  if (movimientos) {
    for (const m of movimientos) {
      if (m.empresa_nombre) {
        freq.set(m.empresa_nombre, (freq.get(m.empresa_nombre) ?? 0) + 1);
      }
    }
  }

  const sorted = [...empresas].sort((a: any, b: any) => {
    const fa = freq.get(a.nombre) ?? 0;
    const fb = freq.get(b.nombre) ?? 0;
    if (fb !== fa) return fb - fa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return sorted.slice(0, limit).map((e: any) => ({ id: e.id, nombre: e.nombre }));
}

export function resolveTelegramCompany(
  item: TelegramDraftItem,
  companies: TelegramCompanyOption[],
): TelegramCompanyResolution {
  const raw = item.empresa?.trim() ?? '';
  if (!raw) return { kind: 'missing' };

  const normalizedInput = normalizeName(raw);
  if (!normalizedInput) return { kind: 'missing' };

  const normalizedCompanies = companies
    .map((company) => ({ company, normalized: normalizeName(company.nombre) }))
    .filter((entry) => entry.normalized.length > 0);

  const exact = normalizedCompanies.find((entry) => entry.normalized === normalizedInput);
  if (exact) return { kind: 'exact', company: exact.company };

  const ranked = normalizedCompanies
    .map((entry) => ({
      company: entry.company,
      score: similarityScore(normalizedInput, entry.normalized),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best) return { kind: 'unresolved' };

  const gap = best.score - (second?.score ?? 0);
  if (best.score >= 0.9 || (best.score >= 0.63 && gap >= 0.05)) {
    return { kind: 'suggest', company: best.company, score: best.score };
  }

  return { kind: 'unresolved' };
}

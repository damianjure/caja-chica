import { createZip } from "./zip.ts";

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.join(",");
  if (rows.length === 0) return head;
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

const MOV_COLS = ["id", "created_at", "tipo", "monto", "moneda", "categoria", "empresa_nombre", "descripcion", "original_text", "conciliado"];
const EMP_COLS = ["id", "nombre", "cuit", "created_at"];
const CAT_COLS = ["id", "nombre"];

export interface BackupData {
  movimientos: Array<Record<string, unknown>>;
  empresas: Array<Record<string, unknown>>;
  categorias: Array<Record<string, unknown>>;
}

export function buildBackupZip(data: BackupData): Buffer {
  return createZip([
    { name: "movimientos.csv", data: Buffer.from(toCsv(data.movimientos, MOV_COLS), "utf8") },
    { name: "empresas.csv", data: Buffer.from(toCsv(data.empresas, EMP_COLS), "utf8") },
    { name: "categorias.csv", data: Buffer.from(toCsv(data.categorias, CAT_COLS), "utf8") },
  ]);
}

export function backupFileName(date = new Date()): string {
  return `caja-chica-backup-${date.toISOString().slice(0, 10)}.zip`;
}

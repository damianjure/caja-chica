import type { Movimiento } from "../services/api";
import type { ReportExportFormat, ReportFilters } from "../reports/shared";

interface SaldosRow {
  empresa: string;
  ingresos: number;
  egresos: number;
  saldo_neto: number;
}

function escapeCsvCell(value: unknown) {
  let text = String(value ?? "");
  // Excel formula injection guard: neutralize formula triggers, but leave plain
  // numbers (e.g. negative amounts) untouched so they stay numeric in Excel.
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) {
    text = `'${text}`;
  }
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildPdfBuffer(lines: string[]) {
  const pageSize = 42;
  const pages = [];
  for (let i = 0; i < lines.length; i += pageSize) {
    pages.push(lines.slice(i, i + pageSize));
  }

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageIds: number[] = [];
  let nextObjectId = 4;

  for (const pageLines of pages) {
    const contentId = nextObjectId++;
    const pageId = nextObjectId++;
    pageIds.push(pageId);
    const body = [
      "BT",
      "/F1 10 Tf",
      "40 760 Td",
      ...pageLines.flatMap((line, index) =>
        index === 0
          ? [`(${escapePdfText(line)}) Tj`]
          : ["0 -16 Td", `(${escapePdfText(line)}) Tj`],
      ),
      "ET",
    ].join("\n");
    objects[contentId] = `<< /Length ${Buffer.byteLength(body, "utf8")} >>\nstream\n${body}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) continue;
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildReportCsv(movements: Movimiento[]) {
  const rows = [
    ["Fecha", "Tipo", "Moneda", "Monto", "Categoría", "Empresa", "Descripción"],
    ...movements.map((item) => [
      item.created_at,
      item.tipo,
      item.moneda,
      item.monto,
      item.categoria,
      item.empresa_nombre,
      item.descripcion,
    ]),
  ];

  return Buffer.from(
    rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n"),
    "utf8",
  );
}

export function buildReportPdf(args: {
  fileName: string;
  periodLabel: string;
  filters: ReportFilters;
  movements: Movimiento[];
}) {
  const totals = args.movements.reduce(
    (acc, item) => {
      const amount = Number(item.monto || 0);
      if (item.moneda === "ARS") {
        if (item.tipo === "ingreso") acc.ingresosArs += amount;
        else acc.egresosArs += amount;
      }
      if (item.moneda === "USD") {
        if (item.tipo === "ingreso") acc.ingresosUsd += amount;
        else acc.egresosUsd += amount;
      }
      return acc;
    },
    { ingresosArs: 0, egresosArs: 0, ingresosUsd: 0, egresosUsd: 0 },
  );

  const lines = [
    `Caja Chica - ${args.fileName}`,
    `Período: ${args.periodLabel}`,
    `Empresa: ${args.filters.companies.length === 0 || args.filters.companies.includes("all") ? "Todas" : args.filters.companies.join(", ")}`,
    `Tipo: ${args.filters.tipo}`,
    `Moneda: ${args.filters.moneda}`,
    `Movimientos: ${args.movements.length}`,
    `Ingresos ARS: ${totals.ingresosArs} | Egresos ARS: ${totals.egresosArs}`,
    `Ingresos USD: ${totals.ingresosUsd} | Egresos USD: ${totals.egresosUsd}`,
    "",
    ...args.movements.map(
      (item) =>
        `${item.created_at.slice(0, 10)} | ${item.tipo} | ${item.moneda} ${item.monto} | ${item.empresa_nombre} | ${item.categoria} | ${item.descripcion}`,
    ),
  ];

  return buildPdfBuffer(lines);
}

export function buildSaldosReport(args: {
  format: ReportExportFormat;
  fileName: string;
  periodLabel: string;
  filters: ReportFilters;
  movements: Movimiento[];
}): { mimeType: string; buffer: Buffer } {
  const { movements, filters } = args;

  // Filter by companies if specified
  const visibleMovements =
    filters.companies.length === 0 || filters.companies.includes("all")
      ? movements
      : movements.filter((m) => filters.companies.includes(m.empresa_nombre));

  // Aggregate by empresa_nombre
  const byCompany = new Map<string, SaldosRow>();
  for (const m of visibleMovements) {
    const empresa = m.empresa_nombre ?? "Sin empresa";
    if (!byCompany.has(empresa)) {
      byCompany.set(empresa, { empresa, ingresos: 0, egresos: 0, saldo_neto: 0 });
    }
    const row = byCompany.get(empresa)!;
    const amount = Number(m.monto || 0);
    if (m.tipo === "ingreso") row.ingresos += amount;
    else row.egresos += amount;
    row.saldo_neto = row.ingresos - row.egresos;
  }

  const dataRows = Array.from(byCompany.values());
  const total: SaldosRow = {
    empresa: "Total",
    ingresos: dataRows.reduce((s, r) => s + r.ingresos, 0),
    egresos: dataRows.reduce((s, r) => s + r.egresos, 0),
    saldo_neto: dataRows.reduce((s, r) => s + r.saldo_neto, 0),
  };
  const rows = [...dataRows, total];

  if (args.format === "csv") {
    const header = ["Empresa", "Ingresos", "Egresos", "Saldo Neto"];
    const csvRows = [
      header,
      ...rows.map((r) => [r.empresa, r.ingresos, r.egresos, r.saldo_neto]),
    ];
    const csv = csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    return { mimeType: "text/csv;charset=utf-8", buffer: Buffer.from(csv, "utf8") };
  }

  // PDF
  const lines = [
    `Caja Chica - ${args.fileName}`,
    `Período: ${args.periodLabel}`,
    `Empresa: ${filters.companies.length === 0 || filters.companies.includes("all") ? "Todas" : filters.companies.join(", ")}`,
    "",
    "Empresa               | Ingresos  | Egresos   | Saldo Neto",
    "--------------------------------------------------------------",
    ...rows.map(
      (r) =>
        `${r.empresa.padEnd(22)}| ${String(r.ingresos).padEnd(10)}| ${String(r.egresos).padEnd(10)}| ${r.saldo_neto}`,
    ),
  ];
  return { mimeType: "application/pdf", buffer: buildPdfBuffer(lines) };
}

export function buildReportFile(args: {
  format: ReportExportFormat;
  fileName: string;
  periodLabel: string;
  filters: ReportFilters;
  movements: Movimiento[];
}) {
  if (args.format === "csv") {
    return {
      mimeType: "text/csv;charset=utf-8",
      buffer: buildReportCsv(args.movements),
    };
  }

  return {
    mimeType: "application/pdf",
    buffer: buildReportPdf(args),
  };
}


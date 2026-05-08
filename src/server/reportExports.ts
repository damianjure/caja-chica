import type { Movimiento } from "../services/api";
import type { ReportExportFormat, ReportFilters } from "../reports/shared";

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
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
    `Empresa: ${args.filters.company === "all" ? "Todas" : args.filters.company}`,
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


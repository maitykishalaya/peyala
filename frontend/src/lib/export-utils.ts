// ─────────────────────────────────────────────────────────────────
// Export Utilities: CSV, Excel (.xls), and Printable PDF
// Peyala v8 — Reporting Engine Export Suite
// ─────────────────────────────────────────────────────────────────

/**
 * Escapes a single CSV cell value
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports tabular data as UTF-8 BOM CSV
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const headerLine = headers.map(escapeCsvValue).join(',');
  const rowLines = rows.map((r) => r.map(escapeCsvValue).join(','));
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', safeFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports tabular data as an Excel SpreadsheetML (.xls) document
 * Opens natively in Microsoft Excel, Apple Numbers, and Google Sheets with formatted bold headers.
 */
export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const safeFilename = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  const cleanSheetName = (sheetName || 'Report').replace(/[:\\/?*\[\]]/g, '').slice(0, 31);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#C53030" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9B2C2C"/>
   </Borders>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="TextStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${cleanSheetName}">
  <Table>
`;

  // Header row
  xml += '   <Row ss:Height="22">\n';
  headers.forEach((h) => {
    xml += `    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  // Data rows
  rows.forEach((row) => {
    xml += '   <Row ss:Height="18">\n';
    row.forEach((cell) => {
      const isNum = typeof cell === 'number' && !isNaN(cell);
      const styleId = isNum ? 'NumberStyle' : 'TextStyle';
      const dataType = isNum ? 'Number' : 'String';
      const val = isNum ? cell : escapeXml(String(cell ?? ''));
      xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="${dataType}">${val}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';
  });

  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', safeFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Triggers clean formatted browser print / Save as PDF
 */
export function printReport(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  summaryCards?: { label: string; value: string }[]
) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Please allow popups to print/export PDF report.');
    return;
  }

  let summaryHtml = '';
  if (summaryCards && summaryCards.length > 0) {
    summaryHtml = `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
        ${summaryCards
          .map(
            (c) => `
          <div style="flex: 1; min-width: 140px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">${escapeXml(c.label)}</div>
            <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px;">${escapeXml(c.value)}</div>
          </div>`
          )
          .join('')}
      </div>
    `;
  }

  const tableHeaderHtml = headers
    .map((h) => `<th style="padding: 8px 10px; background: #c53030; color: white; text-align: left; font-size: 11px; font-weight: bold; border: 1px solid #e2e8f0;">${escapeXml(h)}</th>`)
    .join('');

  const tableBodyHtml = rows
    .map(
      (r, idx) => `
      <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        ${r
          .map(
            (c) =>
              `<td style="padding: 7px 10px; font-size: 11px; color: #1e293b; border: 1px solid #e2e8f0;">${escapeXml(String(c ?? ''))}</td>`
          )
          .join('')}
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeXml(title)} — Peyala Café</title>
  <style>
    @media print {
      @page { margin: 12mm; size: auto; }
      body { margin: 0; }
      .no-print { display: none; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #0f172a; }
    h1 { font-size: 20px; font-weight: 900; margin: 0 0 4px 0; color: #991b1b; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  </style>
</head>
<body>
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;">
    <div>
      <h1>🍵 Peyala Café & Restaurant</h1>
      <div style="font-size: 14px; font-weight: bold; color: #334155; margin-top: 2px;">${escapeXml(title)}</div>
      <div class="subtitle">${escapeXml(subtitle)}</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br>
      System: Peyala Analytics Engine
    </div>
  </div>

  ${summaryHtml}

  <table>
    <thead>
      <tr>${tableHeaderHtml}</tr>
    </thead>
    <tbody>
      ${tableBodyHtml}
    </tbody>
  </table>

  <div style="margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px;">
    Confidential Internal Business Report · Peyala Café & Restaurant (Howrah, West Bengal)
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

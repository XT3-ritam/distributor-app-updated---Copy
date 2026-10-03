function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
export interface ExcelSheet { name:string; rows: Array<Array<unknown>>; }
export function workbookXml(sheets: ExcelSheet[]): string {
  const sheetXml = sheets.map(sheet => `<Worksheet ss:Name="${esc(sheet.name)}"><Table>${sheet.rows.map(row=>`<Row>${row.map(cell=>`<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${esc(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`).join('');
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/></Style></Styles>${sheetXml}</Workbook>`;
}

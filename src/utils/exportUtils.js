/**
 * Export and Formatting Utilities for PT Vinix Seven Aurum Warehouse Management System
 * 
 * Provides:
 * 1. Safe CSV / Excel-compatible export with strict protection against Spreadsheet Formula Injection.
 * 2. Indonesian date & number formatters.
 * 3. Print helper for PDF generation via browser native print engine.
 */

/**
 * Sanitizes a cell value to prevent Spreadsheet Formula Injection (CSV Injection).
 * If a text cell starts with dangerous formula triggers (=, +, -, @, \t, \r),
 * it is prefixed with a single quote (') so spreadsheet engines (Excel, LibreOffice,
 * Google Sheets) treat it strictly as literal text.
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Trim leading whitespace for formula trigger detection
  const trimmed = str.trimStart();
  const dangerousTriggers = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousTriggers.some(trigger => trimmed.startsWith(trigger))) {
    // Prefix with single quote to force text interpretation
    str = `'` + str;
  }

  // If the cell contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Exports data to a CSV file encoded in UTF-8 with BOM for perfect Microsoft Excel compatibility.
 * 
 * @param {string} filename - Target filename (e.g. 'laporan-inventaris.csv')
 * @param {Array<string>} headers - Column titles array
 * @param {Array<Array<any>>} rows - 2D array of row cells
 * @param {Object} metadata - Optional header metadata (title, period, generatedAt, generatedBy)
 */
export function exportToCsv(filename, headers, rows, metadata = {}) {
  const lines = [];

  // 1. Optional Metadata Header block
  if (metadata.title) {
    lines.push(sanitizeCsvCell(`PT VINIX SEVEN AURUM - WAREHOUSE MANAGEMENT SYSTEM`));
    lines.push(sanitizeCsvCell(metadata.title));
  }
  if (metadata.generatedAt) {
    lines.push(sanitizeCsvCell(`Waktu Pembuatan: ${metadata.generatedAt}`));
  }
  if (metadata.filterSummary) {
    lines.push(sanitizeCsvCell(`Kriteria Filter: ${metadata.filterSummary}`));
  }
  if (metadata.title || metadata.generatedAt || metadata.filterSummary) {
    lines.push(''); // Blank separator line
  }

  // 2. Column Headers
  const headerLine = headers.map(h => sanitizeCsvCell(h)).join(',');
  lines.push(headerLine);

  // 3. Data Rows
  rows.forEach(row => {
    const rowLine = row.map(cell => sanitizeCsvCell(cell)).join(',');
    lines.push(rowLine);
  });

  // 4. Combine with UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats date into Indonesian locale standard: e.g. "15 Nov 2026" or "15 Nov 2026, 14:30"
 */
export function formatIndonesianDate(dateInput, includeTime = false) {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);

    const options = {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };

    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }

    return d.toLocaleDateString('id-ID', options);
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats integer or float into Indonesian thousands-separated string (e.g. 1.250)
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('id-ID');
}

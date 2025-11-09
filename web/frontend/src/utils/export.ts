import type { PredictionRow } from '../types/inference';

/**
 * Export data to CSV format
 */
export function exportToCSV(data: PredictionRow[], filename: string = 'anomaly_results.csv') {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build headers from the first row
  const row = data[0];
  const headers = [
    'row_index',
    'prediction',
    'score',
    ...Object.keys(row.data || {})
  ];

  // Build CSV content
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => {
      const values = [
        row.row_index,
        `"${row.prediction}"`,
        row.score !== undefined ? row.score : '',
        ...headers.slice(3).map(key => {
          const value = row.data?.[key];
          if (value === null || value === undefined) return '';
          // Escape quotes and wrap in quotes if contains comma or quote
          const strValue = String(value);
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        })
      ];
      return values.join(',');
    })
  ];

  const csvContent = csvRows.join('\n');
  downloadFile(csvContent, filename, 'text/csv');
}

/**
 * Export chart as PNG image
 */
export function exportChartAsPNG(
  canvasElement: HTMLCanvasElement | null,
  filename: string = 'chart.png'
) {
  if (!canvasElement) {
    alert('Chart not available for export');
    return;
  }

  canvasElement.toBlob((blob) => {
    if (!blob) {
      alert('Failed to export chart');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Export SVG chart as PNG
 */
export function exportSVGAsPNG(
  svgElement: SVGSVGElement | null,
  filename: string = 'chart.png',
  scale: number = 2
) {
  if (!svgElement) {
    alert('Chart not available for export');
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Failed to export chart');
        return;
      }
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(pngUrl);
    });
  };

  img.src = url;
}

/**
 * Download file helper
 */
function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export summary statistics as JSON
 */
export function exportStats(stats: Record<string, any>, filename: string = 'statistics.json') {
  const jsonContent = JSON.stringify(stats, null, 2);
  downloadFile(jsonContent, filename, 'application/json');
}


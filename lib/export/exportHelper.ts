import { LayoutData } from '@/types';
import { generateDrawioXml } from '@/lib/xml/drawioGenerator';

export function downloadFile(content: string | Blob, filename: string, mimeType: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToDrawio(
  layoutData: LayoutData,
  filename: string = 'database.drawio',
  attrPositions?: { [key: string]: { angle: number; radius: number } }
) {
  const xml = generateDrawioXml(layoutData, attrPositions);
  downloadFile(xml, filename, 'application/xml');
}

export function exportToXml(
  layoutData: LayoutData,
  filename: string = 'database.xml',
  attrPositions?: { [key: string]: { angle: number; radius: number } }
) {
  const xml = generateDrawioXml(layoutData, attrPositions);
  downloadFile(xml, filename, 'text/xml');
}

export function exportToSvg(svgElement: SVGSVGElement, filename: string = 'database.svg') {
  // Clone the SVG element so we can clean it up for download
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  
  // Ensure correct XML namespaces
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  // Convert styles or attributes if needed
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  
  downloadFile(svgBlob, filename, 'image/svg+xml');
}

export function exportToPng(svgElement: SVGSVGElement, filename: string = 'database.png') {
  // Create a clone to modify styles
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  // Get SVG content size and padding
  const bbox = svgElement.getBBox();
  const padding = 30;
  const width = (bbox.width || 800) + padding * 2;
  const height = (bbox.height || 600) + padding * 2;
  
  // Adjust viewBox and size of the clone
  svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
  svgClone.setAttribute('width', width.toString());
  svgClone.setAttribute('height', height.toString());
  
  // Add dark background matching our preview area
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    svg { background-color: #0f172a; }
  `;
  svgClone.insertBefore(style, svgClone.firstChild);

  const svgString = new XMLSerializer().serializeToString(svgClone);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const img = new Image();
  // Encode SVG string to base64 to avoid URL character issues
  const base64Svg = btoa(unescape(encodeURIComponent(svgString)));
  const url = `data:image/svg+xml;base64,${base64Svg}`;
  
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadFile(blob, filename, 'image/png');
      }
    }, 'image/png');
  };
  
  img.src = url;
}

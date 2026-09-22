import { LayoutData } from "@/types";
import { generateDrawioXml } from "@/lib/xml/drawioGenerator";

export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string,
) {
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: mimeType })
      : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToDrawio(
  layoutData: LayoutData,
  filename: string = "database.drawio",
  attrPositions?: { [key: string]: { angle: number; radius: number } },
) {
  const xml = generateDrawioXml(layoutData, attrPositions);
  downloadFile(xml, filename, "application/xml");
}

export function exportToXml(
  layoutData: LayoutData,
  filename: string = "database.xml",
  attrPositions?: { [key: string]: { angle: number; radius: number } },
) {
  const xml = generateDrawioXml(layoutData, attrPositions);
  downloadFile(xml, filename, "text/xml");
}

export function exportToSvg(
  svgElement: SVGSVGElement,
  filename: string = "database.svg",
  options: ImageExportOptions = {},
) {
  const svgString = serializeImageSvg(
    svgElement,
    options.backgroundColor || "#ffffff",
    options.fontFamily || "Arial",
  );
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  downloadFile(svgBlob, filename, "image/svg+xml");
}

export interface ImageExportOptions {
  backgroundColor?: string;
  fontFamily?: string;
  width?: number;
}

export function exportToPng(
  svgElement: SVGSVGElement,
  filename: string = "database.png",
  options: ImageExportOptions = {},
) {
  const backgroundColor = options.backgroundColor || "#ffffff";
  const fontFamily = options.fontFamily || "Arial";
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const { width, height } = prepareImageSvg(
    svgClone,
    svgElement,
    backgroundColor,
    fontFamily,
  );
  svgClone.setAttribute("width", String(width));
  svgClone.setAttribute("height", String(height));
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const canvas = document.createElement("canvas");
  const outputWidth =
    options.width && options.width > 0 ? Math.round(options.width) : 1000;
  const outputHeight = Math.max(1, Math.round((height / width) * outputWidth));
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const base64Svg = btoa(unescape(encodeURIComponent(svgString)));
  const url = `data:image/svg+xml;base64,${base64Svg}`;
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadFile(blob, filename, "image/png");
      }
    }, "image/png");
  };

  img.src = url;
}

function serializeImageSvg(
  svgElement: SVGSVGElement,
  backgroundColor: string,
  fontFamily: string,
) {
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  prepareImageSvg(svgClone, svgElement, backgroundColor, fontFamily);
  return new XMLSerializer().serializeToString(svgClone);
}

function prepareImageSvg(
  svgClone: SVGSVGElement,
  sourceSvg: SVGSVGElement,
  backgroundColor: string,
  fontFamily: string,
) {
  const bbox = sourceSvg.getBBox();
  const padding = 30;
  const width = (bbox.width || 800) + padding * 2;
  const height = (bbox.height || 600) + padding * 2;
  svgClone.setAttribute(
    "viewBox",
    `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`,
  );
  svgClone.style.backgroundColor = backgroundColor;
  const safeFontFamily = fontFamily.replace(/["\\;]/g, "");

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    text, tspan { fill: ${backgroundColor === "#000000" ? "#ffffff" : "#111111"} !important; font-family: "${safeFontFamily}" !important; }
    path, line, polyline, polygon, rect, circle, ellipse { stroke: ${backgroundColor === "#000000" ? "#ffffff" : "#111111"} !important; }
    rect, circle, ellipse, polygon { fill: ${backgroundColor} !important; }
    .diagram-rel-hit-zone { display: none !important; }
    .diagram-rel-line { stroke-width: 1.5 !important; }
    .diagram-rel-line--active { stroke-width: 2 !important; }
  `;
  svgClone.insertBefore(style, svgClone.firstChild);
  return { width, height };
}

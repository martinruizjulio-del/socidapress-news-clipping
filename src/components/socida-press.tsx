import { type PointerEvent as ReactPointerEvent, useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Newspaper, FileUp, Download, RotateCcw, Loader2 } from "lucide-react";

// Tipos internos
interface ExtractedImage {
  id: string;
  page: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface ExtractedTextBlock {
  id: string;
  page: number;
  titulo?: string;
  fecha?: string;
  hora?: string;
  text: string;
}


interface Metadata {
  periodico: string;
  titulo: string;
  fecha: string;
  hora: string;
}

type Stage = "form" | "region" | "processing" | "select" | "done";

// Imagen completa de una página + (opcional) recorte de la zona marcada.
// Sirve como "prueba visual" que acompaña a los bloques extraídos.
interface PageImage {
  page: number;
  fullDataUrl: string;
  cropDataUrl?: string;
}

// Rectángulo de recorte en coordenadas de usuario del PDF (mismo espacio que
// los items de texto nativos y el viewBox de pdfjs).
type PdfRect = { xMin: number; xMax: number; yMin: number; yMax: number };

// Miniatura de página + info de viewport necesaria para mapear coordenadas
// pantalla <-> PDF y aplicar el recorte durante el procesado.
interface PageThumb {
  page: number;
  dataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  viewBox: [number, number, number, number];
}

// Convierte un ImageData / canvas a dataURL webp
function canvasToWebp(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/webp", 0.92);
}

// Renderiza una imagen de pdfjs a dataURL
function pdfImageToDataUrl(img: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  kind?: number;
}): string | null {
  try {
    const { width, height, data, kind } = img;
    if (!width || !height || !data) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    const dst = imageData.data;
    if (kind === 1) {
      for (let i = 0, j = 0; i < data.length; i++, j += 4) {
        dst[j] = data[i];
        dst[j + 1] = data[i];
        dst[j + 2] = data[i];
        dst[j + 3] = 255;
      }
    } else if (kind === 2 || data.length === width * height * 3) {
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        dst[j] = data[i];
        dst[j + 1] = data[i + 1];
        dst[j + 2] = data[i + 2];
        dst[j + 3] = 255;
      }
    } else {
      dst.set(data);
    }
    ctx.putImageData(imageData, 0, 0);
    return canvasToWebp(canvas);
  } catch {
    return null;
  }
}

// Meses en español para reconocer fechas escritas con letras
const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

// Periódicos permitidos (orden por prioridad de detección: primero los que no
// generan falsos positivos; "AS" al final por ser una palabra muy corta).
const PERIODICOS_CONOCIDOS = ["Superdeporte", "Marca", "Sport", "AS"] as const;

// Detecta el periódico buscando su nombre en el texto completo de la página.
// Prioriza coincidencias con "DIARIO <X>" y exige límites de palabra.
function detectarPeriodico(fullText: string): string {
  const t = fullText;
  for (const nombre of PERIODICOS_CONOCIDOS) {
    const reDiario = new RegExp(`DIARIO\\s+${nombre}`, "i");
    if (reDiario.test(t)) return nombre;
  }
  for (const nombre of PERIODICOS_CONOCIDOS) {
    // Límite razonable: no debe formar parte de otra palabra
    const re = new RegExp(`(^|[^A-Za-zÁÉÍÓÚÑ])${nombre}([^A-Za-zÁÉÍÓÚÑ]|$)`, "i");
    if (re.test(t)) return nombre;
  }
  return "";
}

// Intenta extraer periódico, título, fecha y hora del texto de la página.
// `titleFromFont` es el título detectado por tamaño de fuente (más fiable).
function extraerMetadatos(
  fullText: string,
  titleFromFont: string,
): Metadata {
  const md: Metadata = { periodico: "", titulo: "", fecha: "", hora: "" };

  md.periodico = detectarPeriodico(fullText);
  md.titulo = titleFromFont.trim();

  // Fecha: dd/mm/yyyy o dd-mm-yyyy
  const mNum = fullText.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (mNum) {
    const d = mNum[1].padStart(2, "0");
    const m = mNum[2].padStart(2, "0");
    let y = mNum[3];
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
    md.fecha = `${y}-${m}-${d}`;
  }
  if (!md.fecha) {
    // "12 de marzo de 2024"
    const re = new RegExp(
      `\\b(\\d{1,2})\\s+de\\s+(${Object.keys(MESES).join("|")})\\s+de\\s+(\\d{4})\\b`,
      "i",
    );
    const mTxt = fullText.match(re);
    if (mTxt) {
      const d = mTxt[1].padStart(2, "0");
      const m = MESES[mTxt[2].toLowerCase()];
      const y = mTxt[3];
      md.fecha = `${y}-${m}-${d}`;
    }
  }

  // Hora: HH:MM (24h o con h)
  const mHora = fullText.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/);
  if (mHora) {
    md.hora = `${mHora[1].padStart(2, "0")}:${mHora[2]}`;
  }

  return md;
}

// Heurística para descartar bloques que son maquetación en lugar de cuerpo:
// firmas ("AS / MADRID", "PEPE ANDRES / DIARIO AS"), cabeceras de sección
// ("Baloncesto", "hípica"), páginas ("DM6"), etiquetas en mayúsculas,
// pies de foto muy cortos, etc.
function esRuidoMaquetacion(texto: string): boolean {
  const s = texto.trim();
  if (!s) return true;
  if (s.length < 60) return true; // fragmentos cortos: cabeceras, pies, folios
  const primeraLinea = s.split(/\r?\n/)[0].trim();
  // Firmas tipo "NOMBRE APELLIDO / CIUDAD" o "AS / MADRID"
  if (/^[A-ZÁÉÍÓÚÑ0-9 .·-]{2,}\s*\/\s*[A-ZÁÉÍÓÚÑ0-9 .·-]{2,}\s*$/.test(primeraLinea)) {
    return true;
  }
  // Todo el bloque en mayúsculas -> titular o antetítulo de maquetación
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letras.length > 0) {
    const mays = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
    if (mays / letras.length > 0.85) return true;
  }
  // Menciones a los periódicos como créditos ("DIARIO AS", "MARCA / MADRID")
  if (/DIARIO\s+(AS|MARCA|SPORT|SUPERDEPORTE)/i.test(s) && s.length < 120) {
    return true;
  }
  return false;
}

// Filtros a nivel de línea: firmas, folios, cabeceras de sección,
// créditos fotográficos y letras capitulares que la maquetación coloca
// como items independientes en el PDF y contaminarían el cuerpo.
function esLineaRuido(texto: string): boolean {
  const s = texto.trim();
  if (!s) return true;
  // Folio de página tipo "DM6", "AS12", "M3"
  if (/^[A-Z]{1,3}\s?\d{1,4}$/.test(s)) return true;
  // Firma de autor: "NOMBRE APELLIDO / CIUDAD" o "AS / MADRID"
  if (/^[A-ZÁÉÍÓÚÑ0-9.·\- ]{2,}\s*\/\s*[A-ZÁÉÍÓÚÑ0-9.·\- ]{2,}$/.test(s)) return true;
  // Créditos fotográficos: "PEPE ANDRES / DIARIO AS", "COMUNIDAD DE MADRID"
  if (/DIARIO\s+(AS|MARCA|SPORT|SUPERDEPORTE)/i.test(s) && s.length < 60) return true;
  // Todo en mayúsculas y corto -> antetítulo/kicker/sección
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letras.length >= 2) {
    const mays = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
    if (mays / letras.length > 0.85 && s.length < 80) return true;
  }
  return false;
}

// Nombre de sección corto ("Baloncesto", "hípica", "Madrid") sin puntuación.
function esEtiquetaSeccion(texto: string): boolean {
  const s = texto.trim();
  if (s.length > 30) return false;
  if (!/^[A-Za-zÁÉÍÓÚÑñáéíóú ]+$/.test(s)) return false;
  return s.split(/\s+/).length <= 3;
}


// Limpia texto (OCR o nativo) eliminando caracteres extraños,
// símbolos sueltos, guiones de fin de línea y espacios repetidos.
function limpiarTexto(texto: string): string {
  let s = texto;
  // Elimina caracteres de control invisibles
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "");
  // Elimina reemplazos, guiones opcionales y marcas de dirección
  s = s.replace(/[\uFFFD\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "");
  // Une marcas combinantes con la letra anterior aunque pdf.js las emita
  // separadas por un espacio (ej. "n \u0303" -> "ñ" tras NFC).
  s = s.replace(/(\p{L})\s+(\p{M})/gu, "$1$2");
  // Ahora sí normaliza a NFC para componer letra + diacrítico -> ñ, á, é...
  s = s.normalize("NFC");
  // Comillas tipográficas y guiones largos -> ASCII
  s = s.replace(/[“”«»„]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/[–—―]/g, "-");
  // Puntos suspensivos tipográficos
  s = s.replace(/…/g, "...");
  // Guiones de palabras partidas por columnas / fin de línea
  s = s.replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2");
  // Une saltos de línea internos de un mismo párrafo (no dobles)
  s = s.replace(/([^\n])\n(?!\n)/g, "$1 ");
  // Whitelist ampliada: incluye marcas combinantes por si quedara alguna.
  s = s.replace(/[^\p{L}\p{M}\p{N}\s.,;:!¡¿?()"'%€$£ºª&/\-\n]/gu, " ");

  // Colapsa espacios
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\s+([.,;:!?])/g, "$1");
  s = s.replace(/\n{3,}/g, "\n\n");
  // Elimina líneas con muy pocas letras o dominadas por ruido no alfabético
  s = s
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      const letras = t.replace(/[^\p{L}]/gu, "").length;
      if (letras < 4) return false;
      // ratio letras/total razonable
      if (letras / t.length < 0.55) return false;
      return true;
    })
    .join("\n");
  // Palabras de una sola letra sueltas (excepto a, o, y, e, u)
  // Palabras de una sola letra sueltas (excepto a, o, y, e, u). Usamos
  // lookarounds Unicode porque \b en JS ignora los acentos y borraría
  // ñ/á/é interiores de palabras como "años" o "después".
  s = s
    .replace(
      /(?<![\p{L}\p{N}_])(?![aAoOyYeEuUiI](?![\p{L}\p{N}_]))[\p{L}](?![\p{L}\p{N}_])/gu,
      "",
    )
    .replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

// Item del PDF con posición y tamaño ya normalizados.
type NativeItem = {
  str: string;
  x: number;
  y: number;
  size: number;
  hasEOL: boolean;
};

// Agrupa items del PDF en bloques de noticia. Cada noticia (delimitada por
// un titular grande) forma UN bloque aunque su cuerpo esté maquetado en
// varias columnas dentro del mismo recuadro. Devuelve además fecha y hora
// detectadas dentro de cada bloque cuando aparecen.
function extraerBloquesNativos(
  items: NativeItem[],
): { titulo?: string; text: string; fecha?: string; hora?: string }[] {
  if (!items.length) return [];

  const sizes = items.map((i) => i.size).filter((s) => s > 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 10;

  // 1) Construcción de líneas: recorremos los items en orden natural
  //    (por y descendente, x ascendente) y unimos los que van seguidos en
  //    la misma línea horizontal con el mismo tamaño de fuente.
  type Linea = { x: number; xEnd: number; y: number; size: number; text: string };
  const yTol = median * 0.5;
  const ordenados = [...items]
    .filter((i) => i.str.trim() || i.hasEOL)
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lineas: Linea[] = [];
  for (const it of ordenados) {
    const str = it.str;
    if (!str) continue;
    const last = lineas[lineas.length - 1];
    const anchoAprox = it.size * str.length * 0.5;
    if (
      last &&
      Math.abs(last.y - it.y) <= yTol &&
      Math.abs(last.size - it.size) < 1 &&
      it.x >= last.xEnd - 5 &&
      it.x <= last.xEnd + 50
    ) {
      last.text += (last.text.endsWith(" ") || str.startsWith(" ") ? "" : " ") + str;
      last.xEnd = it.x + anchoAprox;
    } else {
      lineas.push({ x: it.x, xEnd: it.x + anchoAprox, y: it.y, size: it.size, text: str });
    }
  }

  // Detecta letras capitulares (drop caps): un solo carácter con tamaño
  // enorme. Antes de descartarlas, las fusionamos con la línea contigua
  // a su derecha para no perder la primera letra del cuerpo ("D" + "el 19…").
  const capitulares = lineas.filter(
    (l) => l.text.trim().length <= 2 && l.size >= median * 2.5,
  );
  const capSet = new Set(capitulares);
  for (const dc of capitulares) {
    const letra = dc.text.trim();
    const destino = lineas.find(
      (l) =>
        !capSet.has(l) &&
        l.x >= dc.x - 5 &&
        l.x <= dc.xEnd + dc.size * 2 &&
        Math.abs(l.y - dc.y) < dc.size,
    );
    if (destino) destino.text = letra + destino.text;
  }

  const limpias = lineas
    .filter((l) => !capSet.has(l))
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text.length > 0);


  // 2) Identificar titulares principales (fuente muy grande) y "decks"
  //    o subtítulos (fuente intermedia). Después agrupamos cada titular
  //    con las líneas grandes/intermedias contiguas por debajo, para que
  //    títulos multilínea y subtítulos formen un único bloque.
  const esHeadline = (l: Linea) =>
    l.size >= median * 1.8 &&
    l.text.length >= 8 &&
    l.text.length < 200 &&
    l.text.split(/\s+/).length >= 2 &&
    l.text.split(/\s+/).length <= 25 &&
    !esLineaRuido(l.text) &&
    !esEtiquetaSeccion(l.text);

  const esSubtitular = (l: Linea) =>
    l.size >= median * 1.3 &&
    l.size < median * 1.8 &&
    l.text.length >= 15 &&
    !esLineaRuido(l.text);

  const porYDesc = (a: Linea, b: Linea) => b.y - a.y;

  // Semillas: titulares principales ordenados de arriba abajo.
  const semillas = limpias.filter(esHeadline).sort(porYDesc);

  type Articulo = {
    headlineTop: number;
    headlineBottom: number;
    xLeft: number;
    xRight: number;
    titulo: string;
  };
  const articulos: Articulo[] = [];

  // Ampliamos cada semilla con las líneas cercanas por debajo cuyo tamaño
  // sea igual (títulos multilínea) o intermedio (deck/subtítulo). Nos
  // detenemos al llegar a texto de cuerpo o a otro titular principal.
  const consumidas = new Set<Linea>();
  for (const seed of semillas) {
    if (consumidas.has(seed)) continue;
    const cluster: Linea[] = [seed];
    consumidas.add(seed);
    const debajo = limpias
      .filter((l) => !consumidas.has(l) && l.y < seed.y)
      .sort(porYDesc);
    let yRef = seed.y;
    for (const l of debajo) {
      const gap = yRef - l.y;
      if (gap > Math.max(seed.size, l.size) * 2.5) break;
      if (esHeadline(l) && Math.abs(l.size - seed.size) > seed.size * 0.15) break;
      const mismaFuente = Math.abs(l.size - seed.size) <= seed.size * 0.15;
      if (mismaFuente || esSubtitular(l)) {
        cluster.push(l);
        consumidas.add(l);
        yRef = l.y;
        continue;
      }
      break;
    }
    const top = Math.max(...cluster.map((l) => l.y));
    const bottom = Math.min(...cluster.map((l) => l.y));
    const xLeft = Math.min(...cluster.map((l) => l.x));
    const xRight = Math.max(...cluster.map((l) => l.xEnd));
    const titulo = cluster
      .sort(porYDesc)
      .map((l) => l.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    articulos.push({
      headlineTop: top,
      headlineBottom: bottom,
      xLeft,
      xRight,
      titulo,
    });
  }

  articulos.sort((a, b) => b.headlineTop - a.headlineTop);

  // Si no hay titulares detectados, tratamos toda la página como un bloque.
  if (articulos.length === 0) {
    const raw = limpias
      .sort((a, b) => (b.y - a.y) || (a.x - b.x))
      .map((l) => l.text)
      .join("\n");
    const limpio = limpiarTexto(raw);
    if (limpio.length > 40 && !esRuidoMaquetacion(limpio)) {
      const meta = extraerMetadatos(limpio, "");
      return [{ text: limpio, fecha: meta.fecha || undefined, hora: meta.hora || undefined }];
    }
    return [];
  }

  // 3) Para cada noticia, calculamos su "caja" de cuerpo: se extiende desde
  //    debajo del titular hasta el siguiente titular cuyo rango horizontal
  //    solape con el nuestro (esa es la frontera vertical real dentro del
  //    recuadro). Sólo se aceptan líneas cuyo tamaño sea coherente con el
  //    cuerpo (median ± 20%) y cuyo centro X caiga dentro del rango
  //    horizontal del titular; así evitamos absorber columnas de otras
  //    noticias, pies de foto pequeños o destacados grandes.
  const tolX = median * 2;
  const solapa = (a: Articulo, b: Articulo) =>
    !(a.xRight + tolX < b.xLeft || b.xRight + tolX < a.xLeft);

  const cuerpos: Linea[][] = articulos.map((art) => {
    let yTope = -Infinity;
    for (const otro of articulos) {
      if (otro === art) continue;
      if (otro.headlineTop >= art.headlineBottom) continue; // está por encima
      if (!solapa(art, otro)) continue;
      if (otro.headlineTop > yTope) yTope = otro.headlineTop;
    }
    const sizeMin = median * 0.85;
    const sizeMax = median * 1.2;
    return limpias.filter((l) => {
      if (consumidas.has(l)) return false;
      if (esHeadline(l)) return false;
      if (esLineaRuido(l.text)) return false;
      if (esEtiquetaSeccion(l.text) && l.size <= median * 1.3) return false;
      if (l.size < sizeMin || l.size > sizeMax) return false;
      if (l.y >= art.headlineBottom) return false;
      if (l.y <= yTope) return false;
      const cx = (l.x + l.xEnd) / 2;
      if (cx < art.xLeft - tolX || cx > art.xRight + tolX) return false;
      return true;
    });
  });

  // 4) Componer cada bloque respetando el orden de lectura: detectamos las
  //    columnas reales del artículo agrupando los x de sus propias líneas
  //    en clusters separados por huecos claros; después leemos columna por
  //    columna de izquierda a derecha, y dentro de cada una de arriba abajo.
  const bloques: { titulo?: string; text: string; fecha?: string; hora?: string }[] = [];
  for (let i = 0; i < articulos.length; i++) {
    const art = articulos[i];
    const lineasCuerpo = cuerpos[i];
    if (!lineasCuerpo.length) continue;

    const xs = [...lineasCuerpo.map((l) => l.x)].sort((a, b) => a - b);
    const gapCol = median * 3; // hueco mínimo entre columnas
    const colStarts: number[] = [];
    for (const x of xs) {
      if (!colStarts.length || x - colStarts[colStarts.length - 1] > gapCol) {
        colStarts.push(x);
      }
    }
    const colIndex = (x: number) => {
      let idx = 0;
      for (let k = 0; k < colStarts.length; k++) {
        if (x >= colStarts[k] - median) idx = k;
      }
      return idx;
    };

    lineasCuerpo.sort((a, b) => {
      const ca = colIndex(a.x);
      const cb = colIndex(b.x);
      if (ca !== cb) return ca - cb;
      return b.y - a.y;
    });
    const raw = lineasCuerpo.map((l) => l.text).join("\n");
    const limpio = limpiarTexto(raw);

    if (limpio.length < 40 || esRuidoMaquetacion(limpio)) continue;
    const meta = extraerMetadatos(`${limpio}\n${art.titulo}`, "");
    bloques.push({
      titulo: art.titulo.replace(/\s+/g, " ").trim(),
      text: limpio,
      fecha: meta.fecha || undefined,
      hora: meta.hora || undefined,
    });
  }







  return bloques;
}

// Selector de zona sobre la miniatura de una página. Convierte las
// coordenadas del ratón (en píxeles del <img>) a coordenadas de usuario del
// PDF (mismo espacio que los items nativos), para que el filtrado sea preciso
// sea cual sea el tamaño al que se muestre la miniatura.
function RegionPicker({
  thumb,
  rect,
  onChange,
}: {
  thumb: PageThumb;
  rect: PdfRect | undefined;
  onChange: (rect: PdfRect | undefined) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const [vx0, vy0, vx1, vy1] = thumb.viewBox;
  const pdfW = vx1 - vx0;
  const pdfH = vy1 - vy0;

  const toPdf = (px: number, py: number, w: number, h: number): { x: number; y: number } => ({
    x: vx0 + (px / w) * pdfW,
    y: vy1 - (py / h) * pdfH,
  });

  const toPct = (r: PdfRect) => ({
    left: `${((r.xMin - vx0) / pdfW) * 100}%`,
    top: `${((vy1 - r.yMax) / pdfH) * 100}%`,
    width: `${((r.xMax - r.xMin) / pdfW) * 100}%`,
    height: `${((r.yMax - r.yMin) / pdfH) * 100}%`,
  });

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const b = el.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const el = containerRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    setDrag({ ...drag, x1: e.clientX - b.left, y1: e.clientY - b.top });
  };
  const onUp = () => {
    if (!drag) return;
    const el = containerRef.current;
    if (!el) {
      setDrag(null);
      return;
    }
    const b = el.getBoundingClientRect();
    const x0 = Math.max(0, Math.min(drag.x0, drag.x1));
    const y0 = Math.max(0, Math.min(drag.y0, drag.y1));
    const x1 = Math.min(b.width, Math.max(drag.x0, drag.x1));
    const y1 = Math.min(b.height, Math.max(drag.y0, drag.y1));
    setDrag(null);
    if (x1 - x0 < 10 || y1 - y0 < 10) return;
    const a = toPdf(x0, y0, b.width, b.height);
    const c = toPdf(x1, y1, b.width, b.height);
    onChange({
      xMin: Math.min(a.x, c.x),
      xMax: Math.max(a.x, c.x),
      yMin: Math.min(a.y, c.y),
      yMax: Math.max(a.y, c.y),
    });
  };

  const overlay = drag
    ? {
        left: Math.min(drag.x0, drag.x1),
        top: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Página {thumb.page}</p>
        {rect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
          >
            Limpiar zona
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative inline-block max-w-full cursor-crosshair select-none rounded border bg-muted"
        style={{ touchAction: "none" }}
      >
        <img
          src={thumb.dataUrl}
          alt={`Página ${thumb.page}`}
          className="block max-w-full h-auto pointer-events-none"
          draggable={false}
          loading="lazy"
        />
        {rect && !drag && (
          <div
            className="pointer-events-none absolute border-2 border-primary bg-primary/15"
            style={toPct(rect)}
          />
        )}
        {overlay && (
          <div
            className="pointer-events-none absolute border-2 border-primary/70 bg-primary/10"
            style={overlay}
          />
        )}
      </div>
    </div>
  );
}





export default function SocidaPressApp() {
  const [stage, setStage] = useState<Stage>("form");
  const [metadata, setMetadata] = useState<Metadata>({
    periodico: "",
    titulo: "",
    fecha: "",
    hora: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [textBlocks, setTextBlocks] = useState<ExtractedTextBlock[]>([]);
  const [selectedImgIds, setSelectedImgIds] = useState<Set<string>>(new Set());
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [pageImages, setPageImages] = useState<PageImage[]>([]);
  const [regions, setRegions] = useState<Record<number, PdfRect>>({});
  const pdfRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setStage("form");
    setFile(null);
    setImages([]);
    setTextBlocks([]);
    setSelectedImgIds(new Set());
    setSelectedTextIds(new Set());
    setMetadata({ periodico: "", titulo: "", fecha: "", hora: "" });
    setProgress(0);
    setProgressLabel("");
    setThumbs([]);
    setPageImages([]);
    setRegions({});
    pdfRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Carga el PDF, genera miniaturas y lleva al paso de selección de zona.
  const loadPdfForRegion = useCallback(async () => {
    if (!file) return;
    setStage("processing");
    setProgress(5);
    setProgressLabel("Cargando PDF…");
    try {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
        .default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      pdfRef.current = pdf;
      const nuevas: PageThumb[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        setProgressLabel(`Preparando página ${p} de ${pdf.numPages}…`);
        setProgress(10 + Math.round((p / pdf.numPages) * 80));
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.3 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        nuevas.push({
          page: p,
          dataUrl: canvas.toDataURL("image/webp", 0.85),
          canvasWidth: vp.width,
          canvasHeight: vp.height,
          viewBox: vp.viewBox as [number, number, number, number],
        });
      }
      setThumbs(nuevas);
      setRegions({});
      setProgress(100);
      setStage("region");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se ha podido cargar el PDF: ${msg}`);
      setStage("form");
    }
  }, [file]);



  const processPdf = useCallback(async () => {
    if (!file) return;
    setStage("processing");
    setProgress(2);
    setProgressLabel("Cargando librerías…");

    try {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
        .default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      setProgressLabel("Leyendo PDF…");
      // Reutilizamos el documento ya cargado en el paso de "zona" si existe.
      type PdfDocLike = {
        numPages: number;
        getPage: (n: number) => Promise<unknown>;
      };
      const pdf: PdfDocLike =
        (pdfRef.current as PdfDocLike | null) ??
        (await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise);
      pdfRef.current = pdf;
      const numPages = pdf.numPages;

      const foundImages: ExtractedImage[] = [];
      const pageCanvases: { page: number; canvas: HTMLCanvasElement; rectPx?: { x: number; y: number; w: number; h: number } }[] = [];
      const nativePageTexts: { page: number; text: string }[] = [];
      const nativePageItems: { page: number; items: NativeItem[] }[] = [];
      let tituloDetectado = "";


      // 1) Render + extracción de imágenes por página
      for (let p = 1; p <= numPages; p++) {
        setProgressLabel(`Analizando página ${p} de ${numPages}…`);
        setProgress(5 + Math.round(((p - 1) / numPages) * 40));

        const page = (await pdf.getPage(p)) as {
          getViewport: (o: { scale: number }) => {
            width: number;
            height: number;
            viewBox: number[];
          };
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
          getTextContent: () => Promise<{ items: unknown[] }>;
          getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
          objs: { get: (n: string, cb: (o: unknown) => void) => void };
        };
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Si el usuario ha marcado una zona para esta página, calculamos el
        // rectángulo equivalente en píxeles del canvas para poder recortar
        // el OCR más adelante.
        const rectPdf = regions[p];
        let rectPx: { x: number; y: number; w: number; h: number } | undefined;
        if (rectPdf) {
          const [vx0, vy0, vx1, vy1] = viewport.viewBox as [number, number, number, number];
          const pdfW = vx1 - vx0;
          const pdfH = vy1 - vy0;
          const sx = canvas.width / pdfW;
          const sy = canvas.height / pdfH;
          const x = (rectPdf.xMin - vx0) * sx;
          const w = (rectPdf.xMax - rectPdf.xMin) * sx;
          // Coordenada Y del PDF es ascendente; en canvas es descendente.
          const y = (vy1 - rectPdf.yMax) * sy;
          const h = (rectPdf.yMax - rectPdf.yMin) * sy;
          rectPx = { x, y, w, h };
        }
        pageCanvases.push({ page: p, canvas, rectPx });


        // Extraer texto nativo del PDF (mucho más fiable que OCR).
        try {
          const tc = await page.getTextContent();
          type TItem = { str: string; height?: number; transform?: number[]; hasEOL?: boolean };
          const rawItems = (tc.items as unknown[]).filter(
            (it): it is TItem => !!it && typeof (it as TItem).str === "string",
          );
          const nItems: NativeItem[] = rawItems.map((it) => {
            const tr = it.transform || [0, 0, 0, 0, 0, 0];
            return {
              str: it.str,
              x: tr[4] || 0,
              y: tr[5] || 0,
              size: it.height ?? Math.abs(tr[3] || 0),
              hasEOL: !!it.hasEOL,
            };
          });
          // Si hay zona marcada para esta página, nos quedamos sólo con los
          // items cuyo origen cae dentro del rectángulo definido por el usuario.
          const rectPdf = regions[p];
          const nItemsFiltrados = rectPdf
            ? nItems.filter(
                (it) =>
                  it.x >= rectPdf.xMin &&
                  it.x <= rectPdf.xMax &&
                  it.y >= rectPdf.yMin &&
                  it.y <= rectPdf.yMax,
              )
            : nItems;
          nativePageItems.push({ page: p, items: nItemsFiltrados });






          const pageStr = rawItems
            .map((it) => it.str + (it.hasEOL ? "\n" : " "))
            .join("")
            .replace(/[ \t]+\n/g, "\n")
            .trim();
          nativePageTexts.push({ page: p, text: pageStr });

          if (p === 1 && nItems.length) {
            // Título: los items con mayor altura de fuente
            const withSize = nItems
              .map((it) => ({ str: it.str.trim(), size: it.size }))
              .filter((x) => x.str.length > 0);
            if (withSize.length) {
              const maxSize = withSize.reduce((m, x) => Math.max(m, x.size), 0);
              const umbral = maxSize * 0.9;
              const tituloItems = withSize.filter((x) => x.size >= umbral);
              tituloDetectado = tituloItems.map((x) => x.str).join(" ").replace(/\s+/g, " ").trim();
            }
          }
        } catch {
          // sin capa de texto -> nos apoyaremos en el OCR
        }


        try {
          const opList = await page.getOperatorList();
          const OPS = pdfjs.OPS;
          const seen = new Set<string>();
          for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            if (
              fn === OPS.paintImageXObject ||
              fn === OPS.paintInlineImageXObject
            ) {
              const args = opList.argsArray[i];
              const name = args?.[0] as string | undefined;
              if (!name || seen.has(name)) continue;
              seen.add(name);
              try {
                const img: unknown = await new Promise((resolve) => {
                  try {
                    (page as unknown as {
                      objs: { get: (n: string, cb: (o: unknown) => void) => void };
                    }).objs.get(name, resolve);
                  } catch {
                    resolve(null);
                  }
                });
                if (img && typeof img === "object") {
                  const typed = img as {
                    data?: Uint8ClampedArray | Uint8Array;
                    width?: number;
                    height?: number;
                    kind?: number;
                    bitmap?: ImageBitmap;
                  };
                  if (typed.bitmap) {
                    const c = document.createElement("canvas");
                    c.width = typed.bitmap.width;
                    c.height = typed.bitmap.height;
                    const cx = c.getContext("2d");
                    if (cx) {
                      cx.drawImage(typed.bitmap, 0, 0);
                      if (c.width >= 80 && c.height >= 80) {
                        foundImages.push({
                          id: `img-${p}-${foundImages.length}`,
                          page: p,
                          dataUrl: canvasToWebp(c),
                          width: c.width,
                          height: c.height,
                        });
                      }
                    }
                  } else if (typed.data && typed.width && typed.height) {
                    if (typed.width < 80 || typed.height < 80) continue;
                    const url = pdfImageToDataUrl({
                      data: typed.data,
                      width: typed.width,
                      height: typed.height,
                      kind: typed.kind,
                    });
                    if (url) {
                      foundImages.push({
                        id: `img-${p}-${foundImages.length}`,
                        page: p,
                        dataUrl: url,
                        width: typed.width,
                        height: typed.height,
                      });
                    }
                  }
                }
              } catch {
                // ignoramos imágenes que no podamos resolver
              }
            }
          }
        } catch {
          // sin lista de operaciones -> seguimos
        }
      }

      // Guardamos, por página, la imagen completa y (si hay zona marcada) el
      // recorte, para poder acompañar cada bloque con su prueba visual.
      const pageImgs: PageImage[] = pageCanvases.map(({ page, canvas, rectPx }) => {
        const fullDataUrl = canvas.toDataURL("image/webp", 0.85);
        let cropDataUrl: string | undefined;
        if (rectPx && rectPx.w > 20 && rectPx.h > 20) {
          const c = document.createElement("canvas");
          c.width = Math.round(rectPx.w);
          c.height = Math.round(rectPx.h);
          const cctx = c.getContext("2d");
          if (cctx) {
            cctx.drawImage(canvas, rectPx.x, rectPx.y, rectPx.w, rectPx.h, 0, 0, c.width, c.height);
            cropDataUrl = c.toDataURL("image/webp", 0.85);
          }
        }
        return { page, fullDataUrl, cropDataUrl };
      });
      setPageImages(pageImgs);

      // 2) Construir bloques: preferimos texto nativo del PDF (limpio y con
      //    subtítulos por tamaño de fuente). Solo pasamos por OCR las páginas
      //    que no tengan capa de texto.
      const blocks: ExtractedTextBlock[] = [];
      const pagesText: { page: number; text: string }[] = [];
      const paginasSinTexto: { page: number; canvas: HTMLCanvasElement; rectPx?: { x: number; y: number; w: number; h: number } }[] = [];

      for (const { page, canvas, rectPx } of pageCanvases) {
        const nativa = nativePageItems.find((n) => n.page === page);
        if (nativa && nativa.items.length > 20) {
          const bloques = extraerBloquesNativos(nativa.items);
          bloques.forEach((b, i) => {
            blocks.push({
              id: `txt-${page}-${i}`,
              page,
              titulo: b.titulo,
              fecha: b.fecha,
              hora: b.hora,
              text: b.text,
            });
          });

        } else {
          paginasSinTexto.push({ page, canvas, rectPx });
        }
      }

      if (paginasSinTexto.length) {
        setProgressLabel("Preparando OCR…");
        setProgress(48);
        const tesseract = await import("tesseract.js");
        const worker = await tesseract.createWorker("spa", 1);
        for (let idx = 0; idx < paginasSinTexto.length; idx++) {
          const { page, canvas, rectPx } = paginasSinTexto[idx];
          setProgressLabel(`OCR página ${page} de ${numPages}…`);
          setProgress(50 + Math.round(((idx + 1) / paginasSinTexto.length) * 48));
          // Si hay zona marcada, recortamos el canvas para pasar sólo el
          // rectángulo al OCR (más rápido y sin ruido de otras noticias).
          let src: HTMLCanvasElement = canvas;
          if (rectPx && rectPx.w > 20 && rectPx.h > 20) {
            const c = document.createElement("canvas");
            c.width = Math.round(rectPx.w);
            c.height = Math.round(rectPx.h);
            const cctx = c.getContext("2d");
            if (cctx) {
              cctx.drawImage(canvas, rectPx.x, rectPx.y, rectPx.w, rectPx.h, 0, 0, c.width, c.height);
              src = c;
            }
          }
          const { data } = await worker.recognize(src);
          const raw = (data.text || "").trim();
          pagesText.push({ page, text: raw });
          if (!raw) continue;
          const chunks = raw
            .split(/\n\s*\n+/g)
            .map((s) => limpiarTexto(s))
            .filter((s) => s.length > 40 && !esRuidoMaquetacion(s));
          chunks.forEach((c, i) => {
            blocks.push({ id: `ocr-${page}-${i}`, page, text: c });
          });
        }
        await worker.terminate();
      } else {
        setProgress(96);
      }

      // 3) Extraer metadatos combinando texto nativo del PDF (más fiable)
      //    y, si no hubiera capa de texto, el resultado del OCR.
      const nativeFull = nativePageTexts.map((p) => p.text).join("\n");
      const ocrFull = pagesText.map((p) => p.text).join("\n");
      const meta = extraerMetadatos(
        `${nativeFull}\n${ocrFull}`,
        tituloDetectado,
      );
      // Si no se detecta fecha, la dejamos "por determinar".
      // Si no se detecta hora pero sí fecha, usamos la hora actual;
      // si tampoco hay fecha, la hora queda "por determinar".
      if (!meta.fecha) {
        meta.fecha = "por determinar";
        if (!meta.hora) meta.hora = "por determinar";
      } else if (!meta.hora) {
        meta.hora = new Date().toTimeString().slice(0, 5);
      }
      setMetadata(meta);



      setProgress(100);
      setProgressLabel("Listo");
      setImages(foundImages);
      setTextBlocks(blocks);
      setSelectedImgIds(new Set(foundImages.map((i) => i.id)));
      setSelectedTextIds(new Set(blocks.map((b) => b.id)));

      if (foundImages.length === 0 && blocks.length === 0) {
        toast.warning("No se ha extraído contenido del PDF.");
      } else {
        toast.success("Datos extraídos. Revisa y ajusta si es necesario.");
      }
      setStage("select");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error procesando el PDF: ${msg}`);
      setStage("form");
    }
  }, [file, regions]);

  const toggleImg = (id: string) => {
    setSelectedImgIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleTxt = (id: string) => {
    setSelectedTextIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const finalImages = useMemo(
    () => images.filter((i) => selectedImgIds.has(i.id)),
    [images, selectedImgIds],
  );
  const finalTexts = useMemo(
    () => textBlocks.filter((b) => selectedTextIds.has(b.id)),
    [textBlocks, selectedTextIds],
  );

  const canFinish =
    metadata.periodico.trim() &&
    metadata.titulo.trim() &&
    metadata.fecha &&
    metadata.hora;

  const handleFinish = () => {
    if (!canFinish) {
      toast.error("Revisa periódico, título, fecha y hora antes de guardar.");
      return;
    }
    setStage("done");
    toast.success("Noticia guardada correctamente.");
  };

  const handleExport = () => {
    const payload = {
      periodico: metadata.periodico,
      titulo: metadata.titulo,
      fecha: metadata.fecha,
      hora: metadata.hora,
      bloques: finalTexts.map((t) => ({
        titulo: t.titulo ?? "",
        fecha: t.fecha ?? "",
        hora: t.hora ?? "",
        texto: t.text,
      })),

      imagenes: finalImages.map((i) => ({
        pagina: i.page,
        ancho: i.width,
        alto: i.height,
        dataUrl: i.dataUrl,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${metadata.periodico}-${metadata.titulo}`
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 80) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Newspaper className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SocidaPress</h1>
            <p className="text-xs text-muted-foreground">
              Importa noticias en PDF, extrae imágenes y texto por OCR
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {stage === "form" && (
          <Card>
            <CardHeader>
              <CardTitle>Nueva noticia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="pdf">Archivo PDF de la noticia</Label>
                <Input
                  id="pdf"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    Seleccionado: {file.name} (
                    {(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Sube el PDF y en el siguiente paso podrás marcar sobre cada
                  página la zona exacta que quieres escanear (opcional). Después
                  SocidaPress detectará automáticamente el periódico, el título,
                  la fecha y la hora.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={loadPdfForRegion}
                  disabled={!file}
                  size="lg"
                  className="gap-2"
                >
                  <FileUp className="h-4 w-4" />
                  Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {stage === "region" && (
          <Card>
            <CardHeader>
              <CardTitle>Marca la zona a escanear</CardTitle>
              <p className="text-sm text-muted-foreground">
                Arrastra con el ratón sobre cada página para seleccionar la
                zona que quieres importar. Si dejas una página sin marcar, se
                escaneará completa.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {thumbs.map((t) => (
                <RegionPicker
                  key={t.page}
                  thumb={t}
                  rect={regions[t.page]}
                  onChange={(rect) =>
                    setRegions((prev) => {
                      const n = { ...prev };
                      if (rect) n[t.page] = rect;
                      else delete n[t.page];
                      return n;
                    })
                  }
                />
              ))}
              <div className="flex justify-between">
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Volver
                </Button>
                <Button onClick={processPdf} size="lg" className="gap-2">
                  <FileUp className="h-4 w-4" /> Procesar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {stage === "processing" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Procesando…
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">{progressLabel}</p>
              <p className="text-xs text-muted-foreground">
                El OCR puede tardar varios segundos por página.
              </p>
            </CardContent>
          </Card>
        )}

        {stage === "select" && (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Datos de la noticia</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Extraídos automáticamente del PDF. Revísalos y edítalos si es
                  necesario.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="periodico">Periódico</Label>
                    <Input
                      id="periodico"
                      value={metadata.periodico}
                      onChange={(e) =>
                        setMetadata({ ...metadata, periodico: e.target.value })
                      }
                      placeholder="Ej. El País"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titulo">Título de la noticia</Label>
                    <Input
                      id="titulo"
                      value={metadata.titulo}
                      onChange={(e) =>
                        setMetadata({ ...metadata, titulo: e.target.value })
                      }
                      placeholder="Titular"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fecha">Fecha</Label>
                    <Input
                      id="fecha"
                      type={metadata.fecha === "por determinar" ? "text" : "date"}
                      value={metadata.fecha}
                      onChange={(e) =>
                        setMetadata({ ...metadata, fecha: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hora">Hora</Label>
                    <Input
                      id="hora"
                      type={metadata.hora === "por determinar" ? "text" : "time"}
                      value={metadata.hora}
                      onChange={(e) =>
                        setMetadata({ ...metadata, hora: e.target.value })
                      }
                    />
                  </div>

                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>Imágenes detectadas ({images.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {images.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No se han encontrado imágenes embebidas en el PDF.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {images.map((img) => {
                      const selected = selectedImgIds.has(img.id);
                      return (
                        <button
                          type="button"
                          key={img.id}
                          onClick={() => toggleImg(img.id)}
                          className={`group relative overflow-hidden rounded-lg border-2 transition ${
                            selected
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img
                            src={img.dataUrl}
                            alt={`Imagen página ${img.page}`}
                            loading="lazy"
                            className="h-40 w-full object-cover"
                          />
                          <div className="absolute left-2 top-2">
                            <Checkbox checked={selected} />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-left text-xs text-white">
                            Pág. {img.page} · {img.width}×{img.height}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Bloques de texto detectados ({textBlocks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {textBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No se ha extraído texto por OCR.
                  </p>
                ) : (
                  textBlocks.map((b) => {
                    const selected = selectedTextIds.has(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex cursor-pointer gap-3 rounded-lg border-2 p-3 transition ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border opacity-70 hover:opacity-100"
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleTxt(b.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Página {b.page}
                          </p>
                          <Input
                            value={b.titulo ?? ""}
                            placeholder="Subtítulo del bloque (opcional)"
                            onChange={(e) => {
                              const v = e.target.value;
                              setTextBlocks((prev) =>
                                prev.map((x) =>
                                  x.id === b.id ? { ...x, titulo: v } : x,
                                ),
                              );
                            }}
                            className="font-semibold"
                          />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              type="text"
                              value={b.fecha ?? ""}
                              placeholder="Fecha (opcional)"
                              onChange={(e) => {
                                const v = e.target.value;
                                setTextBlocks((prev) =>
                                  prev.map((x) =>
                                    x.id === b.id ? { ...x, fecha: v } : x,
                                  ),
                                );
                              }}
                            />
                            <Input
                              type="text"
                              value={b.hora ?? ""}
                              placeholder="Hora (opcional)"
                              onChange={(e) => {
                                const v = e.target.value;
                                setTextBlocks((prev) =>
                                  prev.map((x) =>
                                    x.id === b.id ? { ...x, hora: v } : x,
                                  ),
                                );
                              }}
                            />
                          </div>

                          <Textarea
                            value={b.text}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTextBlocks((prev) =>
                                prev.map((x) =>
                                  x.id === b.id ? { ...x, text: v } : x,
                                ),
                              );
                            }}
                            className="min-h-24 text-sm"
                          />
                        </div>
                      </label>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Empezar de nuevo
              </Button>
              <Button onClick={handleFinish} size="lg" disabled={!canFinish}>
                Guardar noticia
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <Card>
            <CardHeader>
              <CardTitle>{metadata.titulo}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {metadata.periodico} · {metadata.fecha} · {metadata.hora}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {finalImages.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    Imágenes conservadas ({finalImages.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {finalImages.map((img) => (
                      <img
                        key={img.id}
                        src={img.dataUrl}
                        alt=""
                        loading="lazy"
                        className="rounded-md border object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
              {finalTexts.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Texto</h3>
                  <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                    {finalTexts.map((t) => (
                      <div key={t.id} className="space-y-1">
                        {t.titulo && (
                          <h4 className="text-sm font-semibold">{t.titulo}</h4>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{t.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nueva noticia
                </Button>
                <Button onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

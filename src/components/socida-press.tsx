import { useCallback, useMemo, useRef, useState } from "react";
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
  text: string;
}

interface Metadata {
  periodico: string;
  titulo: string;
  fecha: string;
  hora: string;
}

type Stage = "form" | "processing" | "select" | "done";

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

// Limpia texto (OCR o nativo) eliminando caracteres extraños,
// símbolos sueltos, guiones de fin de línea y espacios repetidos.
function limpiarTexto(texto: string): string {
  let s = texto;
  // Normaliza a NFC y elimina caracteres de control invisibles
  s = s.normalize("NFC");
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "");
  // Elimina reemplazos, guiones opcionales y marcas de dirección
  s = s.replace(/[\uFFFD\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "");
  // Comillas tipográficas y guiones largos -> ASCII
  s = s.replace(/[“”«»„]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/[–—―]/g, "-");
  // Puntos suspensivos tipográficos
  s = s.replace(/…/g, "...");
  // Guiones de palabras partidas por columnas / fin de línea
  s = s.replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, "$1$2");
  // Une saltos de línea internos de un mismo párrafo (no dobles)
  s = s.replace(/([^\n])\n(?!\n)/g, "$1 ");
  // Solo letras (con acentos), dígitos, puntuación habitual y espacios
  s = s.replace(/[^\p{L}\p{N}\s.,;:!¡¿?()"'%€$£ºª&/\-\n]/gu, " ");
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
  s = s.replace(/\b(?![aAoOyYeEuU]\b)[a-záéíóúñ]\b/g, "").replace(/[ \t]{2,}/g, " ");
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

// Convierte los items de pdf.js a bloques {titulo?, text} detectando cambios de
// tamaño (subtítulos), párrafos por gaps verticales y columnas por gaps de X.
function extraerBloquesNativos(items: NativeItem[]): { titulo?: string; text: string }[] {
  if (!items.length) return [];

  // Estimar tamaño mediana (cuerpo de texto)
  const sizes = items.map((i) => i.size).filter((s) => s > 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 10;

  // Agrupar items en líneas por columna (x aproximada) y por y
  const sorted = [...items].sort((a, b) => {
    // Ordena por columna aproximada (bloques de 100pt en X * escala 2 = 200)
    const col = Math.floor(a.x / 200) - Math.floor(b.x / 200);
    if (col !== 0) return col;
    return b.y - a.y; // pdf.js: y crece hacia arriba
  });

  type Linea = { x: number; y: number; size: number; text: string };
  const lineas: Linea[] = [];
  let cur: Linea | null = null;
  const yTol = median * 0.6;
  for (const it of sorted) {
    const str = it.str;
    if (!str.trim() && !it.hasEOL) continue;
    if (
      cur &&
      Math.abs(cur.y - it.y) <= yTol &&
      Math.abs(cur.size - it.size) < 0.5 &&
      Math.floor(cur.x / 200) === Math.floor(it.x / 200)
    ) {
      cur.text += (cur.text.endsWith(" ") || !str.startsWith(" ") ? "" : "") + str;
    } else {
      if (cur) lineas.push(cur);
      cur = { x: it.x, y: it.y, size: it.size, text: str };
    }
    if (it.hasEOL) {
      if (cur) lineas.push(cur);
      cur = null;
    }
  }
  if (cur) lineas.push(cur);

  // Descartar líneas basura antes de agrupar
  const limpias = lineas
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text.length > 0);

  // Recorremos líneas y agrupamos en bloques.
  // - Una línea con size > median * 1.3 y pocas palabras => subtítulo (inicia bloque)
  // - Gap vertical grande (> median * 2) entre líneas => nuevo párrafo/bloque
  const bloques: { titulo?: string; text: string }[] = [];
  let bloqueActual: { titulo?: string; text: string } | null = null;
  let ultimaY: number | null = null;
  let ultimaCol: number | null = null;

  const pushBloque = () => {
    if (bloqueActual) {
      const limpio = limpiarTexto(bloqueActual.text);
      if (limpio.length > 40 && !esRuidoMaquetacion(limpio)) {
        bloques.push({ titulo: bloqueActual.titulo, text: limpio });
      }
      bloqueActual = null;
    }
  };

  for (const l of limpias) {
    const col = Math.floor(l.x / 200);
    const esSubtitulo =
      l.size >= median * 1.3 && l.text.split(/\s+/).length <= 14 && l.text.length < 120;
    const gap = ultimaY !== null ? Math.abs(ultimaY - l.y) : 0;
    const nuevoBloque =
      esSubtitulo ||
      !bloqueActual ||
      (ultimaCol !== null && ultimaCol !== col) ||
      gap > median * 2.2;

    if (nuevoBloque) {
      pushBloque();
      bloqueActual = { titulo: esSubtitulo ? l.text : undefined, text: esSubtitulo ? "" : l.text };
    } else {
      bloqueActual!.text += (bloqueActual!.text ? " " : "") + l.text;
    }
    ultimaY = l.y;
    ultimaCol = col;
  }
  pushBloque();

  return bloques;
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const numPages = pdf.numPages;

      const foundImages: ExtractedImage[] = [];
      const pageCanvases: { page: number; canvas: HTMLCanvasElement }[] = [];
      const nativePageTexts: { page: number; text: string }[] = [];
      const nativePageItems: { page: number; items: NativeItem[] }[] = [];
      let tituloDetectado = "";


      // 1) Render + extracción de imágenes por página
      for (let p = 1; p <= numPages; p++) {
        setProgressLabel(`Analizando página ${p} de ${numPages}…`);
        setProgress(5 + Math.round(((p - 1) / numPages) * 40));

        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        pageCanvases.push({ page: p, canvas });

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
          nativePageItems.push({ page: p, items: nItems });

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
              const name = args?.[0];
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

      // 2) Construir bloques: preferimos texto nativo del PDF (limpio y con
      //    subtítulos por tamaño de fuente). Solo pasamos por OCR las páginas
      //    que no tengan capa de texto.
      const blocks: ExtractedTextBlock[] = [];
      const pagesText: { page: number; text: string }[] = [];
      const paginasSinTexto: { page: number; canvas: HTMLCanvasElement }[] = [];

      for (const { page, canvas } of pageCanvases) {
        const nativa = nativePageItems.find((n) => n.page === page);
        if (nativa && nativa.items.length > 20) {
          const bloques = extraerBloquesNativos(nativa.items);
          bloques.forEach((b, i) => {
            blocks.push({
              id: `txt-${page}-${i}`,
              page,
              titulo: b.titulo,
              text: b.text,
            });
          });
        } else {
          paginasSinTexto.push({ page, canvas });
        }
      }

      if (paginasSinTexto.length) {
        setProgressLabel("Preparando OCR…");
        setProgress(48);
        const tesseract = await import("tesseract.js");
        const worker = await tesseract.createWorker("spa", 1);
        for (let idx = 0; idx < paginasSinTexto.length; idx++) {
          const { page, canvas } = paginasSinTexto[idx];
          setProgressLabel(`OCR página ${page} de ${numPages}…`);
          setProgress(50 + Math.round(((idx + 1) / paginasSinTexto.length) * 48));
          const { data } = await worker.recognize(canvas);
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
  }, [file]);

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
      bloques: finalTexts.map((t) => ({ titulo: t.titulo ?? "", texto: t.text })),
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
                  Sube el PDF y SocidaPress intentará detectar automáticamente
                  el periódico, el título, la fecha y la hora. Podrás revisarlos
                  después.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={processPdf}
                  disabled={!file}
                  size="lg"
                  className="gap-2"
                >
                  <FileUp className="h-4 w-4" />
                  Procesar PDF
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

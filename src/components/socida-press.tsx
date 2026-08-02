diff --git a/src/components/socida-press.tsx b/src/components/socida-press.tsx
index cbb0f64..27fcdd9 100644
--- a/src/components/socida-press.tsx
+++ b/src/components/socida-press.tsx
@@ -1,4 +1,11 @@
-import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
+import {
+  type PointerEvent as ReactPointerEvent,
+  useCallback,
+  useEffect,
+  useMemo,
+  useRef,
+  useState,
+} from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
@@ -8,8 +15,18 @@ import { Checkbox } from "@/components/ui/checkbox";
 import { Progress } from "@/components/ui/progress";
 import { Separator } from "@/components/ui/separator";
 import { toast } from "sonner";
-import { Newspaper, FileUp, Download, RotateCcw, Loader2, Library, Trash2, Save, ArrowLeft, Pencil } from "lucide-react";
-
+import {
+  Newspaper,
+  FileUp,
+  Download,
+  RotateCcw,
+  Loader2,
+  Library,
+  Trash2,
+  Save,
+  ArrowLeft,
+  Pencil,
+} from "lucide-react";
 
 // Tipos internos
 interface ExtractedImage {
@@ -33,8 +50,6 @@ interface ExtractedTextBlock {
   cropDataUrl?: string;
 }
 
-
-
 interface Metadata {
   periodico: string;
   titulo: string;
@@ -89,7 +104,6 @@ function guardarNoticias(list: SavedNoticia[]) {
   }
 }
 
-
 // Imagen completa de una página + (opcional) recorte de la zona marcada.
 // Sirve como "prueba visual" que acompaña a los bloques extraídos.
 interface PageImage {
@@ -163,9 +177,19 @@ function pdfImageToDataUrl(img: {
 
 // Meses en español para reconocer fechas escritas con letras
 const MESES: Record<string, string> = {
-  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
-  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
-  noviembre: "11", diciembre: "12",
+  enero: "01",
+  febrero: "02",
+  marzo: "03",
+  abril: "04",
+  mayo: "05",
+  junio: "06",
+  julio: "07",
+  agosto: "08",
+  septiembre: "09",
+  setiembre: "09",
+  octubre: "10",
+  noviembre: "11",
+  diciembre: "12",
 };
 
 // Periódicos permitidos (orden por prioridad de detección: primero los que no
@@ -190,10 +214,7 @@ function detectarPeriodico(fullText: string): string {
 
 // Intenta extraer periódico, título, fecha y hora del texto de la página.
 // `titleFromFont` es el título detectado por tamaño de fuente (más fiable).
-function extraerMetadatos(
-  fullText: string,
-  titleFromFont: string,
-): Metadata {
+function extraerMetadatos(fullText: string, titleFromFont: string): Metadata {
   const md: Metadata = { periodico: "", titulo: "", fecha: "", hora: "" };
 
   md.periodico = detectarPeriodico(fullText);
@@ -287,7 +308,6 @@ function esEtiquetaSeccion(texto: string): boolean {
   return s.split(/\s+/).length <= 3;
 }
 
-
 // Limpia texto (OCR o nativo) eliminando caracteres extraños,
 // símbolos sueltos, guiones de fin de línea y espacios repetidos.
 function limpiarTexto(texto: string): string {
@@ -302,7 +322,10 @@ function limpiarTexto(texto: string): string {
   // Ahora sí normaliza a NFC para componer letra + diacrítico -> ñ, á, é...
   s = s.normalize("NFC");
   // Comillas tipográficas y guiones largos -> ASCII
-  s = s.replace(/[“”«»„]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/[–—―]/g, "-");
+  s = s
+    .replace(/[“”«»„]/g, '"')
+    .replace(/[‘’‚‛]/g, "'")
+    .replace(/[–—―]/g, "-");
   // Puntos suspensivos tipográficos
   s = s.replace(/…/g, "...");
   // Guiones de palabras partidas por columnas / fin de línea
@@ -334,10 +357,7 @@ function limpiarTexto(texto: string): string {
   // lookarounds Unicode porque \b en JS ignora los acentos y borraría
   // ñ/á/é interiores de palabras como "años" o "después".
   s = s
-    .replace(
-      /(?<![\p{L}\p{N}_])(?![aAoOyYeEuUiI](?![\p{L}\p{N}_]))[\p{L}](?![\p{L}\p{N}_])/gu,
-      "",
-    )
+    .replace(/(?<![\p{L}\p{N}_])(?![aAoOyYeEuUiI](?![\p{L}\p{N}_]))[\p{L}](?![\p{L}\p{N}_])/gu, "")
     .replace(/[ \t]{2,}/g, " ");
   return s.trim();
 }
@@ -360,7 +380,10 @@ function extraerBloquesNativos(
 ): { titulo?: string; text: string; fecha?: string; hora?: string }[] {
   if (!items.length) return [];
 
-  const sizes = items.map((i) => i.size).filter((s) => s > 0).sort((a, b) => a - b);
+  const sizes = items
+    .map((i) => i.size)
+    .filter((s) => s > 0)
+    .sort((a, b) => a - b);
   const median = sizes[Math.floor(sizes.length / 2)] || 10;
 
   // 1) Construcción de líneas: recorremos los items en orden natural
@@ -370,7 +393,7 @@ function extraerBloquesNativos(
   const yTol = median * 0.5;
   const ordenados = [...items]
     .filter((i) => i.str.trim() || i.hasEOL)
-    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
+    .sort((a, b) => b.y - a.y || a.x - b.x);
 
   const lineas: Linea[] = [];
   for (const it of ordenados) {
@@ -397,9 +420,7 @@ function extraerBloquesNativos(
   // con la línea contigua a su derecha para no perder la primera letra
   // del cuerpo ("D" + "el 19…"). Aceptamos hasta 3 caracteres por si el
   // OCR/parser mezcla la capitular con la siguiente ("De" o "Del").
-  const capitulares = lineas.filter(
-    (l) => l.text.trim().length <= 3 && l.size >= median * 1.9,
-  );
+  const capitulares = lineas.filter((l) => l.text.trim().length <= 3 && l.size >= median * 1.9);
   const capSet = new Set(capitulares);
   for (const dc of capitulares) {
     const letra = dc.text.trim();
@@ -420,13 +441,11 @@ function extraerBloquesNativos(
     if (destino) destino.text = letra + destino.text;
   }
 
-
   const limpias = lineas
     .filter((l) => !capSet.has(l))
     .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
     .filter((l) => l.text.length > 0);
 
-
   // 2) Identificar titulares principales (fuente muy grande) y "decks"
   //    o subtítulos (fuente intermedia). Después agrupamos cada titular
   //    con las líneas grandes/intermedias contiguas por debajo, para que
@@ -441,10 +460,7 @@ function extraerBloquesNativos(
     !esEtiquetaSeccion(l.text);
 
   const esSubtitular = (l: Linea) =>
-    l.size >= median * 1.3 &&
-    l.size < median * 1.8 &&
-    l.text.length >= 15 &&
-    !esLineaRuido(l.text);
+    l.size >= median * 1.3 && l.size < median * 1.8 && l.text.length >= 15 && !esLineaRuido(l.text);
 
   const porYDesc = (a: Linea, b: Linea) => b.y - a.y;
 
@@ -468,9 +484,7 @@ function extraerBloquesNativos(
     if (consumidas.has(seed)) continue;
     const cluster: Linea[] = [seed];
     consumidas.add(seed);
-    const debajo = limpias
-      .filter((l) => !consumidas.has(l) && l.y < seed.y)
-      .sort(porYDesc);
+    const debajo = limpias.filter((l) => !consumidas.has(l) && l.y < seed.y).sort(porYDesc);
     let yRef = seed.y;
     for (const l of debajo) {
       const gap = yRef - l.y;
@@ -509,7 +523,7 @@ function extraerBloquesNativos(
   // Si no hay titulares detectados, tratamos toda la página como un bloque.
   if (articulos.length === 0) {
     const raw = limpias
-      .sort((a, b) => (b.y - a.y) || (a.x - b.x))
+      .sort((a, b) => b.y - a.y || a.x - b.x)
       .map((l) => l.text)
       .join("\n");
     const limpio = limpiarTexto(raw);
@@ -600,12 +614,6 @@ function extraerBloquesNativos(
     });
   }
 
-
-
-
-
-
-
   return bloques;
 }
 
@@ -675,15 +683,27 @@ function RegionPicker({
     // Aplicar rotación en %
     let l: number, t: number, rgt: number, btm: number;
     if (rot === 0) {
-      l = ax; t = ay; rgt = 100 - bx; btm = 100 - by;
+      l = ax;
+      t = ay;
+      rgt = 100 - bx;
+      btm = 100 - by;
     } else if (rot === 90) {
       // (x,y) -> (100-y, x) en un cuadrado; pero contenedor rota, así que:
       // el contenedor rotado tiene ancho=alto original.
-      l = 100 - by; t = ax; rgt = 100 - (100 - ay); btm = 100 - bx;
+      l = 100 - by;
+      t = ax;
+      rgt = 100 - (100 - ay);
+      btm = 100 - bx;
     } else if (rot === 180) {
-      l = 100 - bx; t = 100 - by; rgt = ax; btm = ay;
+      l = 100 - bx;
+      t = 100 - by;
+      rgt = ax;
+      btm = ay;
     } else {
-      l = ay; t = 100 - bx; rgt = 100 - by; btm = 100 - (100 - ax);
+      l = ay;
+      t = 100 - bx;
+      rgt = 100 - by;
+      btm = 100 - (100 - ax);
     }
     return {
       left: `${l}%`,
@@ -750,7 +770,8 @@ function RegionPicker({
           Página {thumb.page}
           {rects.length > 0 && (
             <span className="ml-2 text-xs font-normal text-muted-foreground">
-              {rects.length} zona{rects.length === 1 ? "" : "s"} marcada{rects.length === 1 ? "" : "s"}
+              {rects.length} zona{rects.length === 1 ? "" : "s"} marcada
+              {rects.length === 1 ? "" : "s"}
             </span>
           )}
         </p>
@@ -936,9 +957,7 @@ function LibraryView({
           <Separator />
 
           <div className="space-y-4">
-            <h3 className="text-sm font-semibold">
-              Bloques de texto ({draft.bloques.length})
-            </h3>
+            <h3 className="text-sm font-semibold">Bloques de texto ({draft.bloques.length})</h3>
             {draft.bloques.map((b) => (
               <div key={b.id} className="space-y-3 rounded-md border bg-muted/30 p-4">
                 <div className="grid gap-3 md:grid-cols-3">
@@ -1044,9 +1063,7 @@ function LibraryView({
               >
                 {n.bloques[0]?.imagenSeleccion || n.bloques[0]?.imagenPagina ? (
                   <img
-                    src={
-                      n.bloques[0]?.imagenSeleccion ?? n.bloques[0]?.imagenPagina ?? ""
-                    }
+                    src={n.bloques[0]?.imagenSeleccion ?? n.bloques[0]?.imagenPagina ?? ""}
                     alt=""
                     loading="lazy"
                     className="h-24 w-32 shrink-0 rounded border object-cover"
@@ -1097,7 +1114,6 @@ function LibraryView({
   );
 }
 
-
 export default function SocidaPressApp() {
   const [stage, setStage] = useState<Stage>("form");
   const [metadata, setMetadata] = useState<Metadata>({
@@ -1132,7 +1148,6 @@ export default function SocidaPressApp() {
     guardarNoticias(next);
   }, []);
 
-
   const handleReset = () => {
     setStage("form");
     setFile(null);
@@ -1159,8 +1174,7 @@ export default function SocidaPressApp() {
     setProgressLabel("Cargando PDF…");
     try {
       const pdfjs = await import("pdfjs-dist");
-      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
-        .default;
+      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
       pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
       const buf = await file.arrayBuffer();
       const pdf = await pdfjs.getDocument({ data: buf }).promise;
@@ -1173,11 +1187,15 @@ export default function SocidaPressApp() {
         const page = (await pdf.getPage(p)) as {
           rotate?: number;
           getViewport: (o: { scale: number; rotation?: number }) => {
-            width: number; height: number; viewBox: number[];
+            width: number;
+            height: number;
+            viewBox: number[];
+          };
+          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
+            promise: Promise<void>;
           };
-          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
         };
-        const pdfRot = ((page.rotate ?? 0) % 360 + 360) % 360;
+        const pdfRot = (((page.rotate ?? 0) % 360) + 360) % 360;
         rotIniciales[p] = pdfRot;
         // Renderizamos sin rotación adicional: la miniatura muestra el PDF
         // "tal cual" y la corrección se aplica visualmente con CSS transform.
@@ -1209,8 +1227,6 @@ export default function SocidaPressApp() {
     }
   }, [file]);
 
-
-
   const processPdf = useCallback(async () => {
     if (!file) return;
     setStage("processing");
@@ -1219,8 +1235,7 @@ export default function SocidaPressApp() {
 
     try {
       const pdfjs = await import("pdfjs-dist");
-      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
-        .default;
+      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
       pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
 
       setProgressLabel("Leyendo PDF…");
@@ -1236,7 +1251,12 @@ export default function SocidaPressApp() {
       const numPages = pdf.numPages;
 
       const foundImages: ExtractedImage[] = [];
-      const pageCanvases: { page: number; canvas: HTMLCanvasElement; rectsPx: { x: number; y: number; w: number; h: number }[]; rotation: number }[] = [];
+      const pageCanvases: {
+        page: number;
+        canvas: HTMLCanvasElement;
+        rectsPx: { x: number; y: number; w: number; h: number }[];
+        rotation: number;
+      }[] = [];
       const nativePageTexts: { page: number; text: string }[] = [];
       const nativePageItems: { page: number; items: NativeItem[] }[] = [];
       let tituloDetectado = "";
@@ -1260,7 +1280,9 @@ export default function SocidaPressApp() {
             height: number;
             viewBox: number[];
           };
-          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
+          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
+            promise: Promise<void>;
+          };
           getTextContent: () => Promise<{ items: unknown[] }>;
           getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
           objs: { get: (n: string, cb: (o: unknown) => void) => void };
@@ -1268,7 +1290,7 @@ export default function SocidaPressApp() {
         // Aplicamos la rotación elegida por el usuario (o la intrínseca del
         // PDF si no ha tocado nada) para que el texto salga derecho.
         const userRot = rotations[p];
-        const rotacion = ((userRot ?? (page.rotate ?? 0)) % 360 + 360) % 360;
+        const rotacion = (((userRot ?? page.rotate ?? 0) % 360) + 360) % 360;
         const viewport = page.getViewport({ scale: 2, rotation: rotacion });
         const canvas = document.createElement("canvas");
         canvas.width = viewport.width;
@@ -1286,29 +1308,37 @@ export default function SocidaPressApp() {
         const ch = canvas.height;
         const rectsPx: { x: number; y: number; w: number; h: number }[] = rectsPdf.map((r) => {
           // Cuatro esquinas en coords canvas para rotación=0 (Y baja hacia abajo)
-          const ax0 = ((r.xMin - vx0) / pdfW);
-          const ax1 = ((r.xMax - vx0) / pdfW);
-          const ay0 = ((vy1 - r.yMax) / pdfH);
-          const ay1 = ((vy1 - r.yMin) / pdfH);
+          const ax0 = (r.xMin - vx0) / pdfW;
+          const ax1 = (r.xMax - vx0) / pdfW;
+          const ay0 = (vy1 - r.yMax) / pdfH;
+          const ay1 = (vy1 - r.yMin) / pdfH;
           let l: number, t: number, w: number, h: number;
           if (rotacion === 0) {
-            l = ax0 * cw; t = ay0 * ch; w = (ax1 - ax0) * cw; h = (ay1 - ay0) * ch;
+            l = ax0 * cw;
+            t = ay0 * ch;
+            w = (ax1 - ax0) * cw;
+            h = (ay1 - ay0) * ch;
           } else if (rotacion === 90) {
             // (x,y) -> (H - y, x). Canvas rotado tiene w=oldH, h=oldW.
-            l = (1 - ay1) * cw; t = ax0 * ch;
-            w = (ay1 - ay0) * cw; h = (ax1 - ax0) * ch;
+            l = (1 - ay1) * cw;
+            t = ax0 * ch;
+            w = (ay1 - ay0) * cw;
+            h = (ax1 - ax0) * ch;
           } else if (rotacion === 180) {
-            l = (1 - ax1) * cw; t = (1 - ay1) * ch;
-            w = (ax1 - ax0) * cw; h = (ay1 - ay0) * ch;
+            l = (1 - ax1) * cw;
+            t = (1 - ay1) * ch;
+            w = (ax1 - ax0) * cw;
+            h = (ay1 - ay0) * ch;
           } else {
-            l = ay0 * cw; t = (1 - ax1) * ch;
-            w = (ay1 - ay0) * cw; h = (ax1 - ax0) * ch;
+            l = ay0 * cw;
+            t = (1 - ax1) * ch;
+            w = (ay1 - ay0) * cw;
+            h = (ax1 - ax0) * ch;
           }
           return { x: l, y: t, w, h };
         });
         pageCanvases.push({ page: p, canvas, rectsPx, rotation: rotacion });
 
-
         // Extraer texto nativo del PDF (mucho más fiable que OCR).
         try {
           const tc = await page.getTextContent();
@@ -1331,11 +1361,7 @@ export default function SocidaPressApp() {
           const nItemsFiltrados = rectsPdf.length
             ? nItems.filter((it) =>
                 rectsPdf.some(
-                  (r) =>
-                    it.x >= r.xMin &&
-                    it.x <= r.xMax &&
-                    it.y >= r.yMin &&
-                    it.y <= r.yMax,
+                  (r) => it.x >= r.xMin && it.x <= r.xMax && it.y >= r.yMin && it.y <= r.yMax,
                 ),
               )
             : nItems;
@@ -1356,24 +1382,24 @@ export default function SocidaPressApp() {
               const maxSize = withSize.reduce((m, x) => Math.max(m, x.size), 0);
               const umbral = maxSize * 0.9;
               const tituloItems = withSize.filter((x) => x.size >= umbral);
-              tituloDetectado = tituloItems.map((x) => x.str).join(" ").replace(/\s+/g, " ").trim();
+              tituloDetectado = tituloItems
+                .map((x) => x.str)
+                .join(" ")
+                .replace(/\s+/g, " ")
+                .trim();
             }
           }
         } catch {
           // sin capa de texto -> nos apoyaremos en el OCR
         }
 
-
         try {
           const opList = await page.getOperatorList();
           const OPS = pdfjs.OPS;
           const seen = new Set<string>();
           for (let i = 0; i < opList.fnArray.length; i++) {
             const fn = opList.fnArray[i];
-            if (
-              fn === OPS.paintImageXObject ||
-              fn === OPS.paintInlineImageXObject
-            ) {
+            if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
               const args = opList.argsArray[i];
               const name = args?.[0] as string | undefined;
               if (!name || seen.has(name)) continue;
@@ -1381,9 +1407,11 @@ export default function SocidaPressApp() {
               try {
                 const img: unknown = await new Promise((resolve) => {
                   try {
-                    (page as unknown as {
-                      objs: { get: (n: string, cb: (o: unknown) => void) => void };
-                    }).objs.get(name, resolve);
+                    (
+                      page as unknown as {
+                        objs: { get: (n: string, cb: (o: unknown) => void) => void };
+                      }
+                    ).objs.get(name, resolve);
                   } catch {
                     resolve(null);
                   }
@@ -1457,14 +1485,95 @@ export default function SocidaPressApp() {
         return c;
       };
 
+      // Ancho objetivo (px) para el recorte de cada zona antes del OCR:
+      // suficiente para que las letras del cuerpo de texto tengan un
+      // tamaño cómodo para el motor, sin disparar la memoria.
+      const ANCHO_OBJETIVO_ZONA = 2200;
+
+      // Vuelve a renderizar una zona directamente desde el PDF a alta
+      // resolución, en vez de recortar y ampliar el render de página
+      // completa (que solo interpola, sin aportar información nueva).
+      // Esto es lo que más mejora la nitidez del texto pequeño antes de
+      // pasarlo por OCR: la letra sale nítida de verdad, no "estirada".
+      const renderZonaDesdeOriginal = async (
+        numPage: number,
+        rectPdf: PdfRect,
+        rotacion: number,
+      ): Promise<HTMLCanvasElement | null> => {
+        try {
+          const pageAlta = (await pdf.getPage(numPage)) as {
+            getViewport: (o: { scale: number; rotation?: number }) => {
+              width: number;
+              height: number;
+              viewBox: number[];
+            };
+            render: (o: {
+              canvasContext: CanvasRenderingContext2D;
+              viewport: unknown;
+              transform?: number[];
+            }) => { promise: Promise<void> };
+          };
+          const anchoPdf = Math.max(1, rectPdf.xMax - rectPdf.xMin);
+          const altoPdf = Math.max(1, rectPdf.yMax - rectPdf.yMin);
+          const esVertical = rotacion === 90 || rotacion === 270;
+          const anchoEnPantalla = esVertical ? altoPdf : anchoPdf;
+          const scale = Math.min(9, Math.max(2, ANCHO_OBJETIVO_ZONA / anchoEnPantalla));
+          const viewport = pageAlta.getViewport({ scale, rotation: rotacion });
+          const [vx0, vy0, vx1, vy1] = viewport.viewBox as [number, number, number, number];
+          const pdfW = vx1 - vx0;
+          const pdfH = vy1 - vy0;
+          const cw = viewport.width;
+          const ch = viewport.height;
+          const ax0 = (rectPdf.xMin - vx0) / pdfW;
+          const ax1 = (rectPdf.xMax - vx0) / pdfW;
+          const ay0 = (vy1 - rectPdf.yMax) / pdfH;
+          const ay1 = (vy1 - rectPdf.yMin) / pdfH;
+          let l: number, t: number, w: number, h: number;
+          if (rotacion === 0) {
+            l = ax0 * cw;
+            t = ay0 * ch;
+            w = (ax1 - ax0) * cw;
+            h = (ay1 - ay0) * ch;
+          } else if (rotacion === 90) {
+            l = (1 - ay1) * cw;
+            t = ax0 * ch;
+            w = (ay1 - ay0) * cw;
+            h = (ax1 - ax0) * ch;
+          } else if (rotacion === 180) {
+            l = (1 - ax1) * cw;
+            t = (1 - ay1) * ch;
+            w = (ax1 - ax0) * cw;
+            h = (ay1 - ay0) * ch;
+          } else {
+            l = ay0 * cw;
+            t = (1 - ax1) * ch;
+            w = (ay1 - ay0) * cw;
+            h = (ax1 - ax0) * ch;
+          }
+          if (w < 20 || h < 20) return null;
+          const canvas = document.createElement("canvas");
+          canvas.width = Math.round(w);
+          canvas.height = Math.round(h);
+          const ctx = canvas.getContext("2d");
+          if (!ctx) return null;
+          // Desplazamos el origen para dibujar (y reservar memoria) solo la
+          // zona recortada, no la página completa a esta resolución.
+          await pageAlta.render({
+            canvasContext: ctx,
+            viewport,
+            transform: [1, 0, 0, 1, -l, -t],
+          }).promise;
+          return canvas;
+        } catch {
+          return null;
+        }
+      };
+
       // Mejora de la zona seleccionada: se redimensiona a un ancho objetivo
       // (para que las letras tengan tamaño suficiente) y se ajustan luz y
       // color -> gris + estirado de niveles por percentiles + gamma.
       // Devuelve una imagen legible y agradable a la vista.
-      const mejorarZona = (
-        canvas: HTMLCanvasElement,
-        anchoObjetivo = 2000,
-      ): HTMLCanvasElement => {
+      const mejorarZona = (canvas: HTMLCanvasElement, anchoObjetivo = 2000): HTMLCanvasElement => {
         const escala = Math.min(4, Math.max(1, anchoObjetivo / canvas.width));
         const c = document.createElement("canvas");
         c.width = Math.round(canvas.width * escala);
@@ -1489,11 +1598,20 @@ export default function SocidaPressApp() {
         const corte = Math.max(1, Math.round(total * 0.02));
         let lo = 0;
         let acc = 0;
-        while (lo < 255 && acc + hist[lo] < corte) { acc += hist[lo]; lo++; }
+        while (lo < 255 && acc + hist[lo] < corte) {
+          acc += hist[lo];
+          lo++;
+        }
         let hi = 255;
         acc = 0;
-        while (hi > 0 && acc + hist[hi] < corte) { acc += hist[hi]; hi--; }
-        if (hi - lo < 20) { lo = 0; hi = 255; }
+        while (hi > 0 && acc + hist[hi] < corte) {
+          acc += hist[hi];
+          hi--;
+        }
+        if (hi - lo < 20) {
+          lo = 0;
+          hi = 255;
+        }
         const rango = hi - lo;
         // Tabla de conversión: niveles + gamma 0,9 (aclara ligeramente el fondo).
         const lut = new Uint8ClampedArray(256);
@@ -1501,8 +1619,39 @@ export default function SocidaPressApp() {
           const n = Math.min(1, Math.max(0, (v - lo) / rango));
           lut[v] = Math.round(Math.pow(n, 0.9) * 255);
         }
+        const w2 = c.width;
+        const h2 = c.height;
+        const salidaGris = new Uint8ClampedArray(w2 * h2);
         for (let i = 0, j = 0; i < d.length; i += 4, j++) {
-          const v = lut[grises[j]];
+          salidaGris[j] = lut[grises[j]];
+        }
+        // Enfoque suave (unsharp mask) para realzar los trazos finos de las
+        // letras tras el reescalado, sin exagerar el ruido de fondo.
+        const nitida = new Uint8ClampedArray(w2 * h2);
+        const cantidad = 0.6;
+        for (let y = 0; y < h2; y++) {
+          const y0 = y > 0 ? y - 1 : y;
+          const y1 = y < h2 - 1 ? y + 1 : y;
+          for (let x = 0; x < w2; x++) {
+            const x0 = x > 0 ? x - 1 : x;
+            const x1 = x < w2 - 1 ? x + 1 : x;
+            const media =
+              (salidaGris[y0 * w2 + x0] +
+                salidaGris[y0 * w2 + x] +
+                salidaGris[y0 * w2 + x1] +
+                salidaGris[y * w2 + x0] +
+                salidaGris[y * w2 + x] +
+                salidaGris[y * w2 + x1] +
+                salidaGris[y1 * w2 + x0] +
+                salidaGris[y1 * w2 + x] +
+                salidaGris[y1 * w2 + x1]) /
+              9;
+            const idx = y * w2 + x;
+            nitida[idx] = salidaGris[idx] + cantidad * (salidaGris[idx] - media);
+          }
+        }
+        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
+          const v = nitida[j];
           d[i] = d[i + 1] = d[i + 2] = v;
           d[i + 3] = 255;
         }
@@ -1510,8 +1659,36 @@ export default function SocidaPressApp() {
         return c;
       };
 
-      // Binarización adaptativa (media local mediante imagen integral).
-      // Se aplica solo a la copia que va al OCR, no a la que se guarda.
+      // Filtro de mediana 3x3 sobre el canal de gris: elimina el punteado
+      // de trama de la impresión de periódico (halftone) sin difuminar el
+      // trazo de las letras, que es lo que ocurriría con un desenfoque
+      // gaussiano. Reduce mucho el ruido que confunde al OCR.
+      const mediana3x3 = (valores: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray => {
+        const out = new Uint8ClampedArray(w * h);
+        const ventana = new Uint8ClampedArray(9);
+        for (let y = 0; y < h; y++) {
+          const y0 = y > 0 ? y - 1 : 0;
+          const y1 = y < h - 1 ? y + 1 : h - 1;
+          for (let x = 0; x < w; x++) {
+            const x0 = x > 0 ? x - 1 : 0;
+            const x1 = x < w - 1 ? x + 1 : w - 1;
+            let n = 0;
+            for (let yy = y0; yy <= y1; yy++) {
+              for (let xx = x0; xx <= x1; xx++) ventana[n++] = valores[yy * w + xx];
+            }
+            const sub = ventana.subarray(0, n).slice();
+            sub.sort();
+            out[y * w + x] = sub[Math.floor(n / 2)];
+          }
+        }
+        return out;
+      };
+
+      // Binarización adaptativa tipo Sauvola: el umbral usa la media Y la
+      // desviación típica locales (no solo la media), lo que la hace mucho
+      // más robusta ante sombras irregulares de escaneo o páginas dobladas
+      // que un umbral fijo sobre la media. Se aplica solo a la copia que
+      // se manda al OCR, no a la que se guarda para el registro.
       const binarizarParaOcr = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
         const cx = canvas.getContext("2d");
         if (!cx) return canvas;
@@ -1519,16 +1696,26 @@ export default function SocidaPressApp() {
         const h = canvas.height;
         const img = cx.getImageData(0, 0, w, h);
         const d = img.data;
+        const gris = new Uint8ClampedArray(w * h);
+        for (let i = 0, j = 0; i < d.length; i += 4, j++) gris[j] = d[i];
+        const base = mediana3x3(gris, w, h);
+
         const integral = new Float64Array((w + 1) * (h + 1));
+        const integralSq = new Float64Array((w + 1) * (h + 1));
         for (let y = 0; y < h; y++) {
           let fila = 0;
+          let filaSq = 0;
           for (let x = 0; x < w; x++) {
-            fila += d[(y * w + x) * 4];
-            integral[(y + 1) * (w + 1) + (x + 1)] =
-              integral[y * (w + 1) + (x + 1)] + fila;
+            const v = base[y * w + x];
+            fila += v;
+            filaSq += v * v;
+            integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + fila;
+            integralSq[(y + 1) * (w + 1) + (x + 1)] = integralSq[y * (w + 1) + (x + 1)] + filaSq;
           }
         }
         const radio = Math.max(8, Math.round(Math.min(w, h) / 40));
+        const k = 0.28; // sensibilidad Sauvola: más alto = más agresivo con sombras
+        const R = 128; // rango dinámico esperado de la desviación típica
         const out = document.createElement("canvas");
         out.width = w;
         out.height = h;
@@ -1548,9 +1735,17 @@ export default function SocidaPressApp() {
               integral[y0 * (w + 1) + (x1 + 1)] -
               integral[(y1 + 1) * (w + 1) + x0] +
               integral[y0 * (w + 1) + x0];
+            const sumaSq =
+              integralSq[(y1 + 1) * (w + 1) + (x1 + 1)] -
+              integralSq[y0 * (w + 1) + (x1 + 1)] -
+              integralSq[(y1 + 1) * (w + 1) + x0] +
+              integralSq[y0 * (w + 1) + x0];
             const media = suma / area;
+            const varianza = Math.max(0, sumaSq / area - media * media);
+            const desv = Math.sqrt(varianza);
+            const umbral = media * (1 + k * (desv / R - 1));
             const i = (y * w + x) * 4;
-            const v = d[i] < media * 0.9 ? 0 : 255;
+            const v = base[y * w + x] < umbral ? 0 : 255;
             so[i] = so[i + 1] = so[i + 2] = v;
             so[i + 3] = 255;
           }
@@ -1576,22 +1771,27 @@ export default function SocidaPressApp() {
         cropDataUrl?: string;
       };
       const zonas: Zona[] = [];
-      for (const { page, canvas, rectsPx } of pageCanvases) {
+      for (const { page, canvas, rectsPx, rotation } of pageCanvases) {
         const rectsPdf = regions[page] || [];
         if (rectsPx.length) {
-          rectsPx.forEach((r, i) => {
-            const bruto = recortar(canvas, r);
-            const mejorado = bruto ? mejorarZona(bruto) : null;
+          for (let i = 0; i < rectsPx.length; i++) {
+            const r = rectsPx[i];
+            const rectPdf = rectsPdf[i] ?? null;
+            setProgressLabel(`Preparando zona ${i + 1} de la página ${page}…`);
+            // Preferimos volver a renderizar la zona directamente desde el
+            // PDF a alta resolución (nitidez real); si no es posible,
+            // recurrimos al recorte + ampliación del render de página.
+            const altaRes = rectPdf ? await renderZonaDesdeOriginal(page, rectPdf, rotation) : null;
+            const bruto = altaRes ?? recortar(canvas, r);
+            const mejorado = bruto ? mejorarZona(bruto, altaRes ? bruto.width : 2000) : null;
             zonas.push({
               page,
               zona: i + 1,
-              rectPdf: rectsPdf[i] ?? null,
+              rectPdf,
               recorte: mejorado,
-              cropDataUrl: mejorado
-                ? mejorado.toDataURL("image/webp", 0.9)
-                : undefined,
+              cropDataUrl: mejorado ? mejorado.toDataURL("image/webp", 0.9) : undefined,
             });
-          });
+          }
         } else {
           zonas.push({ page, zona: 1, rectPdf: null, recorte: canvas });
         }
@@ -1609,12 +1809,11 @@ export default function SocidaPressApp() {
       const pagesText: { page: number; text: string }[] = [];
 
       const dentro = (it: NativeItem, r: PdfRect | null) =>
-        !r ||
-        (it.x >= r.xMin && it.x <= r.xMax && it.y >= r.yMin && it.y <= r.yMax);
+        !r || (it.x >= r.xMin && it.x <= r.xMax && it.y >= r.yMin && it.y <= r.yMax);
 
       // Preparamos el OCR solo si alguna zona lo necesita.
       type OcrWorker = {
-        recognize: (i: unknown) => Promise<{ data: { text?: string } }>;
+        recognize: (i: unknown) => Promise<{ data: { text?: string; confidence?: number } }>;
         terminate: () => Promise<unknown>;
         setParameters?: (p: Record<string, string>) => Promise<void>;
       };
@@ -1652,13 +1851,30 @@ export default function SocidaPressApp() {
         if (itemsZona.length > 20) {
           const bloques = extraerBloquesNativos(itemsZona);
           titulo = bloques.find((b) => b.titulo)?.titulo ?? "";
-          texto = bloques.map((b) => b.text).filter(Boolean).join("\n\n");
+          texto = bloques
+            .map((b) => b.text)
+            .filter(Boolean)
+            .join("\n\n");
         }
 
         if (!texto && z.recorte) {
           const w = await obtenerWorker();
-          const { data } = await w.recognize(binarizarParaOcr(z.recorte));
-          const bruto = (data.text || "").trim();
+          // El motor LSTM de Tesseract no siempre mejora con la imagen ya
+          // binarizada (puede perder trazos finos en sombras de escaneo).
+          // Probamos primero la binarizada y, si su confianza no es alta,
+          // probamos también la versión en gris con luz ya corregida; nos
+          // quedamos con la de mayor confianza, priorizando precisión.
+          const { data: dataBin } = await w.recognize(binarizarParaOcr(z.recorte));
+          let bruto = (dataBin.text || "").trim();
+          let mejorConf = dataBin.confidence ?? 0;
+          if (mejorConf < 82) {
+            const { data: dataGris } = await w.recognize(z.recorte);
+            const confGris = dataGris.confidence ?? 0;
+            if (confGris > mejorConf) {
+              bruto = (dataGris.text || "").trim();
+              mejorConf = confGris;
+            }
+          }
           pagesText.push({ page: z.page, text: bruto });
           const lineas = bruto
             .split(/\n+/g)
@@ -1694,15 +1910,11 @@ export default function SocidaPressApp() {
       if (worker) await (worker as OcrWorker).terminate();
       setProgress(96);
 
-
       // 3) Extraer metadatos combinando texto nativo del PDF (más fiable)
       //    y, si no hubiera capa de texto, el resultado del OCR.
       const nativeFull = nativePageTexts.map((p) => p.text).join("\n");
       const ocrFull = pagesText.map((p) => p.text).join("\n");
-      const meta = extraerMetadatos(
-        `${nativeFull}\n${ocrFull}`,
-        tituloDetectado,
-      );
+      const meta = extraerMetadatos(`${nativeFull}\n${ocrFull}`, tituloDetectado);
       // Si no se detecta fecha, la dejamos "por determinar".
       // Si no se detecta hora pero sí fecha, usamos la hora actual;
       // si tampoco hay fecha, la hora queda "por determinar".
@@ -1714,8 +1926,6 @@ export default function SocidaPressApp() {
       }
       setMetadata(meta);
 
-
-
       setProgress(100);
       setProgressLabel("Listo");
       setImages(foundImages);
@@ -1763,10 +1973,7 @@ export default function SocidaPressApp() {
   );
 
   const canFinish =
-    metadata.periodico.trim() &&
-    metadata.titulo.trim() &&
-    metadata.fecha &&
-    metadata.hora;
+    metadata.periodico.trim() && metadata.titulo.trim() && metadata.fecha && metadata.hora;
 
   // Construye el objeto persistente a partir del estado actual de edición.
   const buildSavedNoticia = (id: string, createdAt: number): SavedNoticia => ({
@@ -1789,7 +1996,6 @@ export default function SocidaPressApp() {
         imagenPagina: pi?.fullDataUrl ?? null,
 
         imagenSeleccion: t.cropDataUrl ?? pi?.cropDataUrl ?? null,
-
       };
     }),
     imagenes: finalImages.map((i) => ({
@@ -1823,7 +2029,6 @@ export default function SocidaPressApp() {
     persist(saved.map((n) => (n.id === updated.id ? { ...updated, updatedAt: Date.now() } : n)));
   };
 
-
   const handleExport = () => {
     const payload = {
       periodico: metadata.periodico,
@@ -1844,7 +2049,6 @@ export default function SocidaPressApp() {
           imagenPagina: pi?.fullDataUrl ?? null,
           zona: t.zona ?? 1,
           imagenSeleccion: t.cropDataUrl ?? pi?.cropDataUrl ?? null,
-
         };
       }),
       imagenes: finalImages.map((i) => ({
@@ -1865,9 +2069,8 @@ export default function SocidaPressApp() {
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
-    a.download = `${metadata.periodico}-${metadata.titulo}`
-      .replace(/[^\w\-]+/g, "_")
-      .slice(0, 80) + ".json";
+    a.download =
+      `${metadata.periodico}-${metadata.titulo}`.replace(/[^\w\-]+/g, "_").slice(0, 80) + ".json";
     a.click();
     URL.revokeObjectURL(url);
   };
@@ -1908,7 +2111,6 @@ export default function SocidaPressApp() {
         </div>
       </header>
 
-
       <main className="mx-auto max-w-5xl px-6 py-8">
         {stage === "form" && (
           <Card>
@@ -1927,25 +2129,18 @@ export default function SocidaPressApp() {
                 />
                 {file && (
                   <p className="text-xs text-muted-foreground">
-                    Seleccionado: {file.name} (
-                    {(file.size / 1024 / 1024).toFixed(2)} MB)
+                    Seleccionado: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                   </p>
                 )}
                 <p className="text-xs text-muted-foreground">
-                  Sube el PDF y en el siguiente paso podrás marcar sobre cada
-                  página la zona exacta que quieres escanear (opcional). Después
-                  SocidaPress detectará automáticamente el periódico, el título,
-                  la fecha y la hora.
+                  Sube el PDF y en el siguiente paso podrás marcar sobre cada página la zona exacta
+                  que quieres escanear (opcional). Después SocidaPress detectará automáticamente el
+                  periódico, el título, la fecha y la hora.
                 </p>
               </div>
 
               <div className="flex justify-end">
-                <Button
-                  onClick={loadPdfForRegion}
-                  disabled={!file}
-                  size="lg"
-                  className="gap-2"
-                >
+                <Button onClick={loadPdfForRegion} disabled={!file} size="lg" className="gap-2">
                   <FileUp className="h-4 w-4" />
                   Continuar
                 </Button>
@@ -1959,9 +2154,8 @@ export default function SocidaPressApp() {
             <CardHeader>
               <CardTitle>Marca la zona a escanear</CardTitle>
               <p className="text-sm text-muted-foreground">
-                Arrastra con el ratón sobre cada página para marcar una o
-                varias zonas. Se escaneará <b>sólo</b> lo que marques. Usa los
-                botones de girar si la página aparece torcida.
+                Arrastra con el ratón sobre cada página para marcar una o varias zonas. Se escaneará{" "}
+                <b>sólo</b> lo que marques. Usa los botones de girar si la página aparece torcida.
               </p>
             </CardHeader>
             <CardContent className="space-y-6">
@@ -1979,9 +2173,7 @@ export default function SocidaPressApp() {
                       return n;
                     })
                   }
-                  onRotate={(rot) =>
-                    setRotations((prev) => ({ ...prev, [t.page]: rot }))
-                  }
+                  onRotate={(rot) => setRotations((prev) => ({ ...prev, [t.page]: rot }))}
                 />
               ))}
               <div className="flex justify-between">
@@ -1996,7 +2188,6 @@ export default function SocidaPressApp() {
           </Card>
         )}
 
-
         {stage === "processing" && (
           <Card>
             <CardHeader>
@@ -2021,8 +2212,7 @@ export default function SocidaPressApp() {
               <CardHeader>
                 <CardTitle>Datos de la noticia</CardTitle>
                 <p className="text-sm text-muted-foreground">
-                  Extraídos automáticamente del PDF. Revísalos y edítalos si es
-                  necesario.
+                  Extraídos automáticamente del PDF. Revísalos y edítalos si es necesario.
                 </p>
               </CardHeader>
               <CardContent className="space-y-4">
@@ -2032,9 +2222,7 @@ export default function SocidaPressApp() {
                     <Input
                       id="periodico"
                       value={metadata.periodico}
-                      onChange={(e) =>
-                        setMetadata({ ...metadata, periodico: e.target.value })
-                      }
+                      onChange={(e) => setMetadata({ ...metadata, periodico: e.target.value })}
                       placeholder="Ej. El País"
                     />
                   </div>
@@ -2043,9 +2231,7 @@ export default function SocidaPressApp() {
                     <Input
                       id="titulo"
                       value={metadata.titulo}
-                      onChange={(e) =>
-                        setMetadata({ ...metadata, titulo: e.target.value })
-                      }
+                      onChange={(e) => setMetadata({ ...metadata, titulo: e.target.value })}
                       placeholder="Titular"
                     />
                   </div>
@@ -2055,9 +2241,7 @@ export default function SocidaPressApp() {
                       id="fecha"
                       type={metadata.fecha === "por determinar" ? "text" : "date"}
                       value={metadata.fecha}
-                      onChange={(e) =>
-                        setMetadata({ ...metadata, fecha: e.target.value })
-                      }
+                      onChange={(e) => setMetadata({ ...metadata, fecha: e.target.value })}
                     />
                   </div>
                   <div className="space-y-2">
@@ -2066,12 +2250,9 @@ export default function SocidaPressApp() {
                       id="hora"
                       type={metadata.hora === "por determinar" ? "text" : "time"}
                       value={metadata.hora}
-                      onChange={(e) =>
-                        setMetadata({ ...metadata, hora: e.target.value })
-                      }
+                      onChange={(e) => setMetadata({ ...metadata, hora: e.target.value })}
                     />
                   </div>
-
                 </div>
               </CardContent>
             </Card>
@@ -2124,15 +2305,11 @@ export default function SocidaPressApp() {
 
             <Card>
               <CardHeader>
-                <CardTitle>
-                  Bloques de texto detectados ({textBlocks.length})
-                </CardTitle>
+                <CardTitle>Bloques de texto detectados ({textBlocks.length})</CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                 {textBlocks.length === 0 ? (
-                  <p className="text-sm text-muted-foreground">
-                    No se ha extraído texto por OCR.
-                  </p>
+                  <p className="text-sm text-muted-foreground">No se ha extraído texto por OCR.</p>
                 ) : (
                   textBlocks.map((b) => {
                     const selected = selectedTextIds.has(b.id);
@@ -2172,9 +2349,7 @@ export default function SocidaPressApp() {
                             onChange={(e) => {
                               const v = e.target.value;
                               setTextBlocks((prev) =>
-                                prev.map((x) =>
-                                  x.id === b.id ? { ...x, titulo: v } : x,
-                                ),
+                                prev.map((x) => (x.id === b.id ? { ...x, titulo: v } : x)),
                               );
                             }}
                             className="font-semibold"
@@ -2187,9 +2362,7 @@ export default function SocidaPressApp() {
                               onChange={(e) => {
                                 const v = e.target.value;
                                 setTextBlocks((prev) =>
-                                  prev.map((x) =>
-                                    x.id === b.id ? { ...x, fecha: v } : x,
-                                  ),
+                                  prev.map((x) => (x.id === b.id ? { ...x, fecha: v } : x)),
                                 );
                               }}
                             />
@@ -2200,9 +2373,7 @@ export default function SocidaPressApp() {
                               onChange={(e) => {
                                 const v = e.target.value;
                                 setTextBlocks((prev) =>
-                                  prev.map((x) =>
-                                    x.id === b.id ? { ...x, hora: v } : x,
-                                  ),
+                                  prev.map((x) => (x.id === b.id ? { ...x, hora: v } : x)),
                                 );
                               }}
                             />
@@ -2213,9 +2384,7 @@ export default function SocidaPressApp() {
                             onChange={(e) => {
                               const v = e.target.value;
                               setTextBlocks((prev) =>
-                                prev.map((x) =>
-                                  x.id === b.id ? { ...x, text: v } : x,
-                                ),
+                                prev.map((x) => (x.id === b.id ? { ...x, text: v } : x)),
                               );
                             }}
                             className="min-h-24 text-sm"
@@ -2276,16 +2445,9 @@ export default function SocidaPressApp() {
                     {finalTexts.map((t) => {
                       const pi = pageImages.find((p) => p.page === t.page);
                       return (
-                        <div
-                          key={t.id}
-                          className="space-y-3 rounded-md border bg-muted/30 p-4"
-                        >
+                        <div key={t.id} className="space-y-3 rounded-md border bg-muted/30 p-4">
                           <div className="space-y-1">
-                            {t.titulo && (
-                              <h4 className="text-base font-semibold">
-                                {t.titulo}
-                              </h4>
-                            )}
+                            {t.titulo && <h4 className="text-base font-semibold">{t.titulo}</h4>}
                             <p className="text-xs text-muted-foreground">
                               Página {t.page} · {t.fecha || "fecha por determinar"} ·{" "}
                               {t.hora || "hora por determinar"}
@@ -2295,11 +2457,7 @@ export default function SocidaPressApp() {
                             <div className="grid gap-3 md:grid-cols-2">
                               {pi?.fullDataUrl && (
                                 <figure className="space-y-1">
-                                  <a
-                                    href={pi.fullDataUrl}
-                                    target="_blank"
-                                    rel="noreferrer"
-                                  >
+                                  <a href={pi.fullDataUrl} target="_blank" rel="noreferrer">
                                     <img
                                       src={pi.fullDataUrl}
                                       alt={`Página ${t.page} completa`}
@@ -2314,11 +2472,7 @@ export default function SocidaPressApp() {
                               )}
                               {pi?.cropDataUrl && (
                                 <figure className="space-y-1">
-                                  <a
-                                    href={pi.cropDataUrl}
-                                    target="_blank"
-                                    rel="noreferrer"
-                                  >
+                                  <a href={pi.cropDataUrl} target="_blank" rel="noreferrer">
                                     <img
                                       src={pi.cropDataUrl}
                                       alt={`Selección de la página ${t.page}`}
@@ -2366,7 +2520,6 @@ export default function SocidaPressApp() {
           />
         )}
       </main>
-
     </div>
   );
 }

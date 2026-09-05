import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(appRoot, "public", "ocr");

const assets = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    "tesseract-core-lstm.wasm.js"
  ],
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  [
    "node_modules/@tesseract.js-data/nor/4.0.0_best_int/nor.traineddata.gz",
    "nor.traineddata.gz"
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "eng.traineddata.gz"
  ]
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  assets.map(([source, destination]) =>
    copyFile(resolve(appRoot, source), resolve(outputDirectory, destination))
  )
);

console.log(`Prepared ${assets.length} browser OCR assets.`);

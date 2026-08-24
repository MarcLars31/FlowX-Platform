import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
      ]
    }];
  },
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "exceljs",
    "tesseract.js"
  ],
  // Tesseract starts a Node worker from a path that is resolved at runtime.
  // Include its worker and runtime files in the serverless function bundle;
  // Next's static tracer cannot discover those files on its own.
  outputFileTracingIncludes: {
    "/api/technical-descriptions": [
      "./node_modules/tesseract.js/src/worker-script/**/*",
      "./node_modules/tesseract.js/src/worker/**/*",
      "./node_modules/tesseract.js/src/constants/**/*",
      "./node_modules/tesseract.js/src/utils/**/*",
      "./node_modules/tesseract.js/src/createJob.js",
      "./node_modules/tesseract.js/src/createScheduler.js",
      "./node_modules/tesseract.js/src/Tesseract.js",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*"
    ]
  }
};

export default nextConfig;

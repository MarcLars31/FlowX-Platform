import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".flowx-next/**",
    ".open-next/**",
    "node_modules/**",
    "out/**",
    "dist/**",
    "dist-old-*/**",
    "public/ocr/**",
    "tmp/**",
    "next-env.d.ts"
  ])
]);

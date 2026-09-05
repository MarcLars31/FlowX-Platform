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
  // The browser bundle supports writeBuffer() without pulling ExcelJS' legacy
  // filesystem readers (fstream/mkdirp) into the Cloudflare Worker startup.
  turbopack: {
    resolveAlias: {
      exceljs: "exceljs/dist/exceljs.min.js"
    }
  }
};

export default nextConfig;

import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const grayscale = {
  50: "#fafafa", 100: "#eeeeee", 200: "#c6c6c6", 300: "#a0a0a0",
  400: "#767676", 500: "#626262", 600: "#4d4d4d", 700: "#3b3b3b",
  800: "#292929", 900: "#202020", 950: "#111111"
};

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    // Keep existing semantic color names usable throughout the application,
    // while every generated utility uses the same neutral, high-contrast scale.
    colors: {
      inherit: "inherit", current: "currentColor", transparent: "transparent",
      black: "#000000", white: "#ffffff",
      ...Object.fromEntries([
        "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
        "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
        "indigo", "violet", "purple", "fuchsia", "pink", "rose", "ink", "flow"
      ].map(name => [name, grayscale])),
      portal: { face: "#f1f1f1", hover: "#e7e7e7", line: "#bdbdbd", paper: "#ffffff" }
    },
    fontFamily: { sans: ["Segoe UI", "Arial", "sans-serif"] },
    fontSize: {
      xs: ["0.75rem", "1rem"], sm: ["0.8125rem", "1.125rem"],
      base: ["0.875rem", "1.25rem"], lg: ["1rem", "1.375rem"],
      xl: ["1.125rem", "1.5rem"], "2xl": ["1.25rem", "1.625rem"],
      "3xl": ["1.5rem", "1.875rem"], "4xl": ["1.75rem", "2rem"],
      "5xl": ["2rem", "2.25rem"], "6xl": ["2.25rem", "2.5rem"]
    },
    borderRadius: Object.fromEntries(["none", "sm", "DEFAULT", "md", "lg", "xl", "2xl", "3xl", "full"].map(name => [name, name === "none" ? "0" : "2px"])),
    boxShadow: {
      sm: "none", DEFAULT: "none", md: "none", lg: "none", xl: "none",
      "2xl": "none", soft: "none", inner: "none", none: "none"
    },
    extend: {
      fontWeight: { black: "600", extrabold: "600", bold: "600" }
    }
  },
  plugins: [forms]
};

export default config;

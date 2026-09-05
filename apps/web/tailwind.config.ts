import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f8fa",
          100: "#eef1f4",
          200: "#d8dee6",
          300: "#b9c3d0",
          400: "#8c9aab",
          500: "#647386",
          600: "#4a5666",
          700: "#333e4d",
          800: "#202938",
          900: "#111827",
          950: "#0b1120"
        },
        flow: {
          50: "#effbfd",
          100: "#d5f5f9",
          200: "#b0eaf2",
          300: "#7ad8e6",
          400: "#3bbbd0",
          500: "#209fb7",
          600: "#1d7f98",
          700: "#1f667b",
          800: "#225467",
          900: "#214657"
        }
      },
      boxShadow: {
        soft: "0 16px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: [forms]
};

export default config;

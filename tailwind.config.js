/** @type {import('tailwindcss').Config} */
// "Chapa e Ferro" tokens — keep these literal values in sync with
// src/theme/tokens.ts. This file runs in plain Node (not through the app's
// Metro/TypeScript pipeline), so it can't import the .ts token file directly.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#141414",
        surface: "#1F1F1F",
        border: "#2E2E2E",
        text: "#EDEDED",
        muted: "#8A8A8A",
        accent: "#E8442A",
        success: "#4A7C59",
        green: "#7FFF00",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        base: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "6px",
      },
      fontFamily: {
        display: ["BarlowCondensed_900Black"],
        title: ["BarlowCondensed_700Bold"],
        "card-title": ["BarlowCondensed_600SemiBold"],
        body: ["Inter_400Regular"],
        "body-medium": ["Inter_500Medium"],
        label: ["Inter_600SemiBold"],
      },
    },
  },
  plugins: [],
};

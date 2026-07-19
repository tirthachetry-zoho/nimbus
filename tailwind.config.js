/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#14161B",
        panel: "#1B1E25",
        panel2: "#20232B",
        border: "#2A2E38",
        text: "#C7CCD6",
        muted: "#7A8194",
        accent: "#E8A548",
        accentDim: "#8A6A3A",
        method: {
          get: "#4FB8A6",
          post: "#E8A548",
          put: "#5B93D6",
          delete: "#E1636B",
          patch: "#B47FE0",
          query: "#3FB6C9",
          other: "#7A8194",
        },
        ok: "#4FB8A6",
        warn: "#E8A548",
        err: "#E1636B",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: "11px",
        sm: "12.5px",
        base: "13px",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
      },
    },
  },
  plugins: [],
};

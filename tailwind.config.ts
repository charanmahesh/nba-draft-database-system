import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {
    colors: {
      sage: { DEFAULT: "#A5A79B", deep: "#8E9084", light: "#B5B7AB" },
      cream: { DEFAULT: "#E8D2B5", light: "#F1E3CD", deep: "#D6BC98" },
      burgundy: { DEFAULT: "#590907", deep: "#3C0503", soft: "#7A1512" },
      ink: { DEFAULT: "#1A0505", soft: "#3A2222" },
      background: "hsl(var(--background) / <alpha-value>)", foreground: "hsl(var(--foreground) / <alpha-value>)",
      card: { DEFAULT: "hsl(var(--card) / <alpha-value>)", foreground: "hsl(var(--card-foreground) / <alpha-value>)" },
      popover: { DEFAULT: "hsl(var(--popover) / <alpha-value>)", foreground: "hsl(var(--popover-foreground) / <alpha-value>)" },
      primary: { DEFAULT: "hsl(var(--primary) / <alpha-value>)", foreground: "hsl(var(--primary-foreground) / <alpha-value>)" },
      secondary: { DEFAULT: "hsl(var(--secondary) / <alpha-value>)", foreground: "hsl(var(--secondary-foreground) / <alpha-value>)" },
      muted: { DEFAULT: "hsl(var(--muted) / <alpha-value>)", foreground: "hsl(var(--muted-foreground) / <alpha-value>)" },
      accent: { DEFAULT: "hsl(var(--accent) / <alpha-value>)", foreground: "hsl(var(--accent-foreground) / <alpha-value>)" },
      destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground) / <alpha-value>)" },
      border: "hsl(var(--border) / <alpha-value>)", input: "hsl(var(--input) / <alpha-value>)", ring: "hsl(var(--ring) / <alpha-value>)",
      chart: { 1: "hsl(var(--chart-1))", 2: "hsl(var(--chart-2))", 3: "hsl(var(--chart-3))", 4: "hsl(var(--chart-4))", 5: "hsl(var(--chart-5))" },
      sidebar: { DEFAULT:"hsl(var(--sidebar-background))", foreground:"hsl(var(--sidebar-foreground))", primary:"hsl(var(--sidebar-primary))", "primary-foreground":"hsl(var(--sidebar-primary-foreground))", accent:"hsl(var(--sidebar-accent))", "accent-foreground":"hsl(var(--sidebar-accent-foreground))", border:"hsl(var(--sidebar-border))" },
    },
    borderRadius: { lg:"var(--radius)", md:"calc(var(--radius) - 2px)", sm:"calc(var(--radius) - 4px)", card:"16px" },
    fontFamily: { display:['"Bebas Neue"', "Anton", "Oswald", "sans-serif"], heading:["var(--font-heading)"], body:["var(--font-body)"], serif:['"Cormorant Garamond"',"Georgia","serif"], mono:["var(--font-mono)"] },
  } }, plugins: [],
};
export default config;

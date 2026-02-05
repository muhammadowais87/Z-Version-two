import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          glow: "hsl(var(--success-glow))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      backgroundImage: {
        "gradient-vibrant": "var(--gradient-vibrant)",
        "gradient-success": "var(--gradient-success)",
        "gradient-purple": "var(--gradient-purple)",
        "gradient-pink": "var(--gradient-pink)",
        "gradient-hyper": "var(--gradient-hyper)",
        "gradient-blob": "var(--gradient-blob)",
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        "success-glow": "var(--shadow-success)",
        "pink-glow": "var(--shadow-pink)",
        "mint-glow": "var(--shadow-mint)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "fade-in-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(20px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "scale-in": {
          "0%": {
            transform: "scale(0.95)",
            opacity: "0",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        blob: {
          "0%, 100%": { 
            transform: "translate(0, 0) scale(1)",
            opacity: "0.6"
          },
          "25%": { 
            transform: "translate(20px, -30px) scale(1.1)",
            opacity: "0.8"
          },
          "50%": { 
            transform: "translate(-20px, 20px) scale(0.9)",
            opacity: "0.5"
          },
          "75%": { 
            transform: "translate(30px, 10px) scale(1.05)",
            opacity: "0.7"
          },
        },
        "blob-slow": {
          "0%, 100%": { 
            transform: "translate(0, 0) scale(1) rotate(0deg)",
            opacity: "0.5"
          },
          "33%": { 
            transform: "translate(-30px, 30px) scale(1.15) rotate(120deg)",
            opacity: "0.7"
          },
          "66%": { 
            transform: "translate(20px, -20px) scale(0.85) rotate(240deg)",
            opacity: "0.4"
          },
        },
        morph: {
          "0%, 100%": {
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            transform: "translate(0, 0) rotate(0deg) scale(1)",
          },
          "25%": {
            borderRadius: "30% 60% 70% 40% / 50% 60% 30% 60%",
            transform: "translate(20px, -30px) rotate(90deg) scale(1.05)",
          },
          "50%": {
            borderRadius: "50% 60% 30% 60% / 30% 60% 70% 40%",
            transform: "translate(-20px, 20px) rotate(180deg) scale(0.95)",
          },
          "75%": {
            borderRadius: "60% 40% 60% 40% / 70% 30% 50% 60%",
            transform: "translate(30px, 10px) rotate(270deg) scale(1.02)",
          },
        },
        "morph-reverse": {
          "0%, 100%": {
            borderRadius: "40% 60% 70% 30% / 40% 70% 30% 60%",
            transform: "translate(0, 0) rotate(0deg) scale(1)",
          },
          "25%": {
            borderRadius: "70% 30% 50% 50% / 30% 50% 70% 50%",
            transform: "translate(-30px, 20px) rotate(-90deg) scale(1.08)",
          },
          "50%": {
            borderRadius: "30% 70% 40% 60% / 60% 40% 60% 40%",
            transform: "translate(20px, -20px) rotate(-180deg) scale(0.92)",
          },
          "75%": {
            borderRadius: "50% 50% 60% 40% / 50% 60% 40% 60%",
            transform: "translate(-10px, 30px) rotate(-270deg) scale(1.03)",
          },
        },
        "float-blob": {
          "0%, 100%": {
            transform: "translate(0, 0) scale(1)",
          },
          "33%": {
            transform: "translate(30px, -40px) scale(1.1)",
          },
          "66%": {
            transform: "translate(-20px, 20px) scale(0.9)",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "0.4",
            transform: "scale(1)",
          },
          "50%": {
            opacity: "0.8",
            transform: "scale(1.2)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
        shimmer: "shimmer 2s linear infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        blob: "blob 12s ease-in-out infinite",
        "blob-slow": "blob-slow 20s ease-in-out infinite",
        morph: "morph 15s ease-in-out infinite",
        "morph-reverse": "morph-reverse 18s ease-in-out infinite",
        "float-blob": "float-blob 12s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1440px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Redesign (design.md §1): dourado de TEXTO (AA) + status semânticos
        // em par texto+fundo. Nunca usar gray-*/white/black em chrome.
        'primary-text': 'hsl(var(--primary-text))',
        // Linhas internas das grades da Agenda (agenda-handoff §0.1).
        grid: 'hsl(var(--grid))',
        ok: {
          DEFAULT: 'hsl(var(--ok))',
          bg: 'hsl(var(--ok-bg))',
        },
        warn: {
          DEFAULT: 'hsl(var(--warn))',
          bg: 'hsl(var(--warn-bg))',
        },
        'info-t': 'hsl(var(--info-t))',
        'info-bg': 'hsl(var(--info-bg))',
        success: {
          DEFAULT: 'hsl(142, 71%, 45%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        warning: {
          DEFAULT: 'hsl(38, 92%, 50%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        critical: {
          DEFAULT: 'hsl(0, 72%, 51%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        info: {
          DEFAULT: 'hsl(217, 91%, 60%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Sombra tingida (design.md §1) — cards e popovers do redesign.
      boxShadow: {
        card: '0 1px 2px hsl(var(--shadow) / var(--shadow-a))',
        pop: '0 16px 40px -12px hsl(var(--shadow) / calc(var(--shadow-a) * 3.5))',
        overlay: '0 20px 44px -14px hsl(var(--shadow) / calc(var(--shadow-a) * 4))',
      },
      // Motion do redesign (design.md §7) — tokens nomeados. As formas
      // arbitrárias `duration-[Xms]`/`ease-[cubic-bezier(…)]` disparam warning
      // de ambiguidade no build (o plugin tailwindcss-animate também registra
      // `duration-`/`ease-` p/ animation) — use estes nomes.
      transitionDuration: {
        '160': '160ms',
        '180': '180ms',
        '250': '250ms',
        '320': '320ms',
        '340': '340ms',
      },
      transitionTimingFunction: {
        // Overshoot leve: pílula segmentada, underline de aba, chevron.
        senno: 'cubic-bezier(.34,1.1,.5,1)',
        // In-out padrão: busca colapsável, altura expansível (grid-rows).
        'senno-io': 'cubic-bezier(.4,0,.2,1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    // fit-file-parser is a CJS lib that expects a `global`; point it at window.
    define: { ...processEnvDefines, global: 'window' },
    optimizeDeps: {
      include: ['fit-file-parser', 'buffer'],
    },
  };
})

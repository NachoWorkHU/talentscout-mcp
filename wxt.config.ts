import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TalentScout MCP',
    description: 'Agente de Reclutamiento basado en WebMCP',
    permissions: ['sidePanel', 'scripting', 'activeTab', 'storage'],
    action: {}, // Necesario para activar el sidepanel
    side_panel: {
      default_path: 'sidepanel.html', // WXT genera la ruta automáticamente desde entrypoints/sidepanel/
    },
  },
});

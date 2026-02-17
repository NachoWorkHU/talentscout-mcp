/**
 * Background Service Worker — Cerebro del Agente
 *
 * Orquesta la comunicación entre content scripts, side panel,
 * y los servicios de IA para el flujo de extracción WebMCP.
 */
export default defineBackground(() => {
    console.log('[TalentScout MCP] Background service worker iniciado', {
        id: browser.runtime.id,
    });

    // Abrir el side panel al hacer clic en el ícono de la extensión
    browser.action.onClicked.addListener(async (tab) => {
        if (tab.id) {
            // sidePanel API exists at runtime but WXT doesn't fully type it yet
            await (browser.sidePanel as any).open({ tabId: tab.id });
        }
    });
});

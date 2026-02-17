/**
 * Content Script — Punto de entrada WXT
 *
 * Se inyecta en todas las URLs y escucha mensajes del background/sidepanel.
 * Delega la lógica de visión a dom_observer.ts.
 */
import { mapDOM, extractByIds } from './dom_observer';
import type { BackgroundMessage, ContentResponse } from '@/src/shared/messaging';
import { log } from '@/src/utils/logger';

export default defineContentScript({
    matches: ['<all_urls>'],

    main() {
        log.info('Content script cargado en:', window.location.href);

        // Listener de mensajes del background / sidepanel
        browser.runtime.onMessage.addListener(
            (
                message: BackgroundMessage,
                _sender: any,
                sendResponse: (response: ContentResponse) => void,
            ) => {
                try {
                    switch (message.type) {
                        case 'ANALYZE_PAGE': {
                            log.info('Ejecutando ANALYZE_PAGE...');
                            const domSnapshot = mapDOM(true);
                            sendResponse({ success: true, data: domSnapshot });
                            break;
                        }

                        case 'EXTRACT_DATA': {
                            log.info('Ejecutando EXTRACT_DATA para IDs:', message.ids);
                            const extracted = extractByIds(message.ids);
                            sendResponse({ success: true, data: extracted });
                            break;
                        }

                        default: {
                            log.warn('Mensaje desconocido:', message);
                            sendResponse({
                                success: false,
                                error: `Tipo de mensaje desconocido: ${(message as { type: string }).type}`,
                            });
                        }
                    }
                } catch (err) {
                    log.error('Error procesando mensaje:', err);
                    sendResponse({
                        success: false,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }

                // Retornar true es CRÍTICO: indica a Chrome que sendResponse será
                // llamado de forma asíncrona (mantiene el canal de mensajes abierto).
                return true;
            },
        );
    },
});

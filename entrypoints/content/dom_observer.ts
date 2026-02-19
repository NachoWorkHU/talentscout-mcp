/**
 * DOM Observer — Módulo de Visión Semántica (WebMCP Grounding)
 *
 * Recorre el DOM visible, asigna IDs numéricos temporales (data-mcp-id)
 * a elementos relevantes y devuelve una representación textual compacta
 * que la IA puede interpretar fácilmente.
 *
 * Incorpora "Zonas Prohibidas" para excluir chats, navegación, modales
 * y otros overlays ruidosos que contaminan el análisis de perfiles.
 */

/** Selectores de elementos que contienen información textual relevante */
const TEXT_SELECTORS = 'h1, h2, h3, h4, p, span, li, article, section, div';

/** Selectores de elementos interactivos */
const INTERACTIVE_SELECTORS = 'a, button';

/** Todos los selectores combinados */
const ALL_SELECTORS = `${TEXT_SELECTORS}, ${INTERACTIVE_SELECTORS}`;

/** Longitud máxima del texto extraído por elemento */
const MAX_TEXT_LENGTH = 200;

/** Estilo de debug visual inyectado en los elementos mapeados */
const DEBUG_OUTLINE = '1px dashed #e6007e';

/** Atributo de anclaje MCP */
const MCP_ATTR = 'data-mcp-id';

// ─────────────────────────────────────────────────────────
// 🚫 ZONAS PROHIBIDAS — Selectores de zonas ruidosas a excluir
// ─────────────────────────────────────────────────────────
const FORBIDDEN_ZONES: string[] = [
    // ── LinkedIn Messaging / Chat ──
    '.msg-overlay-list-bubble',            // burbuja de chat minimizada
    '.msg-overlay-conversation-bubble',    // conversación de chat abierta
    '.msg-overlay-bubble-header',          // encabezado de burbuja
    'aside.msg-overlay-container',         // contenedor principal de mensajes overlay
    '.msg-convo-wrapper',                  // wrapper de conversación completa
    '.msg-s-message-list-container',       // lista de mensajes
    '.msg-s-event-listitem',              // item individual de mensaje
    '[data-control-name="overlay.close_conversation_window"]', // botón cerrar
    '.msg-form',                           // formulario de envío de mensaje

    // ── LinkedIn Navigation ──
    '#global-nav',                         // barra de navegación superior
    '.global-nav',                         // navegación global (class)
    'header.global-nav__header',           // header de navegación

    // ── LinkedIn Footer ──
    'footer',                              // footer genérico
    '.global-footer',                      // footer de LinkedIn
    '.li-footer',                          // footer alternativo

    // ── LinkedIn Modales & Overlays ──
    '.artdeco-modal-overlay',              // overlay de modal
    '.artdeco-modal',                      // modal genérico de LinkedIn
    '.artdeco-toast-item',                 // toast/notificaciones
    '.premium-upsell',                     // prompts de LinkedIn Premium

    // ── LinkedIn Ads & Sidebar derecho ──
    '.ad-banner-container',                // anuncios
    '.scaffold-layout__aside',             // panel lateral derecho (ads/sugerencias)
    '.feed-follows-module',                // módulo "a quién seguir"

    // ── Genéricos de seguridad ──
    '[role="dialog"]',                     // cualquier dialog abierto
    '[role="alertdialog"]',                // diálogos de alerta
    '[aria-label="Messaging"]',            // contenedor de mensajería por aria-label
];

/** Selector CSS combinado de todas las zonas prohibidas */
const FORBIDDEN_SELECTOR = FORBIDDEN_ZONES.join(', ');

/**
 * Verifica si un elemento está dentro de una "Zona Prohibida".
 * Usa `Element.closest()` para recorrer la cadena de ancestros.
 */
function isInsideForbiddenZone(el: Element): boolean {
    try {
        return el.closest(FORBIDDEN_SELECTOR) !== null;
    } catch {
        // Si algún selector es inválido, fallar de forma segura
        return false;
    }
}

/**
 * Determina el nodo raíz óptimo para el escaneo.
 * Prioriza `<main>` (donde LinkedIn pone el contenido del perfil)
 * y cae gracefully a `document.body` si no existe.
 */
function getScanRoot(): Element {
    return document.querySelector('main') ?? document.body;
}

/**
 * Extrae el texto directo de un nodo, ignorando texto de hijos.
 * Esto evita duplicación cuando nodos padres contienen nodos hijos
 * que ya fueron mapeados por separado.
 */
function getDirectText(element: Element): string {
    let text = '';
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? '';
        }
    }
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Set of elements mapped in the last run.
 * Used for efficient cleanup without querySelectorAll.
 */
let _mappedElements: Set<HTMLElement> = new Set();

/**
 * Limpia IDs y estilos de debug de una ejecución anterior.
 * Itera solo los elementos previamente registrados.
 */
function clearPreviousMapping(): void {
    try {
        for (const el of _mappedElements) {
            el.removeAttribute(MCP_ATTR);
            el.style.outline = '';
        }
        _mappedElements.clear();
    } catch (err) {
        console.warn('[TalentScout MCP] Error al limpiar mapeo anterior:', err);
        _mappedElements.clear();
    }
}

/**
 * Determina si un elemento es visible en el viewport.
 * Optimized: uses cheap offsetWidth/Height pre-check before getComputedStyle.
 */
function isVisible(el: HTMLElement): boolean {
    // offsetParent === null covers display:none and detached elements
    if (el.offsetParent === null && el.tagName !== 'BODY') return false;
    // Zero-size elements are invisible (cheap check, no layout recalc)
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    // Only call getComputedStyle for visibility/opacity edge cases
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Mapea el DOM de la página actual, asignando IDs numéricos temporales
 * y devolviendo una representación textual compacta.
 *
 * Aplica dos capas de filtrado:
 *   1. Scoping: escanea desde `<main>` en vez de `document.body`.
 *   2. Exclusión: descarta cualquier elemento dentro de una Zona Prohibida.
 *
 * @param debug  Si es true, aplica outline visual rosa a los elementos mapeados.
 * @returns      Representación textual con formato `[N] <TAG> "texto..."` por línea.
 */
export function mapDOM(debug = true): string {
    // Limpiar cualquier mapeo previo
    clearPreviousMapping();

    const lines: string[] = [];
    let counter = 0;

    try {
        // 🎯 Capa 1: Scoping — preferir <main> como raíz de escaneo
        const root = getScanRoot();
        const elements = root.querySelectorAll(ALL_SELECTORS);

        for (const el of elements) {
            const htmlEl = el as HTMLElement;

            // Saltar elementos no visibles
            if (!isVisible(htmlEl)) continue;

            // 🚫 Capa 2: Exclusión — saltar elementos en Zonas Prohibidas
            if (isInsideForbiddenZone(el)) continue;

            // Extraer texto directo del elemento (no de sus hijos)
            let text = getDirectText(el);

            // Para links, incluir el href como contexto adicional
            if (el.tagName === 'A') {
                const href = el.getAttribute('href') ?? '';
                if (href && text) {
                    text = `${text} → ${href}`;
                } else if (href && !text) {
                    text = href;
                }
            }

            // Para buttons sin texto directo, buscar aria-label o title
            if (el.tagName === 'BUTTON' && !text) {
                text =
                    el.getAttribute('aria-label') ??
                    el.getAttribute('title') ??
                    '';
            }

            // Saltar elementos sin contenido textual relevante
            if (!text || text.length < 2) continue;

            // Truncar texto largo
            if (text.length > MAX_TEXT_LENGTH) {
                text = text.substring(0, MAX_TEXT_LENGTH) + '…';
            }

            // Asignar ID de anclaje
            counter++;
            htmlEl.setAttribute(MCP_ATTR, String(counter));
            _mappedElements.add(htmlEl);

            // Debug visual: outline rosa
            if (debug) {
                htmlEl.style.outline = DEBUG_OUTLINE;
                htmlEl.style.position = htmlEl.style.position || 'relative';
            }

            // Formatear línea
            const tag = el.tagName;
            lines.push(`[${counter}] <${tag}> "${text}"`);
        }
    } catch (err) {
        console.error('[TalentScout MCP] Error en mapDOM():', err);
        return `[ERROR] No se pudo mapear el DOM: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (lines.length === 0) {
        return '[EMPTY] No se encontraron elementos relevantes en la página.';
    }

    return lines.join('\n');
}

/**
 * Extrae datos de elementos específicos por sus IDs de anclaje MCP.
 *
 * @param ids  Array de IDs numéricos (data-mcp-id) a extraer.
 * @returns    Objeto con los datos extraídos de cada ID.
 */
export function extractByIds(ids: number[]): Record<number, { tag: string; text: string; href?: string }> {
    const result: Record<number, { tag: string; text: string; href?: string }> = {};

    try {
        for (const id of ids) {
            const el = document.querySelector(`[${MCP_ATTR}="${id}"]`);
            if (!el) {
                result[id] = { tag: 'NOT_FOUND', text: '' };
                continue;
            }

            const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
            const entry: { tag: string; text: string; href?: string } = {
                tag: el.tagName,
                text: text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) + '…' : text,
            };

            if (el.tagName === 'A') {
                entry.href = el.getAttribute('href') ?? undefined;
            }

            result[id] = entry;
        }
    } catch (err) {
        console.error('[TalentScout MCP] Error en extractByIds():', err);
    }

    return result;
}

/**
 * DOM Observer — Módulo de Visión Semántica (WebMCP Grounding)
 *
 * Recorre el DOM visible, asigna IDs numéricos temporales (data-mcp-id)
 * a elementos relevantes y devuelve una representación textual compacta
 * que la IA puede interpretar fácilmente.
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
 * Limpia IDs y estilos de debug de una ejecución anterior.
 * Esto permite ejecutar mapDOM() múltiples veces sin acumular basura.
 */
function clearPreviousMapping(): void {
    try {
        const previouslyMapped = document.querySelectorAll(`[${MCP_ATTR}]`);
        for (const el of previouslyMapped) {
            el.removeAttribute(MCP_ATTR);
            (el as HTMLElement).style.outline = '';
        }
    } catch (err) {
        console.warn('[TalentScout MCP] Error al limpiar mapeo anterior:', err);
    }
}

/**
 * Determina si un elemento es visible en el viewport.
 * Descarta elementos ocultos (display:none, visibility:hidden, etc.)
 */
function isVisible(el: HTMLElement): boolean {
    if (el.offsetParent === null && el.tagName !== 'BODY') return false;
    const style = window.getComputedStyle(el);
    return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
    );
}

/**
 * Mapea el DOM de la página actual, asignando IDs numéricos temporales
 * y devolviendo una representación textual compacta.
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
        const elements = document.body.querySelectorAll(ALL_SELECTORS);

        for (const el of elements) {
            const htmlEl = el as HTMLElement;

            // Saltar elementos no visibles
            if (!isVisible(htmlEl)) continue;

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

/**
 * Tipos de mensajes para comunicación entre content script, background y sidepanel.
 *
 * Estos tipos garantizan type-safety en todos los runtime.sendMessage / onMessage.
 */

// ─── Mensajes que el background/sidepanel envía al content script ───

export type BackgroundMessage =
    | { type: 'ANALYZE_PAGE' }
    | { type: 'EXTRACT_DATA'; ids: number[] };

// ─── Respuestas que el content script devuelve ───

export type ContentResponse =
    | { success: true; data: string }
    | { success: true; data: Record<number, { tag: string; text: string; href?: string }> }
    | { success: false; error: string };

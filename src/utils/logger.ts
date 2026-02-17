/**
 * Logger — Utilidad de logging para producción.
 *
 * En producción solo muestra warnings y errores.
 * En desarrollo muestra todo (activar con localStorage: talentscout_debug = "true").
 */

const PREFIX = '[TalentScout]';

function isDebug(): boolean {
    try {
        return localStorage.getItem('talentscout_debug') === 'true';
    } catch {
        return false;
    }
}

export const log = {
    /** Only logs in debug mode */
    info(...args: unknown[]) {
        if (isDebug()) {
            console.log(PREFIX, ...args);
        }
    },

    /** Always logs — use for recoverable issues */
    warn(...args: unknown[]) {
        console.warn(PREFIX, ...args);
    },

    /** Always logs — use for failures */
    error(...args: unknown[]) {
        console.error(PREFIX, ...args);
    },
};

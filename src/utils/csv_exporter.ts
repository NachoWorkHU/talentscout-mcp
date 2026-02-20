/**
 * downloadAsCSV — Genera y descarga un archivo CSV desde candidatos guardados.
 *
 * Usa punto y coma (;) como delimitador para compatibilidad con Excel ES/LatAm.
 * Incluye BOM UTF-8 para preservar tildes y eñes.
 */
import type { CandidateProfile } from '@/src/shared/types';

const DELIMITER = ';';

const CSV_HEADERS = [
    'Nombre',
    'Cargo',
    'Empresa',
    'Ubicación',
    'Email',
    'Teléfono',
    'URL Perfil',
    'Fuente',
    'Skills',
    'Certificaciones',
    'Fecha Captura',
];

/** Escapa un campo: lo envuelve en comillas si contiene el delimitador, saltos de línea o comillas dobles. */
function escapeField(value: string): string {
    if (!value) return '';
    // Duplicar comillas dobles internas
    const escaped = value.replace(/"/g, '""');
    // Envolver en comillas si contiene delimitador, salto de línea o comillas
    if (value.includes(DELIMITER) || value.includes('\n') || value.includes('"')) {
        return `"${escaped}"`;
    }
    return escaped;
}

/** Une elementos de un array con barra vertical para no interferir con el delimitador. */
function joinList(items: string[]): string {
    return items.join(' | ');
}

export function downloadAsCSV(candidates: CandidateProfile[]): void {
    if (candidates.length === 0) return;

    const rows = candidates.map((c) => [
        escapeField(c.fullName),
        escapeField(c.currentRole),
        escapeField(c.experience.length > 0 ? c.experience[0].company : ''),
        escapeField(c.location),
        escapeField(c.email ?? ''),
        escapeField(c.phone ?? ''),
        escapeField(c.profileUrl),
        escapeField(c.source),
        escapeField(joinList(c.skills)),
        escapeField(joinList(c.certifications ?? [])),
        escapeField(c.savedAt ?? ''),
    ]);

    const csvContent = [
        CSV_HEADERS.join(DELIMITER),
        ...rows.map((r) => r.join(DELIMITER)),
    ].join('\n');

    // BOM para que Excel interprete UTF-8 correctamente
    const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const date = new Date().toISOString().slice(0, 10);
    link.download = `talentscout_candidates_${date}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

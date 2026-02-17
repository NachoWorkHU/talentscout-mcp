/**
 * downloadAsCSV — Genera y descarga un archivo CSV desde candidatos guardados.
 *
 * Escapa comillas dobles y campos con comas (RFC 4180).
 * Incluye BOM UTF-8 para compatibilidad con Excel.
 */
import type { CandidateProfile } from '@/src/shared/types';

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

function escapeField(value: string): string {
    if (!value) return '';
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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
        escapeField(c.skills.join(', ')),
        escapeField((c.certifications ?? []).join(', ')),
        escapeField(c.savedAt ?? ''),
    ]);

    const csvContent = [
        CSV_HEADERS.join(','),
        ...rows.map((r) => r.join(',')),
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

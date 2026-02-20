/**
 * Tests for csv_exporter.ts
 *
 * Covers: delimiter, BOM, escaping, list joining, empty data, blob creation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── We need to test the internal logic, so we import and inspect the blob ──
// The module calls document.createElement, click, etc. — we mock those.

let appendedLink: HTMLAnchorElement | null = null;
let lastBlobContent: string | null = null;

beforeEach(() => {
    appendedLink = null;
    lastBlobContent = null;

    // Mock Blob to capture its content
    vi.stubGlobal(
        'Blob',
        class MockBlob {
            content: string;
            options: BlobPropertyBag;
            constructor(parts: BlobPart[], options?: BlobPropertyBag) {
                this.content = parts.join('');
                this.options = options ?? {};
                lastBlobContent = this.content;
            }
        },
    );

    // Mock URL.createObjectURL / revokeObjectURL without breaking URL constructor
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();

    // Mock link creation and click (use original createElement for non-'a')
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
            const link = {
                href: '',
                download: '',
                click: vi.fn(),
            } as unknown as HTMLAnchorElement;
            appendedLink = link;
            return link;
        }
        return origCreateElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
});

// Import after mocks are set up
import { downloadAsCSV } from '@/src/utils/csv_exporter';
import type { CandidateProfile } from '@/src/shared/types';

// ── Test data factory ──
function makeCandidateProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
    return {
        fullName: 'Juan Pérez',
        currentRole: 'Senior Developer',
        location: 'Buenos Aires, Argentina',
        profileUrl: 'https://linkedin.com/in/juanperez',
        source: 'linkedin',
        summary: 'Desarrollador fullstack',
        email: 'juan@example.com',
        phone: '+54 11 1234-5678',
        skills: ['React', 'TypeScript', 'Node.js'],
        experience: [{ company: 'Acme Corp', role: 'Dev Lead', duration: '3 años' }],
        certifications: ['AWS Solutions Architect', 'Scrum Master'],
        education: [{ institution: 'UBA', degree: 'Ing. Informática', year: '2018' }],
        status: 'saved',
        savedAt: '2026-01-15T10:00:00Z',
        ...overrides,
    };
}

describe('downloadAsCSV', () => {
    it('does nothing when candidates array is empty', () => {
        downloadAsCSV([]);
        expect(lastBlobContent).toBeNull();
        expect(appendedLink).toBeNull();
    });

    it('generates CSV with semicolon (;) delimiter', () => {
        downloadAsCSV([makeCandidateProfile()]);
        expect(lastBlobContent).not.toBeNull();
        // Header row should use semicolons
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        expect(lines[0]).toContain(';');
        expect(lines[0]).not.toMatch(/(?<!"),[^;]/); // no bare commas as delimiters
    });

    it('includes BOM (\\uFEFF) at the start of the blob', () => {
        downloadAsCSV([makeCandidateProfile()]);
        expect(lastBlobContent!.charCodeAt(0)).toBe(0xfeff);
    });

    it('has correct CSV headers', () => {
        downloadAsCSV([makeCandidateProfile()]);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        const headers = lines[0].split(';');
        expect(headers).toEqual([
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
        ]);
    });

    it('joins skills with pipe (|) separator', () => {
        downloadAsCSV([makeCandidateProfile({ skills: ['React', 'Vue', 'Angular'] })]);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        const dataRow = lines[1];
        expect(dataRow).toContain('React | Vue | Angular');
    });

    it('joins certifications with pipe (|) separator', () => {
        downloadAsCSV([makeCandidateProfile({ certifications: ['AWS', 'GCP'] })]);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        const dataRow = lines[1];
        expect(dataRow).toContain('AWS | GCP');
    });

    it('escapes fields containing semicolons by wrapping in double quotes', () => {
        downloadAsCSV([makeCandidateProfile({ fullName: 'Apellido; Nombre' })]);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        expect(lines[1]).toContain('"Apellido; Nombre"');
    });

    it('escapes fields containing newlines', () => {
        downloadAsCSV([makeCandidateProfile({ fullName: 'Línea1\nLínea2' })]);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        // The overall content should contain the escaped field
        const content = lastBlobContent!.replace('\uFEFF', '');
        expect(content).toContain('"Línea1\nLínea2"');
    });

    it('escapes double quotes by doubling them', () => {
        downloadAsCSV([makeCandidateProfile({ currentRole: 'Developer "Senior"' })]);
        const content = lastBlobContent!.replace('\uFEFF', '');
        expect(content).toContain('Developer ""Senior""');
    });

    it('handles candidates with empty/null optional fields', () => {
        const candidate = makeCandidateProfile({
            email: undefined,
            phone: undefined,
            certifications: undefined as any,
            savedAt: undefined,
            experience: [],
        });
        downloadAsCSV([candidate]);
        expect(lastBlobContent).not.toBeNull();
        // Should not throw
    });

    it('generates multiple data rows for multiple candidates', () => {
        const candidates = [
            makeCandidateProfile({ fullName: 'Ana García' }),
            makeCandidateProfile({ fullName: 'Beto López' }),
            makeCandidateProfile({ fullName: 'Carla Díaz' }),
        ];
        downloadAsCSV(candidates);
        const lines = lastBlobContent!.replace('\uFEFF', '').split('\n');
        // 1 header + 3 data rows
        expect(lines.length).toBe(4);
    });

    it('creates a downloadable link with correct filename format', () => {
        downloadAsCSV([makeCandidateProfile()]);
        expect(appendedLink).not.toBeNull();
        expect(appendedLink!.download).toMatch(/^talentscout_candidates_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('triggers link click for download', () => {
        downloadAsCSV([makeCandidateProfile()]);
        expect(appendedLink!.click).toHaveBeenCalled();
    });
});

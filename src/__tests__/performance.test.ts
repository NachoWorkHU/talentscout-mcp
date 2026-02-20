/**
 * Performance benchmarks for TalentScout MCP
 *
 * Tests that core operations complete within acceptable time bounds.
 * Uses console.time/timeEnd style measurement with Vitest expect.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════
//  DOM Mapping Performance
// ═══════════════════════════════════════

describe('DOM Mapping Performance', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.querySelectorAll('main').forEach((el) => el.remove());
    });

    function createLargeDOM(count: number) {
        const main = document.createElement('main');
        for (let i = 0; i < count; i++) {
            const tag = i % 3 === 0 ? 'p' : i % 3 === 1 ? 'h2' : 'span';
            const el = document.createElement(tag);
            el.textContent = `Element ${i} with some realistic text content for testing performance`;
            main.appendChild(el);
        }
        document.body.appendChild(main);

        // Make elements visible
        const elements = main.querySelectorAll('*');
        for (const el of elements) {
            Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
            Object.defineProperty(el, 'offsetWidth', { value: 100, configurable: true });
            Object.defineProperty(el, 'offsetHeight', { value: 50, configurable: true });
        }
        return main;
    }

    it('maps 100 elements in under 2000ms', async () => {
        createLargeDOM(100);
        const { mapDOM } = await import('@/src/../entrypoints/content/dom_observer');

        const start = performance.now();
        const result = mapDOM(false);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(2000); // jsdom is slower than real browsers
        expect(result).not.toContain('[EMPTY]');
        expect(result.split('\n').length).toBeGreaterThan(20);
    });

    it('maps 500 elements in under 10000ms', async () => {
        createLargeDOM(500);
        const { mapDOM } = await import('@/src/../entrypoints/content/dom_observer');

        const start = performance.now();
        const result = mapDOM(false);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(10000); // jsdom is significantly slower
        expect(result.split('\n').length).toBeGreaterThan(100);
    });
});

// ═══════════════════════════════════════
//  CSV Export Performance
// ═══════════════════════════════════════

describe('CSV Export Performance', () => {
    // Mock Blob and URL to avoid DOM issues
    beforeEach(() => {
        vi.stubGlobal('Blob', class { constructor(public parts: any[], public opts?: any) { } });
        // Mock URL.createObjectURL/revokeObjectURL without replacing URL constructor
        URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(document, 'createElement').mockReturnValue({
            href: '', download: '', click: vi.fn(),
        } as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
        vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);
    });

    function generateCandidates(count: number) {
        return Array.from({ length: count }, (_, i) => ({
            fullName: `Candidate ${i}`,
            currentRole: `Role ${i}`,
            location: 'Buenos Aires, Argentina',
            profileUrl: `https://linkedin.com/in/candidate${i}`,
            source: 'linkedin' as const,
            summary: `Summary for candidate ${i}`,
            email: `candidate${i}@example.com`,
            phone: '+54 11 1234-5678',
            skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'],
            experience: [
                { company: `Company ${i}`, role: `Dev ${i}`, duration: '2 years' },
                { company: `Prev Company ${i}`, role: `Jr Dev`, duration: '1 year' },
            ],
            certifications: ['AWS Solutions Architect', 'Scrum Master'],
            education: [{ institution: 'UBA', degree: 'CS', year: '2020' }],
            status: 'saved' as const,
            savedAt: new Date().toISOString(),
        }));
    }

    it('generates CSV for 100 candidates in under 100ms', async () => {
        const { downloadAsCSV } = await import('@/src/utils/csv_exporter');
        const candidates = generateCandidates(100);

        const start = performance.now();
        downloadAsCSV(candidates);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(100);
    });

    it('generates CSV for 1000 candidates in under 500ms', async () => {
        const { downloadAsCSV } = await import('@/src/utils/csv_exporter');
        const candidates = generateCandidates(1000);

        const start = performance.now();
        downloadAsCSV(candidates);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(500);
    });
});

// ═══════════════════════════════════════
//  String Processing Performance
// ═══════════════════════════════════════

describe('String Processing Performance', () => {
    it('processes 10000 escape operations in under 100ms', () => {
        // Simulate the escapeField logic
        const escapeField = (value: string): string => {
            if (!value) return '';
            const escaped = value.replace(/"/g, '""');
            if (value.includes(';') || value.includes('\n') || value.includes('"')) {
                return `"${escaped}"`;
            }
            return escaped;
        };

        const testStrings = Array.from({ length: 10000 }, (_, i) =>
            i % 3 === 0
                ? `Normal string ${i}`
                : i % 3 === 1
                    ? `String; with semicolon ${i}`
                    : `String "with" quotes ${i}`,
        );

        const start = performance.now();
        for (const s of testStrings) {
            escapeField(s);
        }
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(100);
    });
});

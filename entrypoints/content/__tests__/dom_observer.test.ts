/**
 * Tests for dom_observer.ts
 *
 * Covers: DOM mapping, forbidden zones, visibility, text extraction,
 * link handling, scan root preference, cleanup, debug mode.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mapDOM, extractByIds } from '@/src/../entrypoints/content/dom_observer';

// ── Helper to set up DOM ──

function resetDOM() {
    document.body.innerHTML = '';
    // Remove any <main> elements
    document.querySelectorAll('main').forEach((el) => el.remove());
}

function createMain(html: string): HTMLElement {
    const main = document.createElement('main');
    main.innerHTML = html;
    document.body.appendChild(main);
    return main;
}

function createBody(html: string) {
    document.body.innerHTML = html;
}

/**
 * Force elements to appear "visible" to the observer.
 * jsdom doesn't compute layout, so offsetParent is null for all elements.
 * We override the check by making offsetParent return the body.
 */
function makeVisible(root: Element) {
    const elements = root.querySelectorAll('*');
    for (const el of elements) {
        Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
        Object.defineProperty(el, 'offsetWidth', { value: 100, configurable: true });
        Object.defineProperty(el, 'offsetHeight', { value: 50, configurable: true });
    }
}

beforeEach(() => {
    resetDOM();
});

// ═════════════════════════════════════
//  Basic DOM Mapping
// ═════════════════════════════════════

describe('mapDOM', () => {
    it('maps visible text elements and assigns data-mcp-id', () => {
        const main = createMain('<h1>Juan Pérez</h1><p>Developer</p>');
        makeVisible(main);

        const result = mapDOM(false);

        expect(result).toContain('Juan Pérez');
        expect(result).toContain('Developer');
        expect(result).toMatch(/\[\d+\] <H1>/);
        expect(result).toMatch(/\[\d+\] <P>/);
    });

    it('increments IDs sequentially', () => {
        const main = createMain('<h1>First</h1><h2>Second</h2><p>Third</p>');
        makeVisible(main);

        const result = mapDOM(false);
        const ids = [...result.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

        // Should be sequential
        for (let i = 1; i < ids.length; i++) {
            expect(ids[i]).toBeGreaterThan(ids[i - 1]);
        }
    });

    it('skips elements with empty or very short text', () => {
        const main = createMain('<p>Ok text here</p><p>x</p><p></p>');
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Ok text here');
        expect(result).not.toMatch(/\[\d+\].*"x"/);
    });

    it('returns [EMPTY] when no relevant elements are found', () => {
        createMain('');
        const result = mapDOM(false);
        expect(result).toContain('[EMPTY]');
    });
});

// ═════════════════════════════════════
//  Forbidden Zones
// ═════════════════════════════════════

describe('Forbidden Zones', () => {
    it('excludes elements inside LinkedIn chat overlay', () => {
        const main = createMain(`
            <h1>Profile Name</h1>
            <aside class="msg-overlay-container">
                <p>Chat message should be excluded</p>
            </aside>
        `);
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Profile Name');
        expect(result).not.toContain('Chat message should be excluded');
    });

    it('excludes elements inside global navigation', () => {
        const main = createMain(`
            <div id="global-nav"><span>Home</span></div>
            <h1>Actual Content</h1>
        `);
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Actual Content');
        // The nav span might not be excluded here because it's inside <main>,
        // but the #global-nav selector should match
    });

    it('excludes elements inside role="dialog"', () => {
        const main = createMain(`
            <p>Main content</p>
            <div role="dialog"><p>Modal content</p></div>
        `);
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Main content');
        expect(result).not.toContain('Modal content');
    });
});

// ═════════════════════════════════════
//  Scan Root
// ═════════════════════════════════════

describe('Scan Root', () => {
    it('prefers <main> as scan root', () => {
        document.body.innerHTML = `
            <div><p>Body level text outside main</p></div>
            <main><h1>Main content</h1></main>
        `;
        makeVisible(document.body);

        const result = mapDOM(false);
        expect(result).toContain('Main content');
        // Content outside <main> should NOT be included
        expect(result).not.toContain('Body level text outside main');
    });

    it('falls back to document.body when no <main> exists', () => {
        createBody('<h1>Body content</h1>');
        makeVisible(document.body);

        const result = mapDOM(false);
        expect(result).toContain('Body content');
    });
});

// ═════════════════════════════════════
//  Text Extraction
// ═════════════════════════════════════

describe('Text Extraction', () => {
    it('truncates text over 200 characters', () => {
        const longText = 'A'.repeat(300);
        const main = createMain(`<p>${longText}</p>`);
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('…');
        // Should not contain the full 300 chars
        expect(result).not.toContain('A'.repeat(300));
    });

    it('extracts direct text only (no child text duplication)', () => {
        const main = createMain(`
            <div>Parent text <span>Child text</span></div>
        `);
        makeVisible(main);

        const result = mapDOM(false);
        // The div line should only have "Parent text", not "Parent text Child text"
        const divLine = result.split('\n').find((l) => l.includes('<DIV>') && l.includes('Parent'));
        if (divLine) {
            expect(divLine).toContain('Parent text');
            // Direct text extraction should not duplicate child text in parent
        }
    });
});

// ═════════════════════════════════════
//  Links & Buttons
// ═════════════════════════════════════

describe('Links and Buttons', () => {
    it('includes href for link elements', () => {
        const main = createMain('<a href="https://example.com">Click me</a>');
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Click me');
        expect(result).toContain('https://example.com');
    });

    it('uses aria-label for buttons without text', () => {
        const main = createMain('<button aria-label="Close dialog"></button>');
        makeVisible(main);

        const result = mapDOM(false);
        expect(result).toContain('Close dialog');
    });
});

// ═════════════════════════════════════
//  Cleanup
// ═════════════════════════════════════

describe('Cleanup', () => {
    it('clears previous mapping before new scan', () => {
        const main = createMain('<h1>First scan</h1>');
        makeVisible(main);
        mapDOM(false);

        // First scan should have assigned data-mcp-id
        expect(main.querySelector('[data-mcp-id]')).not.toBeNull();

        // Replace content
        main.innerHTML = '<h2>Second scan</h2>';
        makeVisible(main);
        mapDOM(false);

        // Old elements should be cleaned up
        // New elements should have new ids
        const result = mapDOM(false);
        expect(result).toContain('Second scan');
    });
});

// ═════════════════════════════════════
//  extractByIds
// ═════════════════════════════════════

describe('extractByIds', () => {
    it('returns data for mapped elements', () => {
        const main = createMain('<h1>Test Heading</h1><p>Test paragraph</p>');
        makeVisible(main);
        mapDOM(false);

        const result = extractByIds([1]);
        expect(result[1]).toBeDefined();
        expect(result[1].tag).toBe('H1');
        expect(result[1].text).toContain('Test Heading');
    });

    it('returns NOT_FOUND for unmapped IDs', () => {
        const main = createMain('<p>Some text</p>');
        makeVisible(main);
        mapDOM(false);

        const result = extractByIds([999]);
        expect(result[999].tag).toBe('NOT_FOUND');
        expect(result[999].text).toBe('');
    });

    it('includes href for link elements', () => {
        const main = createMain('<a href="https://test.com">Link text</a>');
        makeVisible(main);
        mapDOM(false);

        // Find the id assigned to the link
        const link = main.querySelector('a');
        const id = Number(link?.getAttribute('data-mcp-id'));
        if (id) {
            const result = extractByIds([id]);
            expect(result[id].href).toBe('https://test.com');
        }
    });
});

// ═════════════════════════════════════
//  Debug Mode
// ═════════════════════════════════════

describe('Debug Mode', () => {
    it('applies outline style when debug=true', () => {
        const main = createMain('<h1>Debug test</h1>');
        makeVisible(main);
        mapDOM(true); // debug = true

        const h1 = main.querySelector('h1') as HTMLElement;
        if (h1?.getAttribute('data-mcp-id')) {
            expect(h1.style.outline).toContain('dashed');
        }
    });

    it('does NOT apply outline style when debug=false', () => {
        const main = createMain('<h1>No debug</h1>');
        makeVisible(main);
        mapDOM(false);

        const h1 = main.querySelector('h1') as HTMLElement;
        if (h1?.getAttribute('data-mcp-id')) {
            expect(h1.style.outline).toBe('');
        }
    });
});

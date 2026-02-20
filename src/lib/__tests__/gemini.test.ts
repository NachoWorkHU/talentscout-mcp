/**
 * Tests for gemini.ts
 *
 * All Gemini API calls are mocked — no real network requests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @google/generative-ai BEFORE importing gemini.ts ──
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
    generateContent: mockGenerateContent,
}));

vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: class MockGoogleGenerativeAI {
            constructor(_key: string) { }
            getGenerativeModel = mockGetGenerativeModel;
        },
    };
});

// Must import AFTER vi.mock
import { setApiKey, analyzeCandidateProfile, analyzeJobFit, generateOutreachMessage, _resetForTests } from '@/src/lib/gemini';
import type { CandidateProfile } from '@/src/shared/types';

function makeGeminiResponse(data: unknown) {
    return { response: { text: () => JSON.stringify(data) } };
}
function makeTextResponse(text: string) {
    return { response: { text: () => text } };
}

const validProfile = {
    fullName: 'Test User', currentRole: 'Developer', location: 'Buenos Aires',
    profileUrl: 'https://linkedin.com/in/test', source: 'linkedin', summary: 'A dev',
    email: 'test@example.com', phone: '', skills: ['React', 'TypeScript'],
    experience: [{ company: 'Acme', role: 'Dev', duration: '2y' }],
    certifications: ['AWS'], education: [{ institution: 'UBA', degree: 'CS', year: '2020' }],
    status: 'new',
};

const validFit = {
    score: 78, verdict: 'Buen match', matchingSkills: ['React'],
    gaps: ['Kubernetes'], strengths: ['React experience'],
};

const mockCandidate: CandidateProfile = {
    fullName: 'Test', currentRole: 'Dev', location: 'BA',
    profileUrl: 'https://linkedin.com/in/test', source: 'linkedin',
    skills: ['React'], experience: [], certifications: [], education: [], status: 'new',
};

beforeEach(async () => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockClear();
    _resetForTests();
    await (globalThis as any).browser.storage.sync.set({ talentscout_api_key: 'test-api-key-12345' });
});


// ═══ API Key ═══

describe('setApiKey', () => {
    it('stores a valid key', async () => {
        await setApiKey('my-valid-api-key-12345');
        const r = await (globalThis as any).browser.storage.sync.get('talentscout_api_key');
        expect(r.talentscout_api_key).toBe('my-valid-api-key-12345');
    });

    it('trims whitespace', async () => {
        await setApiKey('  my-valid-api-key-12345  ');
        const r = await (globalThis as any).browser.storage.sync.get('talentscout_api_key');
        expect(r.talentscout_api_key).toBe('my-valid-api-key-12345');
    });

    it('rejects short keys', async () => {
        await expect(setApiKey('short')).rejects.toThrow('API Key inválida');
    });

    it('rejects empty keys', async () => {
        await expect(setApiKey('')).rejects.toThrow('API Key inválida');
    });
});

// ═══ analyzeCandidateProfile ═══

describe('analyzeCandidateProfile', () => {
    it('returns valid CandidateProfile', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(validProfile));
        const result = await analyzeCandidateProfile('<h1>Test</h1>', 'https://linkedin.com/in/test');
        expect(result.fullName).toBe('Test User');
        expect(result.skills).toEqual(['React', 'TypeScript']);
        expect(result.status).toBe('new');
    });

    it('handles missing fields gracefully', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({
            fullName: 'Min', currentRole: '', location: '', profileUrl: '',
            source: 'other', skills: [], experience: [], certifications: [], education: [], status: 'new',
        }));
        const result = await analyzeCandidateProfile('<div>Min</div>');
        expect(result.fullName).toBe('Min');
        expect(result.skills).toEqual([]);
    });

    it('throws on malformed JSON', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeTextResponse('Not JSON'));
        await expect(analyzeCandidateProfile('<div>t</div>')).rejects.toThrow('JSON válido');
    });

    it('handles JSON in markdown fences', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeTextResponse('```json\n' + JSON.stringify(validProfile) + '\n```'));
        const result = await analyzeCandidateProfile('<h1>Test</h1>');
        expect(result.fullName).toBe('Test User');
    });

    it('retries on 429 rate limit', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('429 Resource exhausted'))
            .mockResolvedValueOnce(makeGeminiResponse(validProfile));
        const result = await analyzeCandidateProfile('<h1>Test</h1>');
        expect(result.fullName).toBe('Test User');
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('throws on daily quota exhaustion', async () => {
        mockGenerateContent.mockRejectedValue(new Error('429 quota Quota limit: 0 PerDay'));
        await expect(analyzeCandidateProfile('<div>t</div>')).rejects.toThrow('Cuota diaria agotada');
    });

    it('infers source=linkedin from URL', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({ ...validProfile, source: 'unknown' }));
        const result = await analyzeCandidateProfile('<div/>', 'https://www.linkedin.com/in/x');
        expect(result.source).toBe('linkedin');
    });

    it('infers source=indeed from URL', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({ ...validProfile, source: 'unknown' }));
        const result = await analyzeCandidateProfile('<div/>', 'https://www.indeed.com/p/abc');
        expect(result.source).toBe('indeed');
    });
});

// ═══ analyzeJobFit ═══

describe('analyzeJobFit', () => {
    it('returns valid JobFitResult', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(validFit));
        const result = await analyzeJobFit(mockCandidate, 'React developer');
        expect(result.score).toBe(78);
        expect(result.matchingSkills).toContain('React');
    });

    it('clamps score above 100', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({ ...validFit, score: 150 }));
        const result = await analyzeJobFit(mockCandidate, 'JD');
        expect(result.score).toBe(100);
    });

    it('clamps negative score to 0', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({ ...validFit, score: -10 }));
        const result = await analyzeJobFit(mockCandidate, 'JD');
        expect(result.score).toBe(0);
    });

    it('handles missing arrays', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse({ score: 50, verdict: 'OK' }));
        const result = await analyzeJobFit(mockCandidate, 'JD');
        expect(result.matchingSkills).toEqual([]);
        expect(result.gaps).toEqual([]);
    });
});

// ═══ generateOutreachMessage ═══

describe('generateOutreachMessage', () => {
    it('returns non-empty message', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeTextResponse('Hola Test, me llamó la atención tu perfil...'));
        const result = await generateOutreachMessage(mockCandidate);
        expect(result.length).toBeGreaterThan(20);
    });

    it('throws on short response', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeTextResponse('Hi'));
        await expect(generateOutreachMessage(mockCandidate)).rejects.toThrow('mensaje vacío o demasiado corto');
    });

    it('accepts optional jobDescription', async () => {
        mockGenerateContent.mockResolvedValueOnce(makeTextResponse('Tenemos un rol ideal para vos...'));
        const result = await generateOutreachMessage(mockCandidate, 'Frontend role');
        expect(result).toContain('rol ideal');
    });
});

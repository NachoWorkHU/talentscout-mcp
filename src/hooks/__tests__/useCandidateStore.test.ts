/**
 * Tests for useCandidateStore hook
 *
 * Covers: CRUD jobs, CRUD candidates, persistence, toasts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCandidateStore } from '@/src/hooks/useCandidateStore';
import type { CandidateProfile, JobPost } from '@/src/shared/types';

function makeCandidate(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
    return {
        fullName: 'Test User', currentRole: 'Developer', location: 'Buenos Aires',
        profileUrl: 'https://linkedin.com/in/testuser', source: 'linkedin',
        skills: ['React'], experience: [], certifications: [], education: [],
        status: 'new', ...overrides,
    };
}

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { vi.restoreAllMocks(); });

async function setupHook() {
    const { result } = renderHook(() => useCandidateStore());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    return result;
}

describe('Store Loading', () => {
    it('starts with loading=true then becomes false', async () => {
        const { result } = renderHook(() => useCandidateStore());
        expect(result.current.loading).toBe(true);
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(result.current.loading).toBe(false);
    });

    it('loads jobs from storage on mount', async () => {
        const jobs: JobPost[] = [{ id: 'j1', title: 'Frontend', description: 'React', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
        await (globalThis as any).browser.storage.local.set({ talentscout_jobs: jobs });
        const result = await setupHook();
        expect(result.current.jobs).toHaveLength(1);
        expect(result.current.jobs[0].title).toBe('Frontend');
    });

    it('loads candidates from storage on mount', async () => {
        await (globalThis as any).browser.storage.local.set({ talentscout_candidates: [makeCandidate({ fullName: 'Stored' })] });
        const result = await setupHook();
        expect(result.current.candidates).toHaveLength(1);
    });
});

describe('Job CRUD', () => {
    it('addJob creates a job with unique ID', async () => {
        const result = await setupHook();
        let job: JobPost | undefined;
        await act(async () => { job = await result.current.addJob('Backend', 'Node.js'); });
        expect(job!.id).toBeTruthy();
        expect(job!.title).toBe('Backend');
        expect(result.current.jobs).toHaveLength(1);
    });

    it('updateJob updates title and description', async () => {
        const result = await setupHook();
        let job: JobPost | undefined;
        await act(async () => { job = await result.current.addJob('Old', 'Old desc'); });
        await act(async () => { await result.current.updateJob(job!.id, { title: 'New', description: 'New desc' }); });
        expect(result.current.jobs[0].title).toBe('New');
    });

    it('removeJob deletes job and its candidates', async () => {
        const result = await setupHook();
        let job: JobPost | undefined;
        await act(async () => { job = await result.current.addJob('Del', 'Desc'); });
        await act(async () => { await result.current.saveCandidate(makeCandidate(), job!.id); });
        expect(result.current.candidates).toHaveLength(1);
        await act(async () => { await result.current.removeJob(job!.id); });
        expect(result.current.jobs).toHaveLength(0);
        expect(result.current.candidates).toHaveLength(0);
    });

    it('getActiveJob returns active job or null', async () => {
        const result = await setupHook();
        expect(result.current.getActiveJob()).toBeNull();
        let job: JobPost | undefined;
        await act(async () => { job = await result.current.addJob('Active', 'Desc'); });
        act(() => { result.current.setActiveJobId(job!.id); });
        expect(result.current.getActiveJob()?.title).toBe('Active');
    });
});

describe('Candidate CRUD', () => {
    it('saveCandidate adds with savedAt and status=saved', async () => {
        const result = await setupHook();
        await act(async () => { await result.current.saveCandidate(makeCandidate()); });
        expect(result.current.candidates).toHaveLength(1);
        expect(result.current.candidates[0].savedAt).toBeTruthy();
        expect(result.current.candidates[0].status).toBe('saved');
    });

    it('saveCandidate updates existing by profileUrl+jobId', async () => {
        const result = await setupHook();
        await act(async () => { await result.current.saveCandidate(makeCandidate(), 'j1'); });
        await act(async () => { await result.current.saveCandidate({ ...makeCandidate(), currentRole: 'Senior' }, 'j1'); });
        expect(result.current.candidates).toHaveLength(1);
        expect(result.current.candidates[0].currentRole).toBe('Senior');
    });

    it('removeCandidate removes entry', async () => {
        const result = await setupHook();
        await act(async () => { await result.current.saveCandidate(makeCandidate()); });
        await act(async () => { await result.current.removeCandidate('https://linkedin.com/in/testuser'); });
        expect(result.current.candidates).toHaveLength(0);
    });

    it('isSaved detects saved candidates', async () => {
        const result = await setupHook();
        expect(result.current.isSaved('https://linkedin.com/in/testuser')).toBe(false);
        await act(async () => { await result.current.saveCandidate(makeCandidate()); });
        expect(result.current.isSaved('https://linkedin.com/in/testuser')).toBe(true);
    });

    it('getCandidatesForJob filters by jobId', async () => {
        const result = await setupHook();
        await act(async () => {
            await result.current.saveCandidate(makeCandidate({ profileUrl: 'u1' }), 'jA');
        });
        await act(async () => {
            await result.current.saveCandidate(makeCandidate({ profileUrl: 'u2' }), 'jB');
        });
        expect(result.current.getCandidatesForJob('jA')).toHaveLength(1);
    });

    it('getUnassignedCandidates returns candidates without jobId', async () => {
        const result = await setupHook();
        await act(async () => {
            await result.current.saveCandidate(makeCandidate({ profileUrl: 'u1' }));
        });
        await act(async () => {
            await result.current.saveCandidate(makeCandidate({ profileUrl: 'u2' }), 'j1');
        });
        expect(result.current.getUnassignedCandidates()).toHaveLength(1);
    });

    it('updateStatus changes candidate status', async () => {
        const result = await setupHook();
        await act(async () => { await result.current.saveCandidate(makeCandidate()); });
        await act(async () => { await result.current.updateStatus('https://linkedin.com/in/testuser', 'contacted'); });
        expect(result.current.candidates[0].status).toBe('contacted');
    });
});

describe('Toast', () => {
    it('shows toast on save and clearToast removes it', async () => {
        const result = await setupHook();
        await act(async () => { await result.current.saveCandidate(makeCandidate()); });
        expect(result.current.toast).not.toBeNull();
        act(() => { result.current.clearToast(); });
        expect(result.current.toast).toBeNull();
    });
});

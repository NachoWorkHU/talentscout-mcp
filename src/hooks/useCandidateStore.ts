/**
 * useCandidateStore — Mini-ATS Store
 *
 * Gestiona Jobs (Llamados) y Candidates unidos por jobId.
 * Persiste todo en chrome.storage.local.
 *
 * Uses refs to avoid stale closures in useCallback.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CandidateProfile, JobPost } from '@/src/shared/types';
import { log } from '@/src/utils/logger';

const STORAGE_KEY_JOBS = 'talentscout_jobs';
const STORAGE_KEY_CANDIDATES = 'talentscout_candidates';
const STORAGE_MAX_BYTES = 5_242_880; // 5 MB chrome.storage.local limit

export interface CandidateStore {
    // ── Data ──
    jobs: JobPost[];
    candidates: CandidateProfile[];
    activeJobId: string | null;
    loading: boolean;
    storageUsage: number; // 0-100 percentage
    toast: { message: string; type: 'success' | 'error' | 'info' } | null;

    // ── Job actions ──
    addJob: (title: string, description: string) => Promise<JobPost>;
    updateJob: (id: string, data: { title?: string; description?: string }) => Promise<void>;
    removeJob: (jobId: string) => Promise<void>;
    setActiveJobId: (jobId: string | null) => void;
    getActiveJob: () => JobPost | null;

    // ── Candidate actions ──
    saveCandidate: (candidate: CandidateProfile, jobId?: string, matchScore?: number) => Promise<void>;
    removeCandidate: (profileUrl: string, jobId?: string) => Promise<void>;
    updateStatus: (profileUrl: string, status: CandidateProfile['status']) => Promise<void>;
    isSaved: (profileUrl: string, jobId?: string) => boolean;
    getCandidatesForJob: (id: string) => CandidateProfile[];
    getUnassignedCandidates: () => CandidateProfile[];

    // ── UI ──
    clearToast: () => void;
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function useCandidateStore(): CandidateStore {
    const [jobs, setJobs] = useState<JobPost[]>([]);
    const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [storageUsage, setStorageUsage] = useState(0);
    const [toast, setToast] = useState<CandidateStore['toast']>(null);

    // Refs to avoid stale closure bugs
    const jobsRef = useRef(jobs);
    jobsRef.current = jobs;
    const candidatesRef = useRef(candidates);
    candidatesRef.current = candidates;
    const activeJobIdRef = useRef(activeJobId);
    activeJobIdRef.current = activeJobId;

    // ── Auto-dismiss toast ──
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
    }, [toast]);

    // ── Load from storage ──
    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        try {
            const result = await browser.storage.local.get([STORAGE_KEY_JOBS, STORAGE_KEY_CANDIDATES]);
            const storedJobs = result[STORAGE_KEY_JOBS];
            const storedCandidates = result[STORAGE_KEY_CANDIDATES];
            if (Array.isArray(storedJobs)) setJobs(storedJobs);
            if (Array.isArray(storedCandidates)) setCandidates(storedCandidates);
        } catch (err) {
            log.error('Error loading store:', err);
            setToast({ message: 'Error al cargar datos guardados.', type: 'error' });
        } finally {
            setLoading(false);
            checkStorageUsage();
        }
    }

    async function checkStorageUsage() {
        try {
            const bytes = await browser.storage.local.getBytesInUse(null);
            const pct = Math.round((bytes / STORAGE_MAX_BYTES) * 100);
            setStorageUsage(pct);
            if (pct >= 80) {
                setToast({
                    message: `Almacenamiento al ${pct}%. Considerá eliminar datos antiguos.`,
                    type: 'info',
                });
            }
        } catch {
            // getBytesInUse may not be available in all contexts
        }
    }

    // ── Persist helpers (read from refs, not stale state) ──
    async function persistJobs(updated: JobPost[]) {
        try {
            await browser.storage.local.set({ [STORAGE_KEY_JOBS]: updated });
            setJobs(updated);
        } catch (err) {
            log.error('Error persisting jobs:', err);
            setToast({ message: 'Error al guardar en storage.', type: 'error' });
            throw err;
        }
        checkStorageUsage();
    }

    async function persistCandidates(updated: CandidateProfile[]) {
        try {
            await browser.storage.local.set({ [STORAGE_KEY_CANDIDATES]: updated });
            setCandidates(updated);
        } catch (err) {
            log.error('Error persisting candidates:', err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('QUOTA_BYTES')) {
                setToast({ message: 'Almacenamiento lleno. Eliminá datos antiguos.', type: 'error' });
            } else {
                setToast({ message: 'Error al guardar en storage.', type: 'error' });
            }
            throw err;
        }
        checkStorageUsage();
    }

    // ═══════════════════════════════
    //  Job actions (use refs)
    // ═══════════════════════════════

    const addJob = useCallback(async (title: string, description: string): Promise<JobPost> => {
        const now = new Date().toISOString();
        const job: JobPost = {
            id: generateId(),
            title: title.trim(),
            description: description.trim(),
            createdAt: now,
            updatedAt: now,
        };
        const updated = [job, ...jobsRef.current];
        await persistJobs(updated);
        setToast({ message: `Llamado "${job.title}" creado.`, type: 'success' });
        return job;
    }, []);

    const updateJob = useCallback(async (id: string, data: { title?: string; description?: string }) => {
        const updated = jobsRef.current.map((j) =>
            j.id === id
                ? {
                    ...j,
                    ...(data.title !== undefined && { title: data.title.trim() }),
                    ...(data.description !== undefined && { description: data.description.trim() }),
                    updatedAt: new Date().toISOString(),
                }
                : j,
        );
        await persistJobs(updated);
        setToast({ message: 'Llamado actualizado.', type: 'success' });
    }, []);

    const removeJob = useCallback(async (jobId: string) => {
        const target = jobsRef.current.find((j) => j.id === jobId);
        const candidateCount = candidatesRef.current.filter((c) => c.jobId === jobId).length;

        // Confirmation dialog to prevent accidental deletion
        const msg = candidateCount > 0
            ? `¿Eliminar "${target?.title ?? ''}" y sus ${candidateCount} candidato${candidateCount !== 1 ? 's' : ''}?`
            : `¿Eliminar "${target?.title ?? ''}"?`;
        if (!window.confirm(msg)) return;

        const updatedJobs = jobsRef.current.filter((j) => j.id !== jobId);
        await persistJobs(updatedJobs);

        // Also remove candidates tied to this job
        const updatedCandidates = candidatesRef.current.filter((c) => c.jobId !== jobId);
        if (updatedCandidates.length !== candidatesRef.current.length) {
            await persistCandidates(updatedCandidates);
        }

        if (activeJobIdRef.current === jobId) setActiveJobId(null);
        setToast({ message: `Llamado "${target?.title ?? ''}" eliminado.`, type: 'info' });
    }, []);

    const getActiveJob = useCallback((): JobPost | null => {
        if (!activeJobIdRef.current) return null;
        return jobsRef.current.find((j) => j.id === activeJobIdRef.current) ?? null;
    }, []);

    // ═══════════════════════════════
    //  Candidate actions (use refs)
    // ═══════════════════════════════

    const saveCandidate = useCallback(async (
        candidate: CandidateProfile,
        jobId?: string,
        matchScore?: number,
    ) => {
        const enriched: CandidateProfile = {
            ...candidate,
            jobId: jobId ?? candidate.jobId,
            matchScore: matchScore ?? candidate.matchScore,
            savedAt: new Date().toISOString(),
            status: 'saved',
        };

        const current = candidatesRef.current;
        const existingIndex = current.findIndex(
            (c) => c.profileUrl === candidate.profileUrl && c.jobId === (jobId ?? candidate.jobId),
        );

        let updated: CandidateProfile[];
        if (existingIndex >= 0) {
            updated = [...current];
            updated[existingIndex] = enriched;
            setToast({ message: `${candidate.fullName} actualizado.`, type: 'info' });
        } else {
            updated = [enriched, ...current];
            setToast({ message: `${candidate.fullName} guardado.`, type: 'success' });
        }

        await persistCandidates(updated);
    }, []);

    const removeCandidate = useCallback(async (profileUrl: string, jobId?: string) => {
        const current = candidatesRef.current;
        const target = current.find((c) => c.profileUrl === profileUrl);
        // If jobId is provided, only remove the specific entry for that job;
        // otherwise remove all entries for this profileUrl.
        const updated = jobId
            ? current.filter((c) => !(c.profileUrl === profileUrl && c.jobId === jobId))
            : current.filter((c) => c.profileUrl !== profileUrl);
        await persistCandidates(updated);
        setToast({
            message: `${target?.fullName ?? 'Candidato'} eliminado.`,
            type: 'info',
        });
    }, []);

    const updateStatus = useCallback(async (
        profileUrl: string,
        status: CandidateProfile['status'],
    ) => {
        const updated = candidatesRef.current.map((c) =>
            c.profileUrl === profileUrl ? { ...c, status } : c,
        );
        await persistCandidates(updated);
    }, []);

    const isSaved = useCallback(
        (profileUrl: string, jobId?: string) => {
            return candidatesRef.current.some((c) =>
                c.profileUrl === profileUrl && (jobId === undefined || c.jobId === jobId),
            );
        },
        [],
    );

    const getCandidatesForJob = useCallback(
        (jobId: string) => candidatesRef.current.filter((c) => c.jobId === jobId),
        [],
    );

    const getUnassignedCandidates = useCallback(
        () => candidatesRef.current.filter((c) => !c.jobId),
        [],
    );

    const clearToast = useCallback(() => setToast(null), []);

    return useMemo(() => ({
        jobs,
        candidates,
        activeJobId,
        loading,
        storageUsage,
        toast,
        addJob,
        updateJob,
        removeJob,
        setActiveJobId,
        getActiveJob,
        saveCandidate,
        removeCandidate,
        updateStatus,
        isSaved,
        getCandidatesForJob,
        getUnassignedCandidates,
        clearToast,
    }), [jobs, candidates, activeJobId, loading, storageUsage, toast]);
}

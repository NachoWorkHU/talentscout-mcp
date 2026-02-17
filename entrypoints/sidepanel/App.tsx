import { useState, useCallback, useEffect } from 'react';
import type { ContentResponse } from '@/src/shared/messaging';
import type { CandidateProfile, JobFitResult } from '@/src/shared/types';
import { analyzeCandidateProfile, analyzeJobFit, setApiKey } from '@/src/lib/gemini';
import { useCandidateStore } from '@/src/hooks/useCandidateStore';
import { JobFitCard } from '@/src/components/JobFitCard';
import Icebreaker from '@/src/components/Icebreaker';
import { downloadAsCSV } from '@/src/utils/csv_exporter';
import {
    Pin,
    X,
    ScanSearch,
    Briefcase,
    Settings,
    ChevronDown,
    ChevronUp,
    Pencil,
    Trash2,
    FolderOpen,
    Users,
    Calendar,
    Plus,
    Search,
    Moon,
    Sun
} from "lucide-react";

type AppStatus = 'ready' | 'scanning' | 'analyzing' | 'done' | 'error';
type TabId = 'scanner' | 'jobs' | 'settings';

function App() {
    const [activeTab, setActiveTab] = useState<TabId>('scanner');
    const [status, setStatus] = useState<AppStatus>('ready');
    const [domMap, setDomMap] = useState<string>('');
    const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
    const [error, setError] = useState<string>('');
    const [elementCount, setElementCount] = useState(0);
    const [showDebug, setShowDebug] = useState(false);
    const [fitResult, setFitResult] = useState<JobFitResult | null>(null);
    const [fitLoading, setFitLoading] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('talentscout_theme') === 'dark';
    });
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [apiKeySet, setApiKeySet] = useState(false);
    const [cardExpanded, setCardExpanded] = useState(true);

    useEffect(() => {
        document.documentElement.classList.toggle('dark-mode', darkMode);
        localStorage.setItem('talentscout_theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    // Check if API key exists on mount
    useEffect(() => {
        browser.storage.sync.get('talentscout_api_key').then((result: Record<string, unknown>) => {
            const key = result['talentscout_api_key'];
            if (key && typeof key === 'string' && key.length >= 10) {
                setApiKeySet(true);
                setApiKeyInput('••••••••••' + key.slice(-4));
            }
        }).catch(() => { });
    }, []);

    const store = useCandidateStore();
    const activeJob = store.getActiveJob();

    // ── Scan + analyze (+ auto-fit if job selected) ──
    const handleAnalyze = useCallback(async () => {
        setStatus('scanning');
        setError('');
        setDomMap('');
        setCandidate(null);
        setFitResult(null);
        setElementCount(0);

        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

            if (!tab?.id) throw new Error('No se encontró una pestaña activa.');
            if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://'))
                throw new Error('No se pueden analizar páginas internas de Chrome.');

            const response = (await browser.tabs.sendMessage(tab.id, {
                type: 'ANALYZE_PAGE',
            })) as ContentResponse;

            if (!response?.success || typeof response.data !== 'string') {
                throw new Error(
                    !response?.success
                        ? (response as { error?: string })?.error || 'Error del content script.'
                        : 'Datos inválidos del content script.',
                );
            }

            const domString = response.data;
            setDomMap(domString);
            setElementCount((domString.match(/^\[/gm) ?? []).length);

            setStatus('analyzing');
            const profile = await analyzeCandidateProfile(domString, tab.url ?? '');
            setCandidate(profile);

            // Auto-fit if a job is selected
            if (activeJob) {
                setFitLoading(true);
                try {
                    const fit = await analyzeJobFit(profile, activeJob.description);
                    setFitResult(fit);
                } catch (fitErr) {
                    console.warn('[TalentScout] Auto-fit failed:', fitErr);
                }
                setFitLoading(false);
            }

            setStatus('done');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('Receiving end does not exist') || message.includes('Could not establish connection')) {
                setError('El content script no está activo. Recarga la página e intenta de nuevo.');
            } else {
                setError(message);
            }
            setStatus('error');
        }
    }, [activeJob]);

    const handleSave = useCallback(async () => {
        if (!candidate) return;
        await store.saveCandidate(
            candidate,
            activeJob?.id,
            fitResult?.score,
        );
    }, [candidate, store, activeJob, fitResult]);

    const handleManualFit = useCallback(async () => {
        if (!candidate || !activeJob) return;
        setFitLoading(true);
        setFitResult(null);
        try {
            const result = await analyzeJobFit(candidate, activeJob.description);
            setFitResult(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setFitLoading(false);
        }
    }, [candidate, activeJob]);

    const alreadySaved = candidate
        ? store.isSaved(candidate.profileUrl, activeJob?.id)
        : false;

    return (
        <div className="min-h-screen bg-secondary/50 font-sans text-foreground">
            {/* ── Toast ── */}
            {store.toast && (
                <div
                    className={`fixed top-4 left-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-top-2 cursor-pointer
                    ${store.toast.type === 'error' ? 'bg-destructive text-destructive-foreground border-destructive/20' : 'bg-primary text-primary-foreground border-primary/20'}`}
                    onClick={store.clearToast}
                >
                    {store.toast.message}
                </div>
            )}

            {/* ── Main Container (Card style) ── */}
            <div className="w-full bg-background min-h-screen flex flex-col">

                {/* ── Extension Brand Header ── */}
                <div className="flex items-center justify-between px-5 py-4 bg-background">
                    <div>
                        <h1 className="text-lg font-bold text-primary tracking-tight leading-none">
                            TalentScout
                        </h1>
                        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mt-0.5">
                            Mini-ATS
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 text-xs font-medium border rounded-full ${status === 'ready' || status === 'done' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-secondary text-muted-foreground border-border'}`}>
                            {status === 'scanning' || status === 'analyzing' ? 'Procesando' : 'Listo'}
                        </div>
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                        >
                            {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                        </button>
                    </div>
                </div>

                {/* ── Tab Navigation (Segmented Control) ── */}
                <div className="px-5 pb-2">
                    <div className="flex p-1 bg-secondary/60 rounded-xl gap-1">
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                            ${activeTab === 'scanner'
                                    ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                            onClick={() => setActiveTab('scanner')}
                        >
                            <ScanSearch className="size-3.5" />
                            Scanner
                        </button>
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                            ${activeTab === 'jobs'
                                    ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                            onClick={() => setActiveTab('jobs')}
                        >
                            <Briefcase className="size-3.5" />
                            Llamados
                            {store.jobs.length > 0 && (
                                <span className={`text-[10px] font-bold rounded-full size-4 flex items-center justify-center leading-none ${activeTab === 'jobs' ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                                    {store.jobs.length}
                                </span>
                            )}
                        </button>
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                            ${activeTab === 'settings'
                                    ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Settings className="size-3.5" />
                            Config
                        </button>
                    </div>
                </div>

                {/* ── Content Area ── */}
                <div className="flex-1 overflow-auto">
                    {activeTab === 'scanner' && (
                        <div className="px-5 py-4 flex flex-col gap-4">
                            {/* Job Selector */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Llamado activo
                                </label>
                                <div className="relative">
                                    <select
                                        className="w-full h-10 bg-secondary border border-border text-foreground rounded-xl shadow-sm px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                                        value={store.activeJobId ?? ''}
                                        onChange={(e) => store.setActiveJobId(e.target.value || null)}
                                    >
                                        <option value="">Bolsa General (Escaneo Libre)</option>
                                        {store.jobs.map((job) => (
                                            <option key={job.id} value={job.id}>{job.title}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 size-4 text-muted-foreground pointer-events-none" />
                                </div>
                                {store.jobs.length === 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        💡 Crea un llamado en la pestaña "Llamados" para activar el análisis de compatibilidad.
                                    </p>
                                )}
                            </div>

                            {/* Analyze Button */}
                            <button
                                className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-semibold text-sm gap-2 shadow-md hover:shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleAnalyze}
                                disabled={status === 'scanning' || status === 'analyzing'}
                            >
                                {status === 'scanning' || status === 'analyzing' ? (
                                    <>
                                        <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {status === 'scanning' ? 'Escaneando DOM…' : 'IA procesando…'}
                                    </>
                                ) : (
                                    <>
                                        <ScanSearch className="size-4" />
                                        Analizar perfil
                                    </>
                                )}
                            </button>

                            {/* Error */}
                            {error && (
                                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-xl flex items-start gap-2">
                                    <X className="size-4 mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Candidate Card */}
                            {candidate && (
                                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                    {/* Card Header */}
                                    <div className="p-4 flex items-start justify-between border-b border-border/50">
                                        <div className="flex gap-3">
                                            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                                                {candidate.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h2 className="font-semibold text-foreground leading-tight">{candidate.fullName}</h2>
                                                <p className="text-sm text-muted-foreground">{candidate.currentRole}</p>
                                                {candidate.location && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                                        <span className="inline-block size-1.5 rounded-full bg-muted-foreground/50" />
                                                        {candidate.location}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => setCardExpanded(!cardExpanded)}
                                        >
                                            {cardExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                        </button>
                                    </div>

                                    {/* Card Body */}
                                    {cardExpanded && (
                                        <div className="p-4 space-y-4">
                                            {candidate.summary && (
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    {candidate.summary}
                                                </p>
                                            )}

                                            {/* Skills */}
                                            {candidate.skills.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</h3>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {candidate.skills.map((skill, i) => (
                                                            <span key={i} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md font-medium border border-border">
                                                                {skill}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Experience */}
                                            {candidate.experience.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experiencia</h3>
                                                    <div className="space-y-2">
                                                        {candidate.experience.map((exp, i) => (
                                                            <div key={i} className="text-sm border-l-2 border-border pl-3">
                                                                <div className="font-medium text-foreground">{exp.role}</div>
                                                                <div className="text-muted-foreground text-xs flex justify-between">
                                                                    <span>{exp.company}</span>
                                                                    <span>{exp.duration}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Education */}
                                            {candidate.education?.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Educación</h3>
                                                    <div className="space-y-2">
                                                        {candidate.education.map((edu, i) => (
                                                            <div key={i} className="text-sm border-l-2 border-border pl-3">
                                                                <div className="font-medium text-foreground">{edu.degree}</div>
                                                                <div className="text-muted-foreground text-xs">
                                                                    {edu.institution} {edu.year && `• ${edu.year}`}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Card Footer Actions */}
                                    <div className="p-3 bg-secondary/30 border-t border-border flex items-center justify-between gap-2">
                                        {candidate.profileUrl && (
                                            <a
                                                href={candidate.profileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                                            >
                                                Ver perfil <ScanSearch className="size-3" />
                                            </a>
                                        )}

                                        <div className="flex items-center gap-2">
                                            <button
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5
                                                ${alreadySaved
                                                        ? 'bg-green-500/10 text-green-600 border border-green-500/20 cursor-default'
                                                        : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'}`}
                                                onClick={handleSave}
                                                disabled={alreadySaved}
                                            >
                                                {alreadySaved ? 'Guardado' : 'Guardar'}
                                            </button>

                                            {activeJob && !fitResult && (
                                                <button
                                                    className="px-3 py-1.5 bg-secondary text-secondary-foreground border border-border rounded-lg text-xs font-semibold hover:bg-secondary/80 transition-all flex items-center gap-1.5"
                                                    onClick={handleManualFit}
                                                    disabled={fitLoading}
                                                >
                                                    {fitLoading ? <div className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Search className="size-3.5" />}
                                                    Analizar Fit
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Icebreaker */}
                                    <div className="border-t border-border">
                                        <Icebreaker candidate={candidate} jobPost={activeJob} />
                                    </div>
                                </div>
                            )}

                            {/* Fit Result */}
                            {fitResult && <JobFitCard result={fitResult} />}

                            {/* Debug Section */}
                            {domMap && (
                                <div className="mt-4 border-t border-border pt-4">
                                    <button
                                        className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                                        onClick={() => setShowDebug(!showDebug)}
                                    >
                                        {showDebug ? <ChevronDown className="size-3" /> : <ChevronDown className="size-3 -rotate-90" />}
                                        Debug info ({elementCount} nodes)
                                    </button>
                                    {showDebug && (
                                        <pre className="mt-2 p-3 bg-secondary/50 rounded-lg text-[10px] font-mono overflow-auto max-h-40 text-muted-foreground">
                                            {domMap}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'jobs' && (
                        <div className="px-5 py-4 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-foreground">Mis Llamados</h2>
                                <span className="text-xs text-muted-foreground">{store.jobs.length} activos</span>
                            </div>

                            <JobListPlaceholder
                                jobs={store.jobs}
                                candidates={store.candidates}
                                onAddJob={store.addJob}
                                onUpdateJob={store.updateJob}
                                onRemoveJob={store.removeJob}
                                onDeleteCandidate={store.removeCandidate}
                                getCandidatesForJob={store.getCandidatesForJob}
                                getUnassignedCandidates={store.getUnassignedCandidates}
                                onExportCSV={downloadAsCSV}
                            />
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="px-5 py-4 flex flex-col gap-6">
                            <div>
                                <h2 className="text-sm font-bold text-foreground mb-4">Configuración</h2>

                                <div className="space-y-3">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" htmlFor="api-key">
                                        Gemini API Key
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Obtén tu clave en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            id="api-key"
                                            className="flex-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground"
                                            type="password"
                                            placeholder="AIzaSy..."
                                            value={apiKeyInput}
                                            onChange={(e) => { setApiKeyInput(e.target.value); setApiKeySet(false); }}
                                            onFocus={() => { if (apiKeySet) { setApiKeyInput(''); setApiKeySet(false); } }}
                                        />
                                        <button
                                            className={`h-9 px-4 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                                            ${apiKeySet
                                                    ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                                                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'}`}
                                            disabled={apiKeySet || apiKeyInput.length < 10}
                                            onClick={async () => {
                                                try {
                                                    await setApiKey(apiKeyInput);
                                                    setApiKeySet(true);
                                                    setApiKeyInput('••••••••••' + apiKeyInput.slice(-4));
                                                } catch (err) {
                                                    setError(err instanceof Error ? err.message : String(err));
                                                }
                                            }}
                                        >
                                            {apiKeySet ? 'Guardada' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Storage usage */}
                            {store.storageUsage > 25 && (
                                <div className="space-y-2 p-3 bg-secondary/30 rounded-xl border border-border">
                                    <div className="flex justify-between text-xs font-medium">
                                        <span>Almacenamiento Local</span>
                                        <span className={store.storageUsage > 80 ? 'text-destructive' : 'text-muted-foreground'}>
                                            {store.storageUsage}% usado
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${store.storageUsage > 80 ? 'bg-destructive' : 'bg-primary'}`}
                                            style={{ width: `${store.storageUsage}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Límite ~5MB (Chrome Sync Storage)</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Version */}
                <div className="p-3 border-t border-border bg-card/50">
                    <p className="text-center text-[10px] text-muted-foreground font-medium">
                        TalentScout MCP v1.0
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── JobList Component ──
function JobListPlaceholder({
    jobs,
    candidates,
    onAddJob,
    onUpdateJob,
    onRemoveJob,
    onDeleteCandidate,
    getCandidatesForJob,
    getUnassignedCandidates,
    onExportCSV,
}: {
    jobs: import('@/src/shared/types').JobPost[];
    candidates: import('@/src/shared/types').CandidateProfile[];
    onAddJob: (title: string, desc: string) => Promise<import('@/src/shared/types').JobPost>;
    onUpdateJob: (id: string, data: { title?: string; description?: string }) => Promise<void>;
    onRemoveJob: (id: string) => Promise<void>;
    onDeleteCandidate: (url: string) => Promise<void>;
    getCandidatesForJob: (id: string) => import('@/src/shared/types').CandidateProfile[];
    getUnassignedCandidates: () => import('@/src/shared/types').CandidateProfile[];
    onExportCSV: (candidates: import('@/src/shared/types').CandidateProfile[]) => void;
}) {
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [expandedDescId, setExpandedDescId] = useState<string | null>(null);
    const [editingJobId, setEditingJobId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const handleCreate = async () => {
        if (!title.trim()) return;
        await onAddJob(title, desc);
        setTitle('');
        setDesc('');
        setShowForm(false);
    };

    const startEdit = (job: import('@/src/shared/types').JobPost) => {
        setEditingJobId(job.id);
        setEditTitle(job.title);
        setEditDesc(job.description);
        setExpandedDescId(job.id);
    };

    const handleUpdate = async () => {
        if (!editingJobId || !editTitle.trim()) return;
        await onUpdateJob(editingJobId, { title: editTitle, description: editDesc });
        setEditingJobId(null);
    };

    const unassigned = getUnassignedCandidates();

    return (
        <div className="flex flex-col gap-3">
            {/* Create Job Button */}
            {!showForm && (
                <button
                    className="w-full h-10 bg-card border border-border border-dashed hover:border-primary/50 text-muted-foreground hover:text-primary rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    onClick={() => setShowForm(true)}
                >
                    <Plus className="size-4" />
                    Nuevo llamado
                </button>
            )}

            {/* Create Job Form */}
            {showForm && (
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2">
                    <input
                        className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all placeholder:text-muted-foreground"
                        placeholder="Título del puesto (e.g. Frontend Developer Sr.)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        autoFocus
                    />
                    <textarea
                        className="w-full bg-secondary border border-border rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground"
                        placeholder="Descripción del puesto..."
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        rows={4}
                        maxLength={10000}
                    />
                    <div className="flex gap-2 pt-1">
                        <button
                            className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
                            onClick={handleCreate}
                            disabled={!title.trim()}
                        >
                            Crear llamado
                        </button>
                        <button
                            className="flex-1 h-9 bg-secondary text-secondary-foreground border border-border rounded-lg text-xs font-semibold hover:bg-secondary/80 transition-all"
                            onClick={() => setShowForm(false)}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bolsa General ── */}
            <div className={`group rounded-xl border border-border bg-card p-3.5 transition-all hover:shadow-sm hover:border-primary/20 cursor-pointer ${expandedDescId === 'unassigned' ? 'ring-2 ring-primary/20' : ''}`}
                onClick={() => setExpandedDescId(expandedDescId === 'unassigned' ? null : 'unassigned')}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <FolderOpen className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">Bolsa General</p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Users className="size-3" /> {unassigned.length} candidatos sin asignar
                            </span>
                        </div>
                    </div>
                </div>
                {unassigned.length > 0 && expandedDescId === 'unassigned' && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2 animate-in fade-in">
                        {unassigned.map((c) => (
                            <CandidateScoreRow key={c.profileUrl} candidate={c} onDelete={onDeleteCandidate} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Job Cards ── */}
            {jobs.map((job) => {
                const jobCandidates = getCandidatesForJob(job.id);
                const isDescExpanded = expandedDescId === job.id;
                const isEditing = editingJobId === job.id;

                return (
                    <div
                        key={job.id}
                        className={`group rounded-xl border border-border bg-card transition-all hover:shadow-sm hover:border-primary/20 ${isDescExpanded ? 'ring-2 ring-primary/20' : ''}`}
                    >
                        <div className="p-3.5 flex items-start justify-between cursor-pointer" onClick={() => !isEditing && setExpandedDescId(isDescExpanded ? null : job.id)}>
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="size-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                    <Briefcase className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                {!isEditing ? (
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{job.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Users className="size-3" /> {jobCandidates.length}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Calendar className="size-3" /> {new Date(job.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        className="h-8 bg-secondary border border-border rounded px-2 text-sm w-full text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                )}
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                {!isEditing ? (
                                    <>
                                        <button
                                            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                            onClick={() => startEdit(job)}
                                            title="Editar"
                                        >
                                            <Pencil className="size-3.5" />
                                        </button>
                                        <button
                                            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                            onClick={() => onRemoveJob(job.id)}
                                            title="Eliminar"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        className="h-7 px-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
                                        onClick={handleUpdate}
                                    >
                                        Guardar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Expanded details */}
                        {isDescExpanded && (
                            <div className="px-3.5 pb-3.5 pt-0 animate-in fade-in">
                                {isEditing ? (
                                    <textarea
                                        className="w-full mt-2 bg-secondary border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-none"
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        rows={3}
                                    />
                                ) : (
                                    <>
                                        {job.description && (
                                            <p className="text-xs text-muted-foreground mt-1 mb-3 bg-secondary/30 p-2 rounded-lg border border-border/50 line-clamp-4">
                                                {job.description}
                                            </p>
                                        )}
                                        {jobCandidates.length > 0 && (
                                            <div className="space-y-1.5 border-t border-border pt-2">
                                                {jobCandidates.map((c) => (
                                                    <CandidateScoreRow key={c.profileUrl} candidate={c} onDelete={onDeleteCandidate} />
                                                ))}
                                                <button
                                                    className="w-full py-1 mt-2 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-md transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); onExportCSV(jobCandidates); }}
                                                >
                                                    Exportar CSV
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Compact candidate row with match score ──
function CandidateScoreRow({ candidate, onDelete }: {
    candidate: import('@/src/shared/types').CandidateProfile;
    onDelete: (url: string) => Promise<void>;
}) {
    const scoreColor = (score: number | undefined) => {
        if (score === undefined) return 'text-muted-foreground border-border';
        if (score >= 75) return 'text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800';
        if (score >= 50) return 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800';
        return 'text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800';
    };

    return (
        <div className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/60 hover:border-primary/30 transition-colors group">
            <div className="min-w-0 flex items-center gap-2">
                <div className="size-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {candidate.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{candidate.fullName || 'Sin nombre'}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{candidate.currentRole}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {candidate.matchScore !== undefined && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${scoreColor(candidate.matchScore)}`}>
                        {candidate.matchScore}%
                    </span>
                )}
                <button
                    className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); onDelete(candidate.profileUrl); }}
                    title="Eliminar"
                >
                    <Trash2 className="size-3.5" />
                </button>
            </div>
        </div>
    );
}

export default App;

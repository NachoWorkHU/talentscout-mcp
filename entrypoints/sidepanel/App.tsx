import { useState, useCallback, useEffect } from 'react';
import type { ContentResponse } from '@/src/shared/messaging';
import type { CandidateProfile, JobFitResult } from '@/src/shared/types';
import { analyzeCandidateProfile, analyzeJobFit, setApiKey } from '@/src/lib/gemini';
import { useCandidateStore } from '@/src/hooks/useCandidateStore';
import { JobFitCard } from '@/src/components/JobFitCard';
import Icebreaker from '@/src/components/Icebreaker';
import { downloadAsCSV } from '@/src/utils/csv_exporter';

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

    const statusConfig: Record<AppStatus, { label: string; className: string }> = {
        ready: { label: 'Listo', className: 'status-ready' },
        scanning: { label: 'Escaneando DOM…', className: 'status-analyzing' },
        analyzing: { label: 'IA analizando…', className: 'status-analyzing' },
        done: { label: 'Perfil extraído', className: 'status-done' },
        error: { label: 'Error', className: 'status-error' },
    };

    const { label: statusLabel, className: statusClass } = statusConfig[status];

    return (
        <div className="app">
            {/* ── Toast ── */}
            {store.toast && (
                <div className={`toast toast-${store.toast.type}`} onClick={store.clearToast}>
                    {store.toast.message}
                </div>
            )}

            {/* ── Header ── */}
            <header className="header">
                <div className="header-left">
                    <h1 className="title">TalentScout</h1>
                    <span className="subtitle">Mini-ATS</span>
                </div>
                <div className="header-actions">
                    <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                    <button
                        className="theme-toggle"
                        onClick={() => setDarkMode(!darkMode)}
                        title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                    >
                        {darkMode ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                        )}
                    </button>
                </div>
            </header>

            {/* ── Tab Navigation ── */}
            <nav className="tab-nav">
                <button
                    className={`tab-btn ${activeTab === 'scanner' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('scanner')}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    Scanner
                </button>
                <button
                    className={`tab-btn ${activeTab === 'jobs' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('jobs')}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    Llamados
                    {store.jobs.length > 0 && (
                        <span className="tab-badge">{store.jobs.length}</span>
                    )}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'settings' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                </button>
            </nav>

            {/* ── Tab Content ── */}
            {activeTab === 'scanner' ? (
                <>
                    {/* Job Selector */}
                    <section className="controls">
                        <div className="job-selector">
                            <label className="section-label" htmlFor="active-job">Llamado activo</label>
                            {store.jobs.length > 0 ? (
                                <select
                                    id="active-job"
                                    className="job-select"
                                    value={store.activeJobId ?? ''}
                                    onChange={(e) => store.setActiveJobId(e.target.value || null)}
                                >
                                    <option value="">Bolsa General (Escaneo Libre)</option>
                                    {store.jobs.map((job) => (
                                        <option key={job.id} value={job.id}>{job.title}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="no-jobs-hint">
                                    Crea un Llamado en la pestaña "Llamados" para habilitar el análisis de compatibilidad automático.
                                </p>
                            )}
                        </div>

                        <button
                            className="btn-analyze"
                            onClick={handleAnalyze}
                            disabled={status === 'scanning' || status === 'analyzing'}
                        >
                            {status === 'scanning' || status === 'analyzing' ? (
                                <>
                                    <span className="spinner" />
                                    {status === 'scanning' ? 'Escaneando DOM…' : 'IA procesando…'}
                                </>
                            ) : (
                                'Analizar perfil'
                            )}
                        </button>
                    </section>

                    {/* Error */}
                    {error && (
                        <div className="error-box">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* Tarjeta de Candidato */}
                    {candidate && (
                        <section className="candidate-card">
                            <div className="candidate-header">
                                <div className="candidate-avatar">
                                    {candidate.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div className="candidate-info">
                                    <h2 className="candidate-name">{candidate.fullName}</h2>
                                    <p className="candidate-role">{candidate.currentRole}</p>
                                    {candidate.location && (
                                        <p className="candidate-location">{candidate.location}</p>
                                    )}
                                </div>
                                <button
                                    className="btn-icon"
                                    title={cardExpanded ? 'Colapsar detalles' : 'Ver detalles'}
                                    onClick={() => setCardExpanded(!cardExpanded)}
                                >
                                    <ChevronDown open={cardExpanded} />
                                </button>
                            </div>

                            {cardExpanded && (
                                <>
                                    {candidate.summary && (
                                        <p className="candidate-summary">{candidate.summary}</p>
                                    )}

                                    {candidate.skills.length > 0 && (
                                        <div className="skills-section">
                                            <h3 className="section-label">Skills</h3>
                                            <div className="skills-tags">
                                                {candidate.skills.map((skill, i) => (
                                                    <span key={i} className="skill-tag">{skill}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {candidate.certifications?.length > 0 && (
                                        <div className="skills-section">
                                            <h3 className="section-label">Certificaciones</h3>
                                            <div className="skills-tags">
                                                {candidate.certifications.map((cert, i) => (
                                                    <span key={i} className="skill-tag cert-tag">{cert}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {candidate.experience.length > 0 && (
                                        <div className="experience-section">
                                            <h3 className="section-label">Experiencia</h3>
                                            <div className="experience-list">
                                                {candidate.experience.map((exp, i) => (
                                                    <div key={i} className="experience-item">
                                                        <span className="exp-role">{exp.role}</span>
                                                        <span className="exp-company">{exp.company}</span>
                                                        <span className="exp-duration">{exp.duration}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Education */}
                                    {candidate.education?.length > 0 && (
                                        <div className="experience-section">
                                            <h3 className="section-label">Educación</h3>
                                            <div className="experience-list">
                                                {candidate.education.map((edu, i) => (
                                                    <div key={i} className="experience-item">
                                                        <span className="exp-role">{edu.degree}</span>
                                                        <span className="exp-company">{edu.institution}</span>
                                                        {edu.year && <span className="exp-duration">{edu.year}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Contact info */}
                                    {(candidate.email || candidate.phone) && (
                                        <div className="skills-section">
                                            <h3 className="section-label">Contacto</h3>
                                            <div className="skills-tags">
                                                {candidate.email && (
                                                    <span className="skill-tag">{candidate.email}</span>
                                                )}
                                                {candidate.phone && (
                                                    <span className="skill-tag">{candidate.phone}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="candidate-source">
                                <span className={`source-badge source-${candidate.source}`}>
                                    {candidate.source.toUpperCase()}
                                </span>
                                {candidate.profileUrl && (
                                    <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer" className="profile-link">
                                        Ver perfil ↗
                                    </a>
                                )}
                            </div>

                            <div className="candidate-actions">
                                <button
                                    className={`btn-save ${alreadySaved ? 'btn-saved' : ''}`}
                                    onClick={handleSave}
                                    disabled={alreadySaved}
                                >
                                    {alreadySaved ? 'Guardado' : 'Guardar candidato'}
                                </button>
                                {activeJob && !fitResult && (
                                    <button
                                        className="btn-fit"
                                        onClick={handleManualFit}
                                        disabled={fitLoading}
                                    >
                                        {fitLoading ? (
                                            <><span className="spinner" /> Analizando fit...</>
                                        ) : (
                                            'Analizar compatibilidad'
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Icebreaker */}
                            <Icebreaker candidate={candidate} jobPost={activeJob} />
                        </section>
                    )}

                    {/* Fit Result */}
                    {fitResult && <JobFitCard result={fitResult} />}

                    {/* Debug */}
                    {domMap && (
                        <section className="debug-section">
                            <button className="debug-toggle" onClick={() => setShowDebug(!showDebug)}>
                                <span>{showDebug ? '▼' : '▶'} Debug: DOM Map</span>
                                <span className="badge">{elementCount} nodos</span>
                            </button>
                            {showDebug && <pre className="debug-output">{domMap}</pre>}
                        </section>
                    )}
                </>
            ) : activeTab === 'jobs' ? (
                /* ── Mis Llamados ── */
                <div className="candidate-list-view">
                    <div className="list-header">
                        <h2 className="list-title">
                            Llamados
                            <span className="list-count">{store.jobs.length}</span>
                        </h2>
                    </div>

                    {/* Placeholder — Fase 2 will build the full job list + create form */}
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
            ) : activeTab === 'settings' ? (
                /* ── Settings ── */
                <div className="candidate-list-view">
                    <div className="list-header">
                        <h2 className="list-title">Configuración</h2>
                    </div>
                    <div className="jobs-list">
                        <div className="job-form">
                            <label className="section-label" htmlFor="api-key">Gemini API Key</label>
                            <p className="no-jobs-hint" style={{ marginBottom: '8px' }}>
                                Obtén tu clave en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="profile-link">Google AI Studio</a>
                            </p>
                            <input
                                id="api-key"
                                className="job-input"
                                type="password"
                                placeholder="AIzaSy..."
                                value={apiKeyInput}
                                onChange={(e) => { setApiKeyInput(e.target.value); setApiKeySet(false); }}
                                onFocus={() => { if (apiKeySet) { setApiKeyInput(''); setApiKeySet(false); } }}
                            />
                            <button
                                className={`btn-fit ${apiKeySet ? 'btn-saved' : ''}`}
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
                                {apiKeySet ? 'Guardada' : 'Guardar API Key'}
                            </button>
                        </div>

                        {/* Storage usage */}
                        {store.storageUsage > 50 && (
                            <div className="job-form" style={{ marginTop: 8 }}>
                                <label className="section-label">Almacenamiento</label>
                                <div className="storage-bar-track">
                                    <div
                                        className={`storage-bar-fill ${store.storageUsage >= 80 ? 'storage-bar-warn' : ''}`}
                                        style={{ width: `${store.storageUsage}%` }}
                                    />
                                </div>
                                <span className="char-counter">{store.storageUsage}% usado de 5 MB</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// ── SVG Icon helpers ──
const ChevronDown = ({ open }: { open: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9" /></svg>
);
const PencilIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
);
const TrashIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);
const FolderIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
);

// ── Score color helper ──
function scoreColor(score: number | undefined): string {
    if (score === undefined) return 'var(--text-muted)';
    if (score >= 75) return 'var(--color-score-high, #22c55e)';
    if (score >= 50) return 'var(--color-score-mid, #f59e0b)';
    return 'var(--color-score-low, #ef4444)';
}

// ── Compact candidate row with match score ──
function CandidateScoreRow({ candidate, onDelete }: {
    candidate: import('@/src/shared/types').CandidateProfile;
    onDelete: (url: string) => Promise<void>;
}) {
    return (
        <div className="candidate-score-row">
            <div className="candidate-score-info">
                <span className="candidate-score-name">{candidate.fullName || 'Sin nombre'}</span>
                <span className="candidate-score-role">{candidate.currentRole}</span>
            </div>
            <div className="candidate-score-actions">
                {candidate.matchScore !== undefined && (
                    <span className="score-pill" style={{ borderColor: scoreColor(candidate.matchScore), color: scoreColor(candidate.matchScore) }}>
                        {candidate.matchScore}%
                    </span>
                )}
                <button className="btn-icon btn-icon-sm" title="Eliminar" onClick={() => onDelete(candidate.profileUrl)}>
                    <TrashIcon />
                </button>
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
        <div className="jobs-list">
            {/* Create Job Button */}
            {!showForm && (
                <button className="btn-analyze" onClick={() => setShowForm(true)}>
                    + Nuevo llamado
                </button>
            )}

            {/* Create Job Form */}
            {showForm && (
                <div className="job-form">
                    <input
                        className="job-input"
                        placeholder="Título del puesto (e.g. Frontend Developer Sr.)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <textarea
                        className="jd-textarea"
                        placeholder="Pega aquí la Job Description completa..."
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        rows={5}
                        maxLength={10000}
                    />
                    {desc.length > 0 && (
                        <span className="char-counter">{desc.length.toLocaleString()} / 10,000</span>
                    )}
                    <div className="job-form-actions">
                        <button className="btn-fit" onClick={handleCreate} disabled={!title.trim()}>
                            Crear llamado
                        </button>
                        <button className="btn-fit" onClick={() => setShowForm(false)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bolsa General ── */}
            <div className="job-card">
                <div className="job-card-header">
                    <div className="job-card-info">
                        <span className="job-card-title"><FolderIcon /> Bolsa General</span>
                        <span className="job-card-meta">
                            {unassigned.length} candidato{unassigned.length !== 1 ? 's' : ''} sin asignar
                        </span>
                    </div>
                    <div className="job-card-actions">
                        {unassigned.length > 0 && (
                            <button
                                className="btn-csv"
                                onClick={(e) => { e.stopPropagation(); onExportCSV(unassigned); }}
                                title="Exportar candidatos"
                            >
                                CSV
                            </button>
                        )}
                    </div>
                </div>
                {/* Candidates always visible */}
                {unassigned.length > 0 && (
                    <div className="job-card-candidates">
                        {unassigned.map((c) => (
                            <CandidateScoreRow key={c.profileUrl} candidate={c} onDelete={onDeleteCandidate} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Job Cards ── */}
            {jobs.length === 0 && !showForm && (
                <div className="list-empty">
                    <span className="list-empty-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    </span>
                    <p>No hay llamados aún.</p>
                    <p className="list-empty-hint">
                        Crea un llamado para empezar a reclutar candidatos.
                    </p>
                </div>
            )}

            {jobs.map((job) => {
                const jobCandidates = getCandidatesForJob(job.id);
                const isDescExpanded = expandedDescId === job.id;
                const isEditing = editingJobId === job.id;

                return (
                    <div key={job.id} className="job-card">
                        {/* Header row */}
                        <div className="job-card-header">
                            <div className="job-card-info">
                                <span className="job-card-title">{job.title}</span>
                                <span className="job-card-meta">
                                    {jobCandidates.length} candidato{jobCandidates.length !== 1 ? 's' : ''} · {new Date(job.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="job-card-actions">
                                {jobCandidates.length > 0 && (
                                    <button
                                        className="btn-csv"
                                        onClick={(e) => { e.stopPropagation(); onExportCSV(jobCandidates); }}
                                        title="Exportar CSV"
                                    >
                                        CSV
                                    </button>
                                )}
                                <button className="btn-icon" title="Editar" onClick={() => startEdit(job)}>
                                    <PencilIcon />
                                </button>
                                <button className="btn-icon" title="Eliminar" onClick={() => onRemoveJob(job.id)}>
                                    <TrashIcon />
                                </button>
                                <button
                                    className="btn-icon"
                                    title={isDescExpanded ? 'Ocultar descripción' : 'Ver descripción'}
                                    onClick={() => setExpandedDescId(isDescExpanded ? null : job.id)}
                                >
                                    <ChevronDown open={isDescExpanded} />
                                </button>
                            </div>
                        </div>

                        {/* Expandable: description / edit form */}
                        {isDescExpanded && (
                            <div className="job-card-body">
                                {isEditing ? (
                                    <div className="job-form">
                                        <input
                                            className="job-input"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                        />
                                        <textarea
                                            className="jd-textarea"
                                            value={editDesc}
                                            onChange={(e) => setEditDesc(e.target.value)}
                                            rows={5}
                                            maxLength={10000}
                                        />
                                        {editDesc.length > 0 && (
                                            <span className="char-counter">{editDesc.length.toLocaleString()} / 10,000</span>
                                        )}
                                        <div className="job-form-actions">
                                            <button className="btn-fit" onClick={handleUpdate} disabled={!editTitle.trim()}>
                                                Guardar cambios
                                            </button>
                                            <button className="btn-fit" onClick={() => setEditingJobId(null)}>
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="job-card-desc">{job.description || 'Sin descripción.'}</p>
                                )}
                            </div>
                        )}

                        {/* Candidates always visible with match scores */}
                        {jobCandidates.length > 0 && (
                            <div className="job-card-candidates">
                                {jobCandidates.map((c) => (
                                    <CandidateScoreRow key={c.profileUrl} candidate={c} onDelete={onDeleteCandidate} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default App;

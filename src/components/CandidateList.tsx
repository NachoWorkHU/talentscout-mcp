/**
 * CandidateList — Vista de candidatos guardados.
 *
 * Props simples: candidates array + onDelete callback.
 */
import type { CandidateProfile } from '@/src/shared/types';

interface Props {
    candidates: CandidateProfile[];
    onDelete: (profileUrl: string) => void;
}

export function CandidateList({ candidates, onDelete }: Props) {
    if (candidates.length === 0) {
        return (
            <div className="list-empty">
                <span className="list-empty-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </span>
                <p>No hay candidatos aún.</p>
                <p className="list-empty-hint">
                    Analiza un perfil en Scanner y guárdalo.
                </p>
            </div>
        );
    }

    return (
        <div className="list-cards">
            {candidates.map((c) => (
                <div
                    key={c.profileUrl}
                    className="list-card"
                    onClick={() => window.open(c.profileUrl, '_blank')}
                    title="Click para abrir perfil"
                >
                    {/* Avatar */}
                    <div className="list-card-avatar">
                        {c.fullName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="list-card-info">
                        <span className="list-card-name">{c.fullName}</span>
                        <span className="list-card-role">{c.currentRole}</span>
                        {c.experience.length > 0 && (
                            <span className="list-card-company">
                                {c.experience[0].company}
                            </span>
                        )}
                        <div className="list-card-meta">
                            <span className={`source-badge source-${c.source}`}>
                                {c.source.toUpperCase()}
                            </span>
                            {c.savedAt && (
                                <span className="list-card-date">
                                    {new Date(c.savedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Delete */}
                    <button
                        className="list-card-delete"
                        title="Eliminar candidato"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(c.profileUrl);
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                </div>
            ))}
        </div>
    );
}

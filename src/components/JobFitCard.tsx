/**
 * JobFitCard — Muestra el resultado del análisis de compatibilidad.
 */
import type { JobFitResult } from '@/src/shared/types';

interface Props {
    result: JobFitResult;
}

function getScoreColor(score: number): string {
    if (score >= 75) return 'var(--success)';
    if (score >= 50) return 'var(--info)';
    return 'var(--error)';
}

function getScoreLabel(score: number): string {
    if (score >= 85) return 'Excelente match';
    if (score >= 70) return 'Buen match';
    if (score >= 50) return 'Match parcial';
    if (score >= 30) return 'Match bajo';
    return 'No compatible';
}

export function JobFitCard({ result }: Props) {
    const { score, verdict, matchingSkills, gaps, strengths } = result;
    const color = getScoreColor(score);

    return (
        <section className="fit-card">
            {/* Score */}
            <div className="fit-score-row">
                <div className="fit-score-ring" style={{ '--score-color': color, '--score-pct': `${score}%` } as React.CSSProperties}>
                    <span className="fit-score-value">{score}</span>
                </div>
                <div className="fit-score-info">
                    <span className="fit-score-label" style={{ color }}>{getScoreLabel(score)}</span>
                    <p className="fit-verdict">{verdict}</p>
                </div>
            </div>

            {/* Matching Skills */}
            {matchingSkills.length > 0 && (
                <div className="fit-section">
                    <h4 className="fit-section-title fit-match">Skills que coinciden</h4>
                    <div className="fit-tags">
                        {matchingSkills.map((s, i) => (
                            <span key={i} className="fit-tag fit-tag-match">{s}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Strengths */}
            {strengths.length > 0 && (
                <div className="fit-section">
                    <h4 className="fit-section-title fit-strength">Puntos fuertes</h4>
                    <ul className="fit-list">
                        {strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Gaps */}
            {gaps.length > 0 && (
                <div className="fit-section">
                    <h4 className="fit-section-title fit-gap">Gaps detectados</h4>
                    <ul className="fit-list fit-list-gap">
                        {gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

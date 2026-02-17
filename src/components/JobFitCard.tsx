/**
 * JobFitCard — Muestra el resultado del análisis de compatibilidad.
 */
import type { JobFitResult } from '@/src/shared/types';
import { CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

interface Props {
    result: JobFitResult;
}

function getScoreColorClass(score: number): string {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-500 dark:text-amber-400';
    return 'text-red-500 dark:text-red-400';
}

function getScoreRingStyle(score: number): React.CSSProperties {
    let color = '#ef4444'; // Red
    if (score >= 75) color = '#10b981'; // Emerald
    else if (score >= 50) color = '#f59e0b'; // Amber

    return {
        background: `conic-gradient(${color} ${score}%, transparent ${score}%)`
    };
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
    const scoreColorClass = getScoreColorClass(score);

    return (
        <section className="bg-card rounded-xl p-5 border border-border shadow-sm flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Header: Score & Verdict */}
            <div className="flex items-center gap-5">
                <div className="relative size-16 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <div className="absolute inset-0 rounded-full opacity-20" style={getScoreRingStyle(score)} />
                    <div className="absolute inset-[3px] bg-card rounded-full flex items-center justify-center">
                        <span className={`text-xl font-bold ${scoreColorClass}`}>{score}</span>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <span className={`font-bold text-base ${scoreColorClass}`}>
                        {getScoreLabel(score)}
                    </span>
                    <p className="text-sm text-muted-foreground leading-snug">
                        {verdict}
                    </p>
                </div>
            </div>

            {/* Separator */}
            <hr className="border-border/50" />

            {/* Matching Skills */}
            {matchingSkills.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-500" /> Matches
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {matchingSkills.map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 transition-colors hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Strengths */}
            {strengths.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="size-3.5 text-blue-500" /> Puntos Fuertes
                    </h4>
                    <ul className="space-y-2">
                        {strengths.map((s, i) => (
                            <li key={i} className="text-sm text-foreground/90 border-l-2 border-blue-500 pl-3 bg-blue-50/50 dark:bg-blue-900/10 py-1 rounded-r-md">
                                {s}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Gaps */}
            {gaps.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <AlertCircle className="size-3.5 text-red-500" /> Gaps Detectados
                    </h4>
                    <ul className="space-y-2">
                        {gaps.map((g, i) => (
                            <li key={i} className="text-sm text-muted-foreground border-l-2 border-red-500 pl-3 bg-red-50/50 dark:bg-red-900/10 py-1 rounded-r-md">
                                {g}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

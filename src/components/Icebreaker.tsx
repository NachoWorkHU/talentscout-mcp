/**
 * Icebreaker — Generador de mensajes de contacto hiper-personalizados.
 */
import { useState } from 'react';
import type { CandidateProfile, JobPost } from '@/src/shared/types';
import { generateOutreachMessage } from '@/src/lib/gemini';
import { Sparkles, Copy, Check, RefreshCw } from 'lucide-react';

interface IcebreakerProps {
    candidate: CandidateProfile;
    jobPost?: JobPost | null;
}

import { ChevronDown, ChevronUp } from 'lucide-react';

export default function Icebreaker({ candidate, jobPost }: IcebreakerProps) {
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);

    const handleGenerate = async () => {
        setLoading(true);
        setError('');
        setMessage('');
        setCopied(false);
        try {
            const text = await generateOutreachMessage(
                candidate,
                jobPost?.description,
            );

            setMessage(text);
            setIsExpanded(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = message;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="w-full">
            {/* Generate Button */}
            {!message && !loading && (
                <button
                    className="w-full h-10 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-all flex items-center justify-center gap-2 text-sm shadow-sm border border-border"
                    onClick={handleGenerate}
                >
                    <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
                    <span>Generar mensaje de contacto</span>
                </button>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground bg-muted/30 rounded-xl">
                    <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Generando mensaje personalizado con IA...</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/20 mt-2">
                    {error}
                </div>
            )}

            {/* Message Result */}
            {message && (
                <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Sparkles className="size-3 text-purple-500" /> Mensaje Sugerido
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-secondary"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </button>
                            {isExpanded && (
                                <button
                                    className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-secondary"
                                    onClick={handleGenerate}
                                >
                                    <RefreshCw className="size-3" /> Regenerar
                                </button>
                            )}
                            <button
                                className={`text-xs font-semibold transition-all flex items-center gap-1.5 px-2.5 py-1 rounded-md border shadow-sm
                                ${copied
                                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                                        : 'bg-background text-foreground border-border hover:bg-secondary'}`}
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="p-4 bg-muted/50 text-sm rounded-lg border-l-4 border-primary font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                            {message}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

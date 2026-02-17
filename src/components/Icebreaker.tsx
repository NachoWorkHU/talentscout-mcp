/**
 * Icebreaker — Generador de mensajes de contacto hiper-personalizados.
 *
 * Recibe un CandidateProfile y opcionalmente un JobPost.
 * Llama a generateOutreachMessage() y renderiza el resultado
 * con botón de copiar al portapapeles.
 */
import { useState } from 'react';
import type { CandidateProfile, JobPost } from '@/src/shared/types';
import { generateOutreachMessage } from '@/src/lib/gemini';

interface IcebreakerProps {
    candidate: CandidateProfile;
    jobPost?: JobPost | null;
}

export default function Icebreaker({ candidate, jobPost }: IcebreakerProps) {
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

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
            // Fallback for environments where clipboard API fails
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
        <div className="icebreaker">
            {/* Generate Button */}
            {!message && !loading && (
                <button className="icebreaker-btn" onClick={handleGenerate}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
                    </svg>
                    Generar mensaje de contacto
                </button>
            )}

            {/* Loading State */}
            {loading && (
                <div className="icebreaker-loading">
                    <span className="spinner" />
                    Generando mensaje personalizado…
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="error-box" style={{ marginTop: 8 }}>
                    {error}
                </div>
            )}

            {/* Message Result */}
            {message && (
                <div className="icebreaker-result">
                    <div className="icebreaker-header">
                        <span className="icebreaker-label">Mensaje generado</span>
                        <button
                            className="icebreaker-copy"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    Copiado
                                </>
                            ) : (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    Copiar
                                </>
                            )}
                        </button>
                    </div>
                    <div className="icebreaker-message">
                        {message}
                    </div>
                    <button className="icebreaker-regen" onClick={handleGenerate}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        Regenerar
                    </button>
                </div>
            )}
        </div>
    );
}

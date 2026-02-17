/**
 * Gemini AI Client — Motor de Extracción de Perfiles
 *
 * Envía el DOM Map al modelo Gemini Flash y devuelve un CandidateProfile tipado.
 * La API key se almacena en chrome.storage.sync para no exponerla en el código fuente.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CandidateProfile, JobFitResult } from '@/src/shared/types';
import { log } from '@/src/utils/logger';

// ─── Config ───
const STORAGE_KEY_API = 'talentscout_api_key';
const MODEL_NAME = 'gemini-2.0-flash-lite';
const MAX_RETRIES = 3;

// ─── Singleton (lazy init) ───
let _genAI: GoogleGenerativeAI | null = null;
let _cachedKey: string | null = null;

/**
 * Returns the API key from chrome.storage.sync.
 * Falls back to a hardcoded default if present (for dev convenience).
 */
async function getApiKey(): Promise<string> {
    if (_cachedKey) return _cachedKey;
    try {
        const result = await browser.storage.sync.get(STORAGE_KEY_API);
        const key = result[STORAGE_KEY_API];
        if (key && typeof key === 'string' && key.trim().length >= 10) {
            _cachedKey = key.trim();
            return _cachedKey;
        }
    } catch {
        // chrome.storage may not be available in test environments
    }
    throw new Error(
        'API Key no configurada. Ve a la configuración de TalentScout y establece tu clave de Google AI Studio.',
    );
}

/**
 * Sets the Gemini API key in chrome.storage.sync.
 * This is called from the settings UI.
 */
export async function setApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (trimmed.length < 10) {
        throw new Error('API Key inválida. Debe tener al menos 10 caracteres.');
    }
    await browser.storage.sync.set({ [STORAGE_KEY_API]: trimmed });
    _cachedKey = trimmed;
    _genAI = null; // Force re-init with new key
}

/**
 * Get or create the GoogleGenerativeAI singleton.
 */
async function getGenAI(): Promise<GoogleGenerativeAI> {
    const key = await getApiKey();
    if (!_genAI || key !== _cachedKey) {
        _genAI = new GoogleGenerativeAI(key);
    }
    return _genAI;
}

// ─── Helpers ───

/** Safely parse JSON, stripping markdown fences if present */
function safeParseJSON(text: string): unknown {
    let cleaned = text.trim();
    // Remove markdown code fences that Gemini sometimes adds despite instructions
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(cleaned);
}

/** Exponential backoff delay */
function backoffDelay(attempt: number): number {
    return Math.pow(2, attempt) * 15_000; // 30s, 60s
}

/** Check if error is retriable (rate limit) */
function isQuotaError(msg: string): boolean {
    return msg.includes('429') || msg.includes('quota') || msg.includes('Quota');
}

/** Check if daily quota is exhausted */
function isDailyQuotaExhausted(msg: string): boolean {
    return msg.includes('limit: 0') && msg.includes('PerDay');
}

// ─── Throttle guard ───
const MIN_CALL_GAP_MS = 2000;
let _lastCallTime = 0;
let _callInFlight = false;

/**
 * Ensures minimum gap between Gemini calls and blocks concurrent requests.
 * Throws user-friendly error if throttled.
 */
function throttleGuard() {
    if (_callInFlight) {
        throw new Error('Ya hay una solicitud a Gemini en curso. Esperá a que termine.');
    }
    const now = Date.now();
    const elapsed = now - _lastCallTime;
    if (elapsed < MIN_CALL_GAP_MS) {
        throw new Error(`Demasiadas solicitudes. Esperá ${Math.ceil((MIN_CALL_GAP_MS - elapsed) / 1000)}s.`);
    }
    _callInFlight = true;
    _lastCallTime = now;
}

function releaseThrottle() {
    _callInFlight = false;
}

// ─── System Prompt de Reclutamiento ───
const RECRUITMENT_SYSTEM_PROMPT = `Eres un agente de reclutamiento experto. Tu tarea es analizar un mapa del DOM de una página web (un perfil profesional) y extraer información estructurada del candidato.

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin markdown, sin explicaciones.
2. Si no encuentras un campo, usa un string vacío "" para strings, o un array vacío [] para arrays.
3. El campo "source" debe ser "linkedin" si la URL contiene linkedin.com, "indeed" si contiene indeed.com, o "other" en cualquier otro caso.
4. El campo "status" siempre debe ser "new" en la extracción inicial.
5. Extrae TODAS las habilidades (skills) que encuentres, como tags individuales.
6. Para experiencia, extrae cada posición como un objeto separado con empresa, rol y duración.
7. Extrae TODAS las certificaciones y licencias (nombre completo de la certificación).
8. Extrae TODA la educación (institución, título/grado, año de graduación).
9. Si encuentras un email o teléfono visible en el DOM, extráelo. Si no está visible, deja un string vacío.
10. Sé preciso: no inventes datos que no estén presentes en el DOM.

SCHEMA JSON OBLIGATORIO:
{
  "fullName": "string",
  "currentRole": "string",
  "location": "string",
  "profileUrl": "string",
  "source": "linkedin" | "indeed" | "other",
  "summary": "string",
  "email": "string",
  "phone": "string",
  "skills": ["string"],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string"
    }
  ],
  "certifications": ["string"],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "year": "string"
    }
  ],
  "status": "new"
}`;

/**
 * Analiza un DOM Map y extrae el perfil del candidato usando Gemini.
 */
export async function analyzeCandidateProfile(
    domMap: string,
    pageUrl: string = '',
): Promise<CandidateProfile> {
    const genAI = await getGenAI();

    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 2048,
        },
        systemInstruction: RECRUITMENT_SYSTEM_PROMPT,
    });

    const userPrompt = `Analiza el siguiente mapa del DOM de un perfil profesional y extrae los datos del candidato en formato JSON.

URL de la página: ${pageUrl || 'desconocida'}

MAPA DEL DOM:
${domMap}`;

    let lastError: Error | null = null;

    throttleGuard();
    try {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = backoffDelay(attempt);
                    log.info(`Reintentando en ${delay / 1000}s (intento ${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise((r) => setTimeout(r, delay));
                }

                const result = await model.generateContent(userPrompt);
                const responseText = result.response.text();
                const parsed = safeParseJSON(responseText) as Record<string, unknown>;

                const profile: CandidateProfile = {
                    fullName: String(parsed.fullName || ''),
                    currentRole: String(parsed.currentRole || ''),
                    location: String(parsed.location || ''),
                    profileUrl: String(parsed.profileUrl || pageUrl || ''),
                    source: inferSource(parsed.source as string, pageUrl),
                    summary: String(parsed.summary || ''),
                    email: String(parsed.email || ''),
                    phone: String(parsed.phone || ''),
                    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
                    experience: Array.isArray(parsed.experience)
                        ? parsed.experience.map((exp: Record<string, string>) => ({
                            company: String(exp.company || ''),
                            role: String(exp.role || ''),
                            duration: String(exp.duration || ''),
                        }))
                        : [],
                    certifications: Array.isArray(parsed.certifications) ? parsed.certifications.map(String) : [],
                    education: Array.isArray(parsed.education)
                        ? parsed.education.map((edu: Record<string, string>) => ({
                            institution: String(edu.institution || ''),
                            degree: String(edu.degree || ''),
                            year: String(edu.year || ''),
                        }))
                        : [],
                    status: 'new',
                };

                return profile;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const msg = lastError.message;

                if (isQuotaError(msg)) {
                    if (isDailyQuotaExhausted(msg)) {
                        throw new Error(
                            '⏳ Cuota diaria agotada para el free tier de Gemini. ' +
                            'Opciones:\n' +
                            '1. Espera a que se resetee (~24h)\n' +
                            '2. Crea otra API Key en https://aistudio.google.com/apikey\n' +
                            '3. Activa la facturación en Google Cloud para límites más altos',
                        );
                    }
                    log.warn(`Rate limit (intento ${attempt + 1}), reintentando...`);
                    continue;
                }

                if (err instanceof SyntaxError) {
                    throw new Error('Gemini devolvió una respuesta que no es JSON válido. Intenta de nuevo.');
                }

                throw lastError;
            }
        }
    } finally {
        releaseThrottle();
    }

    throw new Error(
        `Gemini no respondió después de ${MAX_RETRIES} intentos. ` +
        `Último error: ${lastError?.message ?? 'desconocido'}`,
    );
}

/**
 * Infiere la fuente del perfil basándose en la URL.
 */
function inferSource(
    parsedSource: string | undefined,
    url: string,
): CandidateProfile['source'] {
    if (parsedSource === 'linkedin' || parsedSource === 'indeed') {
        return parsedSource;
    }
    if (url.includes('linkedin.com')) return 'linkedin';
    if (url.includes('indeed.com')) return 'indeed';
    return 'other';
}

// ═══════════════════════════════════════
//  Job Fit Analysis
// ═══════════════════════════════════════

const JOB_FIT_PROMPT = `Eres un analista de reclutamiento experto. Recibirás el perfil JSON de un candidato y una Job Description (JD) en texto plano.

Tu tarea es evaluar la compatibilidad entre el candidato y la posición.

REGLAS:
1. Responde ÚNICAMENTE con un objeto JSON válido.
2. El "score" es un número entero de 0 a 100, donde 100 = candidato perfecto.
3. "verdict" es una oración corta y directa (máx 15 palabras).
4. "matchingSkills" son las skills del candidato que coinciden con lo que pide la JD.
5. "gaps" son requisitos de la JD que el candidato NO tiene.
6. "strengths" son aspectos donde el candidato supera lo que pide la JD.
7. Considera TODAS las secciones del perfil: skills, experiencia, certificaciones, educación y resumen.
8. Sé objetivo y preciso. No inventes datos.

SCHEMA JSON:
{
  "score": number,
  "verdict": "string",
  "matchingSkills": ["string"],
  "gaps": ["string"],
  "strengths": ["string"]
}`;

/**
 * Compara un CandidateProfile contra una Job Description.
 * Includes retry logic matching analyzeCandidateProfile.
 */
export async function analyzeJobFit(
    candidate: CandidateProfile,
    jobDescription: string,
): Promise<JobFitResult> {
    const genAI = await getGenAI();

    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 1024,
        },
        systemInstruction: JOB_FIT_PROMPT,
    });

    const userPrompt = `PERFIL DEL CANDIDATO:\n${JSON.stringify(candidate, null, 2)}\n\nJOB DESCRIPTION:\n${jobDescription}`;

    let lastError: Error | null = null;

    throttleGuard();
    try {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = backoffDelay(attempt);
                    log.info(`Fit retry in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise((r) => setTimeout(r, delay));
                }

                const result = await model.generateContent(userPrompt);
                const parsed = safeParseJSON(result.response.text()) as Record<string, unknown>;

                return {
                    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
                    verdict: String(parsed.verdict ?? ''),
                    matchingSkills: Array.isArray(parsed.matchingSkills) ? parsed.matchingSkills.map(String) : [],
                    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
                    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
                };
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const msg = lastError.message;

                if (isQuotaError(msg)) {
                    if (isDailyQuotaExhausted(msg)) {
                        throw new Error('⏳ Cuota diaria agotada. Espera ~24h o usa otra API Key.');
                    }
                    log.warn(`Fit rate limit (attempt ${attempt + 1}), retrying...`);
                    continue;
                }

                if (err instanceof SyntaxError) {
                    throw new Error('Gemini devolvió JSON inválido en análisis de fit. Intenta de nuevo.');
                }

                throw lastError;
            }
        }
    } finally {
        releaseThrottle();
    }

    throw new Error(
        `Fit analysis failed after ${MAX_RETRIES} attempts. Last: ${lastError?.message ?? 'unknown'}`,
    );
}

// ═══════════════════════════════════════
//  Icebreaker — Outreach Message Generator
// ═══════════════════════════════════════

const OUTREACH_PROMPT = `Eres un Reclutador Tech empático y profesional. Tu tarea es escribir un mensaje de contacto (icebreaker) para enviar por LinkedIn o Email a un candidato.

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con el cuerpo del mensaje. Sin asuntos (subject lines), sin encabezados, sin formato markdown.
2. Máximo 3 párrafos cortos.
3. Menciona al candidato por su NOMBRE DE PILA (primer nombre).
4. Menciona UNA experiencia o skill específico de su perfil que te llamó la atención (ej: "Me llamó la atención tu experiencia con React en [Empresa]" o "Vi que tenés certificación en [X], eso es muy valioso").
5. Si se proporciona una Job Description, menciona brevemente que tenés un rol que hace match con su perfil, sin copiar la JD entera.
6. Si NO hay Job Description, hazlo una invitación general a conectar y explorar oportunidades.
7. Tono: Profesional pero cercano. Tuteo respetuoso (usá "vos/tu"). No seas demasiado formal ni demasiado casual.
8. NO uses emojis.
9. Firma como "Equipo de Reclutamiento" al final.
10. El mensaje debe sentirse genuino, no genérico. Referenciá datos reales del perfil.`;

/**
 * Genera un mensaje de outreach hiper-personalizado para contactar a un candidato.
 */
export async function generateOutreachMessage(
    candidate: CandidateProfile,
    jobDescription?: string,
): Promise<string> {
    const genAI = await getGenAI();

    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
        },
        systemInstruction: OUTREACH_PROMPT,
    });

    const candidateSummary = [
        `Nombre: ${candidate.fullName}`,
        `Rol actual: ${candidate.currentRole}`,
        candidate.location ? `Ubicación: ${candidate.location}` : '',
        candidate.summary ? `Resumen: ${candidate.summary}` : '',
        candidate.skills.length > 0 ? `Skills: ${candidate.skills.join(', ')}` : '',
        candidate.experience.length > 0
            ? `Experiencia: ${candidate.experience.map((e) => `${e.role} en ${e.company} (${e.duration})`).join('; ')}`
            : '',
        candidate.certifications?.length > 0 ? `Certificaciones: ${candidate.certifications.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const userPrompt = jobDescription
        ? `PERFIL DEL CANDIDATO:\n${candidateSummary}\n\nJOB DESCRIPTION DEL ROL ABIERTO:\n${jobDescription}\n\nGenera el mensaje de contacto.`
        : `PERFIL DEL CANDIDATO:\n${candidateSummary}\n\nNo hay una posición específica. Genera un mensaje de invitación general a conectar y explorar oportunidades.`;

    let lastError: Error | null = null;

    throttleGuard();
    try {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = backoffDelay(attempt);
                    log.info(`Outreach retry in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise((r) => setTimeout(r, delay));
                }

                const result = await model.generateContent(userPrompt);
                const text = result.response.text().trim();

                if (!text || text.length < 20) {
                    throw new Error('Gemini devolvió un mensaje vacío o demasiado corto.');
                }

                return text;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const msg = lastError.message;

                if (isQuotaError(msg)) {
                    if (isDailyQuotaExhausted(msg)) {
                        throw new Error('⏳ Cuota diaria agotada. Espera ~24h o usa otra API Key.');
                    }
                    log.warn(`Outreach rate limit (attempt ${attempt + 1}), retrying...`);
                    continue;
                }

                throw lastError;
            }
        }
    } finally {
        releaseThrottle();
    }

    throw new Error(
        `Outreach generation failed after ${MAX_RETRIES} attempts. Last: ${lastError?.message ?? 'unknown'}`,
    );
}

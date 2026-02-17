/**
 * Schema de datos para TalentScout MCP — Mini-ATS.
 *
 * Centrado en "Llamados" (JobPost) como unidad principal.
 * Los candidatos se asocian a un Llamado via jobId.
 */

// ═══════════════════════════════════════
//  Puesto de Trabajo / Llamado
// ═══════════════════════════════════════

export interface JobPost {
    /** Identificador único (UUID) */
    id: string;

    /** Título del puesto (e.g. "Frontend Developer Sr.") */
    title: string;

    /** Job Description completa */
    description: string;

    /** Fecha de creación (ISO string) */
    createdAt: string;

    /** Fecha de última actualización (ISO string) */
    updatedAt: string;
}

// ═══════════════════════════════════════
//  Perfil de Candidato
// ═══════════════════════════════════════

export interface CandidateProfile {
    /** ID interno generado por la extensión */
    id?: string;

    /** Nombre completo del candidato */
    fullName: string;

    /** Rol/cargo actual */
    currentRole: string;

    /** Ubicación geográfica */
    location: string;

    /** URL del perfil original */
    profileUrl: string;

    /** Plataforma de origen */
    source: 'linkedin' | 'indeed' | 'other';

    /** Resumen profesional / headline */
    summary?: string;

    /** Email de contacto (si es visible) */
    email?: string;

    /** Teléfono de contacto (si es visible) */
    phone?: string;

    /** Lista de habilidades */
    skills: string[];

    /** Historial de experiencia laboral */
    experience: {
        company: string;
        role: string;
        duration: string;
    }[];

    /** Certificaciones y licencias */
    certifications: string[];

    /** Educación */
    education: {
        institution: string;
        degree: string;
        year: string;
    }[];

    /** ID del Llamado al que está asociado */
    jobId?: string;

    /** Score de compatibilidad con el Llamado (0-100) */
    matchScore?: number;

    /** Fecha de guardado (ISO string) */
    savedAt?: string;

    /** Estado del candidato en el pipeline */
    status: 'new' | 'contacted' | 'saved';
}

// ═══════════════════════════════════════
//  Resultado de Análisis de Fit
// ═══════════════════════════════════════

export interface JobFitResult {
    /** Score de compatibilidad (0-100) */
    score: number;

    /** Resumen de una oración */
    verdict: string;

    /** Skills que coinciden con la JD */
    matchingSkills: string[];

    /** Lo que le falta al candidato vs la JD */
    gaps: string[];

    /** Puntos fuertes del candidato para este rol */
    strengths: string[];
}

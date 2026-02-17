/**
 * ErrorBoundary — Captura errores de renderizado React.
 *
 * Muestra una UI de recuperación en lugar de una pantalla en blanco.
 * Incluye botón "Reintentar" que resetea el estado.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[TalentScout] React Error Boundary:', error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-boundary-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <h2 className="error-boundary-title">Algo salió mal</h2>
                    <p className="error-boundary-message">
                        {this.state.error?.message || 'Error inesperado en la aplicación.'}
                    </p>
                    <button className="error-boundary-btn" onClick={this.handleRetry}>
                        Reintentar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

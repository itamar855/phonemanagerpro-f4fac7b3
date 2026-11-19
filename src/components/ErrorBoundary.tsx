import React, { Component, ErrorInfo, ReactNode } from "react";
import debugLogger from "@/utils/debugLogger";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/staleBuild";

// ============================================================
// CellManagerPro — Error Boundary
// Captura erros React não tratados, loga automaticamente,
// e exibe uma tela amigável com opção de recuperação.
// ============================================================

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Versão nova publicada: recarregando a página (não é erro do usuário). */
  updating?: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, updating: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Versão nova no ar e esta aba ainda na antiga: recarrega uma vez em vez de mostrar erro
    if (isChunkLoadError(error)) {
      if (reloadForNewVersion()) {
        debugLogger.warn("Versão nova publicada: recarregando a página", { errorName: error.name });
        return;
      }
      this.setState({ updating: false });
    }

    // Log via debugLogger
    debugLogger.error("React Error Boundary caught an error", {
      componentStack: errorInfo.componentStack ?? "N/A",
      errorName: error.name,
    }, error);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleExportLogs = () => {
    debugLogger.downloadLogs();
  };

  render() {
    if (this.state.hasError && this.state.updating) {
      return (
        <div role="status" style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#e2e8f0", fontSize: "1rem",
        }}>
          Atualizando para a versão nova…
        </div>
      );
    }
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          padding: "1rem",
        }}>
          <div style={{
            maxWidth: "540px",
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "2.5rem",
            textAlign: "center",
            color: "#e2e8f0",
          }}>
            {/* Icon */}
            <div style={{
              width: "72px",
              height: "72px",
              margin: "0 auto 1.5rem",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
            }}>
              ⚠️
            </div>

            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
              color: "#f8fafc",
            }}>
              Algo deu errado
            </h1>

            <p style={{
              fontSize: "0.95rem",
              color: "#94a3b8",
              marginBottom: "2rem",
              lineHeight: 1.6,
            }}>
              Ocorreu um erro inesperado. Você pode tentar recarregar a página
              ou exportar os logs para análise.
            </p>

            {/* Detalhes do erro (apenas em dev) */}
            {isDev && this.state.error && (
              <div style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "12px",
                padding: "1rem",
                marginBottom: "1.5rem",
                textAlign: "left",
                maxHeight: "200px",
                overflow: "auto",
              }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fca5a5", marginBottom: "0.5rem" }}>
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre style={{
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.transform = "translateY(-1px)";
                  (e.target as HTMLElement).style.boxShadow = "0 4px 16px rgba(59,130,246,0.4)";
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.transform = "translateY(0)";
                  (e.target as HTMLElement).style.boxShadow = "none";
                }}
              >
                🔄 Recarregar Página
              </button>

              <button
                onClick={this.handleReset}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  fontWeight: 500,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                }}
              >
                Tentar Novamente
              </button>

              <button
                onClick={this.handleExportLogs}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#94a3b8",
                  fontWeight: 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                }}
              >
                📋 Exportar Logs
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

"use client"

import React, { Component, ReactNode } from "react"
import { logger } from "@/lib/logger"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error("React Error Boundary caught an error", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-dvh p-4 bg-[var(--c-bg)]">
          <div className="max-w-md w-full bg-[var(--c-surface)] rounded-lg border border-[var(--c-border)] shadow-lg p-6">
            <h1 className="text-2xl font-bold text-red-500 mb-4">
              Something went wrong
            </h1>
            <p className="text-[var(--c-text-2)] mb-4">
              We apologize for the inconvenience. An unexpected error has occurred.
            </p>
            {this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-[var(--c-text-3)] hover:text-[var(--c-text-2)]">
                  Error details
                </summary>
                <pre className="mt-2 text-xs bg-[var(--c-surface-hover)] text-[var(--c-text-2)] p-3 rounded overflow-auto border border-[var(--c-border)]">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] text-[var(--c-text-1)] font-medium py-2 px-4 rounded border border-[var(--c-border)] transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

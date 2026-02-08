import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Button } from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error)
      console.error('Component stack:', errorInfo.componentStack)
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      if (fallback) {
        return fallback
      }

      const isDev = import.meta.env.DEV

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm max-w-lg w-full p-6 sm:p-8">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-500 text-sm">
                An unexpected error occurred. Please try reloading the page.
              </p>
            </div>

            {/* Error Details (Development only) */}
            {isDev && error && (
              <div className="mb-6">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                    <span className="ml-1">Show error details</span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 overflow-auto">
                      <p className="text-xs font-mono text-red-600 break-all">
                        {error.name}: {error.message}
                      </p>
                    </div>
                    {errorInfo?.componentStack && (
                      <div className="bg-gray-50 rounded-lg p-3 overflow-auto max-h-40">
                        <p className="text-xs font-mono text-gray-600 whitespace-pre-wrap">
                          {errorInfo.componentStack}
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="primary"
                onClick={this.handleReload}
                className="min-h-[44px] sm:min-h-0"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Reload Page
              </Button>
              <Button
                variant="secondary"
                onClick={this.handleReset}
                className="min-h-[44px] sm:min-h-0"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return children
  }
}

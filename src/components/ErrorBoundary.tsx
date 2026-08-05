import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  name?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn(`[ErrorBoundary${this.props.name ? ` ${this.props.name}` : ''}]`, error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className='rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center'>
          <p className='text-zinc-500 text-sm'>Something went wrong loading this section.</p>
          <button
            type='button'
            onClick={() => this.setState({ hasError: false, error: null })}
            className='mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-zinc-400 hover:bg-white/10 transition'
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

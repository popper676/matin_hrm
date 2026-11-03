import Icon from './Icon';
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Global ErrorBoundary caught an error]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface-850 border border-rose-500/20 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400 text-2xl font-bold">
              <Icon name="warning" size={17}/>
            </div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-slate-400">
              An unexpected error occurred in this section of the application. Our team has logged the issue.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <div className="p-3 bg-black/40 rounded-xl text-left text-xs font-mono text-rose-300 overflow-x-auto max-h-32 border border-white/5">
                {this.state.error.toString()}
              </div>
            )}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold text-sm transition-all border border-white/10"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30"
              >
                Back to Dashboard
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

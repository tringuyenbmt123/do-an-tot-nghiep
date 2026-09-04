import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#300', color: '#fdd', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>💥 React Application Crashed!</h2>
          <p style={{ margin: '1rem 0', fontWeight: 'bold' }}>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ background: '#100', padding: '1rem', overflow: 'auto', borderRadius: '4px' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#f00', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

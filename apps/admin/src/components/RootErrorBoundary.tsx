import React from 'react';

interface State {
  error: Error | null;
}

/** Root error boundary (TASK_74 §"Shell") — shows the error message and a
 *  "Reload" button instead of a blank white screen. */
export class RootErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: 24,
            textAlign: 'center',
            fontFamily: 'sans-serif',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#666', marginBottom: 16, maxWidth: 480 }}>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

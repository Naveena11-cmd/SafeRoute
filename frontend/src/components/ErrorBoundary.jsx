import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surfaced in the browser console with a full component stack, since
    // this is the fastest way to diagnose "blank page" issues.
    console.error("SafeRoute crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", color: "#c0503e", maxWidth: 700 }}>
          <h2 style={{ fontFamily: "inherit" }}>Something broke while rendering SafeRoute.</h2>
          <p>{String(this.state.error.message || this.state.error)}</p>
          <p style={{ color: "#64726c" }}>
            Open your browser's DevTools console (F12) for the full stack trace. This screen
            replaces what would otherwise be a silent blank page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

"use client";

// One card that throws while rendering (an API reply of an unexpected shape,
// say) shows an error in its own slot instead of taking the whole /admin page
// down with it.

import { Component, type ReactNode } from "react";

export class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("admin: card crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="admin-card" role="alert">
        <p className="m-0 text-small text-danger">
          Cette carte a planté (détail dans la console).{" "}
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="rounded underline underline-offset-2 hover:text-ink"
          >
            Réessayer
          </button>
        </p>
      </section>
    );
  }
}

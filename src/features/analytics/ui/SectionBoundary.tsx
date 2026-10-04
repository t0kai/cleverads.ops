'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import ui from '@/components/ui.module.css';
import s from '../analytics.module.css';

/**
 * Each section sits inside its own boundary. If one section hits a bug, only that card shows
 * "couldn't load"; the filters and every other section keep working.
 */
interface Props {
  readonly name: string;
  readonly children: ReactNode;
  /** Changing this (e.g. new filters) gives the section another try. */
  readonly resetKey?: string;
}
interface State {
  readonly failed: boolean;
  readonly key: string | undefined;
}

export class SectionBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Performance Analytics: the ${this.props.name} section failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={`${ui.card} ${s.card} ${s.failedCard}`} role="alert">
        <b>{this.props.name} couldn’t load.</b>
        <span>The rest of the page is fine. Change a filter or press Try again.</span>
        <button type="button" className={s.ghostBtn} onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </section>
    );
  }
}

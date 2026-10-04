import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What to show instead of the screen that failed. */
  fallback: (error: unknown, reset: () => void) => ReactNode;
  /** A new value (the next screen) clears the failure. */
  resetKey?: unknown;
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface State {
  failed: boolean;
  error: unknown;
  key: unknown;
}

/**
 * A screen that throws while drawing does not take the whole portal down:
 * the menu stays, and the user can go elsewhere or report the error.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key
      ? null
      : { failed: false, error: null, key: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ failed: false, error: null });
  };

  override render(): ReactNode {
    return this.state.failed
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}

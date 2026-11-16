import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { t } from '../../i18n/t';
import { EmptyState } from '../../ui';

/**
 * The friendly screen for a crash: what happened in one line, then Reload or Home. It is plain
 * anchors and buttons, with no router or store, so it works wherever it is placed.
 */
export function CrashScreen({ homeHref = '/' }: { homeHref?: string }) {
  return (
    <div className="authwrap" data-testid="crash-screen">
      <EmptyState
        icon="paw"
        title={t('crash.title')}
        headingLevel={1}
        action={
          <>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              {t('crash.reload')}
            </button>{' '}
            <a href={homeHref} className="btn">
              {t('crash.home')}
            </a>
          </>
        }
      >
        {t('crash.body')}
      </EmptyState>
    </div>
  );
}

/** The top-level error boundary: anything that throws while rendering ends here, not on a white page. */
export class CrashBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render crash', error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}

import { useState } from 'react';
import type { FileView } from '../../application/ports/file-gateway';
import { t } from '../../i18n/t';
import { Dialog, EmptyState } from '../../ui';
import { useServices } from '../shared/services-context';

/** Opens a stored file: images in a dialog, PDFs as a link that opens in a new tab. */
export function FileViewButton({ fileId, label }: { fileId: string; label: string }) {
  const { files } = useServices();
  const [view, setView] = useState<FileView | null>(null);
  const [missing, setMissing] = useState(false);

  const close = () => {
    if (view) files.release(view.url);
    setView(null);
    setMissing(false);
  };
  const open = async () => {
    try {
      const found = await files.open(fileId);
      if (found) setView(found);
      else setMissing(true);
    } catch {
      setMissing(true);
    }
  };

  const isPdf = view?.mimeType === 'application/pdf';
  return (
    <>
      <button
        type="button"
        className="linkbtn"
        aria-label={t('files.viewLabel', { name: label })}
        onClick={() => void open()}
      >
        {t('files.view')}
      </button>
      <Dialog open={view !== null || missing} title={label} onClose={close}>
        {view && !isPdf ? (
          <div className="imgview">
            <img src={view.url} alt={label} />
          </div>
        ) : null}
        {view && isPdf ? (
          <a href={view.url} target="_blank" rel="noreferrer" className="btn primary">
            {t('files.openPdf')}
          </a>
        ) : null}
        {missing ? <EmptyState>{t('files.unavailable')}</EmptyState> : null}
        <div className="acts">
          <button type="button" className="btn" onClick={close}>
            {t('files.close')}
          </button>
        </div>
      </Dialog>
    </>
  );
}

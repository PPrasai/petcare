import { useState } from 'react';
import type { FileView } from '../../application/ports/file-gateway';
import { t } from '../../i18n/t';
import { Button, Dialog } from '../../ui';
import { useServices } from '../shared/services-context';

/** Opens a stored file: images in a dialog, PDFs as a link that opens in a new tab. */
export function FileViewButton({ fileId, label }: { fileId: string; label: string }) {
  const { files } = useServices();
  const [view, setView] = useState<FileView | null>(null);
  const [missing, setMissing] = useState(false);

  const close = () => {
    if (view) files.release(view.url);
    setView(null);
  };
  const open = async () => {
    setMissing(false);
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
      <Button
        variant="secondary"
        aria-label={t('files.viewLabel', { name: label })}
        onClick={() => void open()}
      >
        {t('files.view')}
      </Button>
      {missing ? (
        <span role="status" className="text-sm text-muted">
          {t('files.unavailable')}
        </span>
      ) : null}
      <Dialog open={view !== null} title={label} onClose={close}>
        {view && !isPdf ? (
          <img src={view.url} alt={label} className="mb-3 max-h-[70vh] w-full object-contain" />
        ) : null}
        {view && isPdf ? (
          <a href={view.url} target="_blank" rel="noreferrer" className="mb-3 block underline">
            {t('files.openPdf')}
          </a>
        ) : null}
        <Button variant="secondary" onClick={close}>
          {t('files.close')}
        </Button>
      </Dialog>
    </>
  );
}

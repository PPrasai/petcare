import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField, TextField } from '../../ui';
import { FilePicker } from '../files/FilePicker';
import { FileViewButton } from '../files/FileViewButton';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

export const DOCUMENT_CATEGORIES = [
  'vetRecord',
  'certificate',
  'receipt',
  'insurance',
  'photo',
  'labResult',
  'other',
] as const;

/** Documents of one pet: vet records, certificates, receipts, photos (CAP-12). */
export function DocumentsPanel({ petId }: { petId: string }) {
  const { documents, files } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'document');
  const canDelete = useCanDelete('document');
  const list = useQuery({
    queryKey: ['document', householdId, { petId }],
    queryFn: () => documents.list(householdId, petId),
    enabled: householdId !== '',
  });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('vetRecord');
  const [file, setFile] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    if (!file) {
      setErrors({ file: t('files.required') });
      return;
    }
    try {
      const { fileId } = await files.attach(householdId, file);
      await documents.add(householdId, { petId, title, category, fileId });
      setTitle('');
      setFile(null);
      setPickerKey((k) => k + 1);
      setErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  const rows = list.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="documents-title">
      <h2 id="documents-title" className="text-xl font-semibold">
        {t('documents.title')}
      </h2>
      {canCreate ? (
        <form
          aria-label={t('documents.add')}
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={t('documents.name')}
            value={title}
            error={errors.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <SelectField
            label={t('documents.category')}
            value={category}
            options={DOCUMENT_CATEGORIES.map((c) => ({
              value: c,
              label: t(`documents.category.${c}` as MessageKey),
            }))}
            onChange={(e) => setCategory(e.target.value)}
          />
          <FilePicker
            key={pickerKey}
            label={t('files.choose')}
            error={errors.file}
            onPick={setFile}
            onRefused={(message) => setErrors({ file: message })}
          />
          <Button type="submit" className="self-start">
            {t('documents.add')}
          </Button>
        </form>
      ) : null}
      {rows.length === 0 ? <Banner>{t('documents.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((d) => {
          const name = String(d.data.title);
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
            >
              <div>
                <strong>{name}</strong>
                <p className="text-sm">
                  {t(`documents.category.${String(d.data.category)}` as MessageKey)}
                  {' · '}
                  {formatDate(d.updatedAt, prefs)}
                  {d.pending ? ` · ${t('files.waiting')}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <FileViewButton fileId={String(d.data.fileId)} label={name} />
                {canDelete(d.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name })}
                    onClick={() => void documents.remove(d.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

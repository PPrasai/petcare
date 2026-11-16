import { t } from '../../i18n/t';
import { Avatar, Card, SectionHeader } from '../../ui';

const NAMES = ['wizard.stepName1', 'wizard.stepName2', 'wizard.stepName3'] as const;

/** The wizard's steps panel (S-16, from 860 px): where you are, and a live preview of the pet. */
export function WizardSteps({
  step,
  name,
  species,
  meta,
  photoUrl,
}: {
  step: number;
  name: string;
  species: string;
  meta: string;
  photoUrl: string | null;
}) {
  return (
    <Card data-area="steps">
      <SectionHeader title={t('wizard.steps')} />
      <ol className="steps">
        {NAMES.map((key, i) => (
          <li
            key={key}
            className={i + 1 < step ? 'done' : ''}
            aria-current={i + 1 === step ? 'step' : undefined}
          >
            <i aria-hidden="true">{i + 1 < step ? '✓' : i + 1}</i>
            {t(key)}
          </li>
        ))}
      </ol>
      <div className="label">{t('wizard.preview')}</div>
      <div className="wprev">
        <Avatar petId="new" species={species} size={96} photoUrl={photoUrl} />
        <h3>{name}</h3>
        <p className="muted">{meta}</p>
      </div>
    </Card>
  );
}

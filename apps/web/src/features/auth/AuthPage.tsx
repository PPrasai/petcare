import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { NetworkError } from '../../application/ports/remote-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button, TextField } from '../../ui';
import { useServices } from '../shared/services-context';
import { zodField } from '../shared/validators';

const emailRule = z.email('Enter a valid email address.');
const passwordRule = z.string().min(10, 'Use at least 10 characters.').max(128);
const nameRule = z.string().trim().min(1, 'Enter your name.').max(100);

const errorKey: Record<'invalid' | 'exists' | 'other', MessageKey> = {
  invalid: 'auth.error.invalid',
  exists: 'auth.error.exists',
  other: 'auth.error.generic',
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function AuthPage({ mode }: { mode: 'signIn' | 'signUp' }) {
  const { session } = useServices();
  const navigate = useNavigate();
  const providers = useSessionStore((s) => s.config?.providers.join(',') ?? '');
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const signUp = mode === 'signUp';

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      setProblem(null);
      try {
        const result = signUp
          ? await session.signUpEmail(value.name.trim(), value.email, value.password)
          : await session.signInEmail(value.email, value.password);
        if (result.ok) await navigate({ to: '/' });
        else setProblem(errorKey[result.reason]);
      } catch (error) {
        setProblem(error instanceof NetworkError ? 'auth.error.network' : 'auth.error.generic');
      }
    },
  });

  const social = async (provider: string) => {
    try {
      window.location.assign(await session.signInSocial(provider));
    } catch {
      setProblem('auth.error.network');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-5">
      <h1 className="text-2xl font-semibold">
        {signUp ? t('auth.signUp.title') : t('auth.signIn.title')}
      </h1>
      {problem ? <Banner tone="warn">{t(problem)}</Banner> : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {signUp ? (
          <form.Field name="name" validators={{ onBlur: zodField(nameRule) }}>
            {(field) => (
              <TextField
                label={t('auth.name')}
                autoComplete="name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]}
              />
            )}
          </form.Field>
        ) : null}
        <form.Field name="email" validators={{ onBlur: zodField(emailRule) }}>
          {(field) => (
            <TextField
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
            />
          )}
        </form.Field>
        <form.Field name="password" validators={{ onBlur: zodField(passwordRule) }}>
          {(field) => (
            <TextField
              label={t('auth.password')}
              type="password"
              autoComplete={signUp ? 'new-password' : 'current-password'}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {signUp ? t('auth.signUp.submit') : t('auth.signIn.submit')}
            </Button>
          )}
        </form.Subscribe>
      </form>
      {providers ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted">{t('auth.or')}</p>
          {providers.split(',').map((provider) => (
            <Button key={provider} variant="secondary" onClick={() => void social(provider)}>
              {t('auth.social', { provider: capitalize(provider) })}
            </Button>
          ))}
        </div>
      ) : null}
      <a
        className="text-center underline"
        href={signUp ? '/sign-in' : '/sign-up'}
        onClick={(e) => {
          e.preventDefault();
          void navigate({ to: signUp ? '/sign-in' : '/sign-up' });
        }}
      >
        {signUp ? t('auth.signUp.switch') : t('auth.signIn.switch')}
      </a>
    </main>
  );
}

import { useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup' | 'reset';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthProps = {
  onAuthenticated?: (session: Session) => void;
};

function getPasswordIssues(password: string) {
  const issues = [];
  if (password.length < 8) issues.push('8+ characters');
  if (!/[A-Z]/.test(password)) issues.push('one uppercase letter');
  if (!/[a-z]/.test(password)) issues.push('one lowercase letter');
  if (!/[0-9]/.test(password)) issues.push('one number');
  return issues;
}

export function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');
  const [busy, setBusy] = useState(false);

  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  function showMessage(text: string, type: 'error' | 'success' = 'error') {
    setMessage(text);
    setMessageType(type);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  function validate() {
    const cleanEmail = email.trim();
    if (!emailPattern.test(cleanEmail)) {
      showMessage('Enter a valid email address.');
      return false;
    }

    if (isReset) return true;

    if (isSignup && name.trim().length < 2) {
      showMessage('Enter your name so your account has a profile label.');
      return false;
    }

    if (isSignup && passwordIssues.length > 0) {
      showMessage(`Your password still needs ${passwordIssues.join(', ')}.`);
      return false;
    }

    if (isSignup && password !== confirmPassword) {
      showMessage('Passwords do not match.');
      return false;
    }

    if (!isSignup && password.length < 6) {
      showMessage('Enter your password.');
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setBusy(true);
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          showMessage(error.message);
          return;
        }

        if (data.session) {
          onAuthenticated?.(data.session);
          return;
        }

        showMessage('Account created. Check your email if confirmation is enabled.', 'success');
        setPassword('');
        setConfirmPassword('');
        return;
      }

      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });

        if (error) {
          showMessage(error.message);
          return;
        }

        showMessage('Password reset link sent. Check your inbox.', 'success');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        showMessage(error.message);
        return;
      }

      if (data.session) {
        onAuthenticated?.(data.session);
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) onAuthenticated?.(sessionData.session);
      }
    } catch {
      showMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setMessage('');

    try {
      const redirectTo = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          },
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        showMessage(error.message);
        setBusy(false);
        return;
      }

      if (!data.url) {
        showMessage('Google sign in could not start. Please try again.');
        setBusy(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      showMessage('Google sign in failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <p className="eyebrow">Secure account access</p>
          <h2>
            {mode === 'signup'
              ? 'Create your account'
              : mode === 'signin'
                ? 'Welcome back'
                : 'Reset your password'}
          </h2>
          <p>
            {mode === 'signup'
              ? 'Register with email and a strong password to start saving your data.'
              : mode === 'signin'
                ? 'Sign in to continue to your workspace.'
                : 'Enter your account email and we will send a recovery link.'}
          </p>
        </div>

        <div className="auth-tabs" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
          >
            Register
          </button>
          <button
            type="button"
            className={mode === 'signin' ? 'active' : ''}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignup && (
            <label>
              Name
              <input
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          {!isReset && (
            <label>
              Password
              <input
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? 'Create a strong password' : 'Your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={isSignup ? 8 : 6}
                required
              />
            </label>
          )}

          {isSignup && (
            <>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>

              <div className="password-rules">
                {['8+ characters', 'one uppercase letter', 'one lowercase letter', 'one number'].map(
                  (rule) => (
                    <span key={rule} className={!passwordIssues.includes(rule) ? 'met' : ''}>
                      {rule}
                    </span>
                  ),
                )}
              </div>
            </>
          )}

          {message && <p className={`auth-message ${messageType}`}>{message}</p>}

          <button type="submit" className="primary-action" disabled={busy}>
            {busy
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Send reset link'}
          </button>
        </form>

        {!isReset && (
          <div className="oauth-actions">
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button type="button" className="google-auth-button" disabled={busy} onClick={handleGoogleSignIn}>
              <span aria-hidden="true">G</span>
              {busy ? 'Opening Google...' : 'Continue with Google'}
            </button>
          </div>
        )}

        <div className="auth-links">
          {mode === 'signin' && (
            <button type="button" className="text-button" onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="text-button" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

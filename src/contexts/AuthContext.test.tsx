import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React from 'react';
import type { User, Session } from '@supabase/supabase-js';

// ---- Mocks ----

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import after mocks are defined
import { AuthProvider, useAuthContext } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

// ---- Helpers ----

const mockGetSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as ReturnType<typeof vi.fn>;
const mockSignOut = supabase.auth.signOut as ReturnType<typeof vi.fn>;

function makeFakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as User;
}

function makeFakeSession(overrides: Partial<Session> = {}): Session {
  const user = makeFakeUser();
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
    ...overrides,
  } as Session;
}

/**
 * Sets up the default supabase mock behavior:
 *  - getSession resolves with the given session (or null)
 *  - onAuthStateChange stores the callback and returns an unsubscribe stub
 *
 * Returns the captured auth-change callback so tests can trigger events manually.
 */
function setupSupabaseMocks(session: Session | null = null) {
  let authChangeCallback: ((event: string, session: Session | null) => void) | null = null;
  const unsubscribe = vi.fn();

  mockGetSession.mockResolvedValue({
    data: { session },
    error: null,
  });

  mockOnAuthStateChange.mockImplementation((cb: any) => {
    authChangeCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  mockSignOut.mockResolvedValue({ error: null });

  return {
    unsubscribe,
    getAuthChangeCallback: () => authChangeCallback!,
  };
}

// ---- Tests ----

describe('AuthContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Stub window.location methods used by signOut
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        pathname: '/dashboard',
        replace: vi.fn(),
        reload: vi.fn(),
        href: '',
      },
    });

    // Stub localStorage.clear used by signOut
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---------- 1. useAuthContext outside provider ----------

  describe('useAuthContext', () => {
    it('throws when used outside AuthProvider', () => {
      // Suppress React error boundary console noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuthContext());
      }).toThrow('useAuthContext must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  // ---------- 2. Initial loading state ----------

  describe('initial loading state', () => {
    it('starts with loading=true, user=null, session=null', () => {
      // getSession never resolves so we stay in loading state
      mockGetSession.mockReturnValue(new Promise(() => {}));
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      });

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? 'has-user' : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );

      expect(screen.getByTestId('loading').textContent).toBe('true');
      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });
  });

  // ---------- 3. Sets user/session from getSession ----------

  describe('getSession resolution', () => {
    it('sets user and session when getSession returns a valid session', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        // Flush the getSession promise
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('user-123');
      expect(screen.getByTestId('session').textContent).toBe('has-session');
    });

    it('sets user and session to null when getSession returns no session', async () => {
      setupSupabaseMocks(null);

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });

    it('handles getSession errors gracefully', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: new Error('getSession failed'),
      });
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      });

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });
  });

  // ---------- 4. onAuthStateChange ----------

  describe('onAuthStateChange', () => {
    it('calls onAuthStateChange during initialization', async () => {
      setupSupabaseMocks(null);

      await act(async () => {
        render(
          <AuthProvider>
            <div />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
    });

    it('updates user and session on SIGNED_IN event', async () => {
      const { getAuthChangeCallback } = setupSupabaseMocks(null);
      const fakeSession = makeFakeSession();

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      // Before sign-in event: no user
      expect(screen.getByTestId('user').textContent).toBe('null');

      // Fire SIGNED_IN event
      await act(async () => {
        getAuthChangeCallback()('SIGNED_IN', fakeSession);
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('user-123');
      expect(screen.getByTestId('session').textContent).toBe('has-session');
    });

    it('clears user and session on SIGNED_OUT event', async () => {
      const fakeSession = makeFakeSession();
      const { getAuthChangeCallback } = setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { user, session } = useAuthContext();
        return (
          <div>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      // User is set from getSession
      expect(screen.getByTestId('user').textContent).toBe('user-123');

      // Fire SIGNED_OUT event
      await act(async () => {
        getAuthChangeCallback()('SIGNED_OUT', null);
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });

    it('unsubscribes from auth state changes on unmount', async () => {
      const { unsubscribe } = setupSupabaseMocks(null);

      const { unmount } = render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- 5. signOut ----------

  describe('signOut', () => {
    it('clears user and session state when signOut is called', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { user, session, signOut } = useAuthContext();
        return (
          <div>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
            <button data-testid="sign-out" onClick={signOut}>
              Sign Out
            </button>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      // Verify session is set
      expect(screen.getByTestId('user').textContent).toBe('user-123');
      expect(screen.getByTestId('session').textContent).toBe('has-session');

      // Click sign out
      await act(async () => {
        screen.getByTestId('sign-out').click();
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });

    it('calls supabase.auth.signOut', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { signOut } = useAuthContext();
        return (
          <button data-testid="sign-out" onClick={signOut}>
            Sign Out
          </button>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      await act(async () => {
        screen.getByTestId('sign-out').click();
        await vi.runAllTimersAsync();
      });

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('clears localStorage on sign out', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { signOut } = useAuthContext();
        return (
          <button data-testid="sign-out" onClick={signOut}>
            Sign Out
          </button>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      await act(async () => {
        screen.getByTestId('sign-out').click();
        await vi.runAllTimersAsync();
      });

      expect(localStorage.clear).toHaveBeenCalled();
    });

    it('redirects to /auth on sign out', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { signOut } = useAuthContext();
        return (
          <button data-testid="sign-out" onClick={signOut}>
            Sign Out
          </button>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        await vi.runAllTimersAsync();
      });

      await act(async () => {
        screen.getByTestId('sign-out').click();
        await vi.runAllTimersAsync();
      });

      expect(window.location.replace).toHaveBeenCalledWith('/auth');
    });
  });

  // ---------- 6. Connection timeout ----------

  describe('connection timeout', () => {
    it('sets loading=false with null user/session after 8 seconds if supabase does not respond', async () => {
      // getSession never resolves
      mockGetSession.mockReturnValue(new Promise(() => {}));
      // onAuthStateChange never fires
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      });

      function TestConsumer() {
        const { user, session, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'has-session' : 'null'}</span>
          </div>
        );
      }

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );

      // Still loading before timeout
      expect(screen.getByTestId('loading').textContent).toBe('true');

      // Advance just under 8 seconds - should still be loading
      await act(async () => {
        vi.advanceTimersByTime(7999);
      });
      expect(screen.getByTestId('loading').textContent).toBe('true');

      // Advance past 8 seconds - timeout should fire
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('session').textContent).toBe('null');
    });

    it('does not trigger timeout if getSession resolves before 8 seconds', async () => {
      const fakeSession = makeFakeSession();
      setupSupabaseMocks(fakeSession);

      function TestConsumer() {
        const { user, loading } = useAuthContext();
        return (
          <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
          </div>
        );
      }

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>,
        );
        // Resolve getSession
        await vi.runAllTimersAsync();
      });

      // Session resolved, user is set
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('user-123');

      // Advance past 8 seconds to confirm timeout doesn't overwrite
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      // User should still be set (timeout was cleared)
      expect(screen.getByTestId('user').textContent).toBe('user-123');
    });
  });
});

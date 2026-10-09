import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { logger } from "@/lib/logger";
import { acceptPendingInvitations, type InvitationRpc } from "@/lib/acceptPendingInvitations";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logger.debug("[AuthProvider] Initializing auth context");

    // Function to check and accept pending invitations
    const checkPendingInvitations = async (userId: string, email: string) => {
      try {
        logger.debug("[AuthProvider] Checking pending invitations for the signed-in user");

        const { data, error, via } = await acceptPendingInvitations(
          supabase.rpc as unknown as InvitationRpc,
          { id: userId, email },
        );

        if (error) {
          logger.error("[AuthProvider] Invitation accept RPC failed:", error, { via });
          return;
        }

        if (Array.isArray(data) && data.length > 0) {
          logger.debug("[AuthProvider] Successfully accepted invitations via RPC:", data.length);
        } else {
          logger.debug("[AuthProvider] No pending invitations found.");
        }
      } catch (err) {
        logger.error("[AuthProvider] Exception checking invitations:", err);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug("[AuthProvider] Auth state changed", { event, hasUser: !!session?.user });
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Check for pending invitations on SIGNED_IN event
        if (event === "SIGNED_IN" && session?.user) {
          const userEmail = session.user.email;
          const userId = session.user.id;
          if (userEmail) {
            // Use setTimeout to avoid blocking the auth flow
            setTimeout(() => {
              void checkPendingInvitations(userId, userEmail);
            }, 500);
          }
        }
      }
    );

    // Connection timeout - if Supabase doesn't respond in 8 seconds, stop waiting
    // Connection timeout removed - Supabase SDK handles connection states/retries internally
    // We avoid forcefully logging out users due to temporary network glitches

    // Check for existing session
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {

        if (error) {
          logger.error("[AuthProvider] getSession error:", error);
          setSession(null);
          setUser(null);
        } else {
          logger.debug("[AuthProvider] getSession resolved", { hasUser: !!session?.user });
          setSession(session);
          setUser(session?.user ?? null);

          // Also check invitations on initial session load
          if (session?.user?.email) {
            const userId = session.user.id;
            const userEmail = session.user.email;
            setTimeout(() => {
              void checkPendingInvitations(userId, userEmail);
            }, 500);
          }
        }
        setLoading(false);
      })
      .catch((err) => {

        logger.error("[AuthProvider] getSession exception:", err);
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    return () => {

      subscription.unsubscribe();
    };
  }, []);

  const signOut = () => {
    // Make this synchronous and bulletproof - redirect MUST happen
    logger.debug("[AuthProvider] Signing out and clearing all data...");

    // IMMEDIATELY clear session state to stop components from making API calls
    setSession(null);
    setUser(null);

    // Sign out from Supabase (fire and forget - don't wait)
    supabase.auth.signOut().catch(() => {
      // Silently ignore errors - we're redirecting anyway
    });

    // Clear all localStorage (wrap in try-catch to ensure we continue)
    try {
      localStorage.clear(); // Simpler and more reliable than looping
    } catch (err) {
      // Ignore errors - we're redirecting anyway
    }

    // CRITICAL: Force immediate redirect - this MUST execute
    // Use both replace and href as fallback, and ensure it's synchronous
    try {
      if (window.location.pathname === '/auth') {
        // If already on auth page, reload to clear any lingering React state
        window.location.reload();
      } else {
        window.location.replace('/auth');
      }

      // Fallback in case replace doesn't work immediately
      setTimeout(() => {
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
      }, 100);
    } catch (err) {
      // Last resort: try href
      try {
        window.location.href = '/auth';
      } catch (finalErr) {
        // If all else fails, reload the page
        window.location.reload();
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import maddiLogo from "@/assets/madison-auth-logo.png";
import { logger } from "@/lib/logger";
import { LogIn, UserPlus, Sparkles, ArrowLeft, Mail, Lock, Eye, EyeOff } from "lucide-react";

const Auth = () => {
  logger.debug("[Auth] Rendering Auth page...");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const hasNavigated = useRef(false);

  // -------------------------------------------
  // NEW REDIRECT LOGIC
  // -------------------------------------------
  const redirectAfterLogin = async (user: User) => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    const created = new Date(user.created_at).getTime();
    const signedIn = new Date(user.last_sign_in_at || 0).getTime();
    const confirmed = user.email_confirmed_at ? new Date(user.email_confirmed_at).getTime() : 0;

    // Check if user was created OR confirmed at the same time as sign in (within 30 seconds)
    // This handles both "Auto-confirm" (created ~= signedIn) and "Email Confirm" (confirmed ~= signedIn)
    const isNewUser = (Math.abs(created - signedIn) < 30000) || (Math.abs(confirmed - signedIn) < 30000);

    if (isNewUser) {
      // Send welcome email to new users (fire and forget)
      supabase.functions.invoke('send-welcome-email', {
        body: {
          userEmail: user.email,
          userName: user.user_metadata?.full_name || user.email?.split('@')[0],
        },
      }).catch(err => console.error("[Auth] Failed to send welcome email:", err));

      logger.debug("[Auth] New user - redirecting to onboarding");
      navigate("/onboarding", { replace: true });
    } else {
      // Redirect to dashboard directly instead of "/" to avoid Index.tsx loop
      logger.debug("[Auth] Existing user - redirecting to dashboard");
      navigate("/dashboard", { replace: true });
    }
  };

  // -------------------------------------------
  // AUTH STATE HANDLING
  // -------------------------------------------
  useEffect(() => {
    if (!authLoading && user) {
      logger.debug("[Auth] User already authenticated, redirecting...");
      redirectAfterLogin(user);
    }
  }, [user, authLoading]);

  // -------------------------------------------
  // CALLBACK & URL PARAM HANDLING
  // -------------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get("token_hash");
    const type = params.get("type");
    const code = params.get("code");
    const error_description = params.get("error_description");

    // Clean up URL params after processing
    const cleanUrl = () => {
      if (token_hash || code || error_description) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    if (error_description) {
      toast({
        title: "Authentication error",
        description: decodeURIComponent(error_description),
        variant: "destructive",
      });
      cleanUrl();
    }

    if (token_hash && type) {
      supabase.auth.verifyOtp({ token_hash, type: type as any }).then(({ error }) => {
        if (error) {
          toast({
            title: "Link invalid or expired",
            description: error.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "✓ Account Verified!",
            description: "Your account is ready. Welcome to Madison Studio."
          });

          // Send welcome email immediately upon verification
          supabase.functions.invoke('send-welcome-email', {
            body: {
              userEmail: user?.email, // User might not be set yet, but session is
            },
          }).catch(err => console.error("Failed to send welcome email:", err));
        }
        cleanUrl();
      });
    }
    else if (code) {
      // Handle email confirmation or OAuth callback
      logger.debug('[Auth] Processing callback code...');
      supabase.auth.exchangeCodeForSession(code).then(({ error, data }) => {
        if (error) {
          toast({
            title: "Authentication error",
            description: error.message,
            variant: "destructive",
          });
        } else if (data?.session?.user) {
          logger.debug('[Auth] Session established successfully', {
            userId: data.session.user.id,
            email: data.session.user.email,
          });

          // Show clear success toast
          toast({
            title: "✓ Sign In Successful!",
            description: "Welcome back to Madison Studio."
          });

          // Send welcome email for new users
          const isNewUser = new Date(data.session.user.created_at).getTime() > Date.now() - 60000; // Created in last minute
          if (isNewUser) {
            supabase.functions.invoke('send-welcome-email', {
              body: {
                userEmail: data.session.user.email,
                userName: data.session.user.user_metadata?.full_name,
              },
            }).catch(err => console.error("Failed to send welcome email:", err));
          }
        }
        cleanUrl();
      });
    }
  }, [user]);

  // -------------------------------------------
  // GOOGLE SIGN-IN — FIXED VERSION
  // -------------------------------------------
  const handleGoogleSignIn = async () => {
    setLoading(true);

    try {
      // Always redirect back to /auth to avoid Index.tsx redirect loop
      const redirectUrl = `${window.location.origin}/auth`;
      logger.debug('[Auth] Starting Google OAuth', { redirectUrl, origin: window.location.origin });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        logger.error('[Auth] Google OAuth error', error);
        toast({
          title: "Google sign-in error",
          description: error.message || "Failed to initiate Google sign-in. Make sure localhost is added to Supabase redirect URLs.",
          variant: "destructive",
        });
        setLoading(false);
      } else if (data?.url) {
        logger.debug('[Auth] Google OAuth redirect URL generated', { url: data.url });
        // Supabase will handle the redirect automatically
        // User will go to Google, then come back to redirectUrl
      } else {
        logger.warn('[Auth] Google OAuth returned no URL and no error');
        setLoading(false);
      }
    } catch (err: any) {
      logger.error('[Auth] Google OAuth exception', err);
      toast({
        title: "Google sign-in error",
        description: err.message || "Unexpected error. Check browser console for details.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  // -------------------------------------------
  // SIGN UP / SIGN IN / MAGIC LINK / RESET PW
  // -------------------------------------------
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Use explicit Vercel URL if available, otherwise use current origin
    const redirectUrl = import.meta.env.VITE_FRONTEND_URL
      ? `${import.meta.env.VITE_FRONTEND_URL}/onboarding`
      : `${window.location.origin}/onboarding`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    setLoading(false);

    if (error) {
      toast({ title: "Sign up error", description: error.message, variant: "destructive" });
    } else if (data.user && !data.session) {
      // User created but session is null -> Email confirmation required
      setSignupSuccess(true);
      toast({
        title: "Check your email",
        description: "Please confirm your email address to continue.",
      });
    } else {
      // User created and session exists -> Auto-confirmed or no confirmation needed
      toast({
        title: "Welcome to Madison",
        description: "Your account has been created successfully.",
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast({
        title: "Sign in error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Error sending reset email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Check your email",
        description: "We've sent a reset link.",
      });
      setResetMode(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Use explicit Vercel URL if available, otherwise use current origin
    const redirectUrl = import.meta.env.VITE_FRONTEND_URL
      ? `${import.meta.env.VITE_FRONTEND_URL}/onboarding`
      : `${window.location.origin}/onboarding`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl },
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Magic link error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setMagicLinkSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a magic link.",
      });
    }
  };

  if (user) return null;

  // -------------------------------------------
  // UI
  // -------------------------------------------

  // Mode selection buttons component
  const AuthModeSelector = () => (
    <div className="flex gap-2 mb-4 sm:mb-6">
      <button
        type="button"
        onClick={() => { setAuthMode('signin'); setResetMode(false); }}
        className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 sm:gap-2 sm:px-4 ${
          authMode === 'signin'
            ? 'bg-brand-ink text-brand-parchment shadow-sm'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        Sign In
      </button>
      <button
        type="button"
        onClick={() => { setAuthMode('signup'); setSignupSuccess(false); }}
        className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 sm:gap-2 sm:px-4 ${
          authMode === 'signup'
            ? 'bg-brand-ink text-brand-parchment shadow-sm'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        Create Account
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center overflow-x-hidden bg-gradient-to-b from-background to-muted/20 px-4 py-8 safe-area-top safe-area-bottom sm:px-6">
      <div className="w-full max-w-md">
        {/* Logo & Tagline */}
        <div className="text-center mb-6 sm:mb-8 fade-enter">
          <img
            src={maddiLogo}
            alt="Madison"
            className="h-24 sm:h-32 md:h-40 w-auto mx-auto mb-3 sm:mb-4"
          />
          <p className="text-sm sm:text-base text-muted-foreground">
            Where brands craft their narrative
          </p>
        </div>

        <div className="bg-card/80 backdrop-blur-sm p-5 sm:p-8 rounded-xl border border-border/40 shadow-lg fade-enter">
          {/* Google Sign In - Always visible at top */}
          <Button
            onClick={handleGoogleSignIn}
            variant="outline"
            className="mb-4 h-12 w-full gap-2 text-base font-medium transition-colors hover:bg-muted/50 sm:mb-6 sm:gap-3"
            disabled={loading}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative mb-4 sm:mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card/80 px-3 text-muted-foreground tracking-wider">or</span>
            </div>
          </div>

          {/* Auth Mode Selector */}
          <AuthModeSelector />

          {/* Sign In Form */}
          {authMode === 'signin' && (
            <div className="animate-in fade-in-0 slide-in-from-left-2 duration-200">
              {resetMode ? (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                  </button>
                  <p className="text-sm text-muted-foreground mb-4">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-sm font-medium">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="pl-10 h-11"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="brass" className="h-12 w-full" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-3 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signin-email" className="text-xs sm:text-sm font-medium">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-12 pl-10 text-base"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signin-password" className="text-xs sm:text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-12 pl-10 pr-10 text-base"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" variant="brass" className="h-12 w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>

                  <div className="flex flex-col items-stretch gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setResetMode(true)}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      onClick={() => setAuthMode('magic')}
                    >
                      <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Use magic link
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Sign Up Form */}
          {authMode === 'signup' && (
            <div className="animate-in fade-in-0 slide-in-from-right-2 duration-200">
              {signupSuccess ? (
                <div className="space-y-5 text-center py-4">
                  {/* Success Checkmark */}
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center mb-2 animate-in zoom-in-50 duration-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-8 h-8 text-green-500"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>

                  {/* Clear Success Message */}
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-foreground">Account Created!</h3>
                    <p className="text-sm text-green-600 font-medium">
                      Welcome to Madison Studio
                    </p>
                  </div>

                  {/* Email Verification Info */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      We've sent a confirmation link to:
                    </p>
                    <p className="font-medium text-foreground">{email}</p>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Click the link in your email to verify your account and start creating.
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => setSignupSuccess(false)}
                  >
                    Back to Sign Up
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-email" className="text-xs sm:text-sm font-medium">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-12 pl-10 text-base"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-password" className="text-xs sm:text-sm font-medium">Create password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-12 pl-10 pr-10 text-base"
                        placeholder="8+ characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" variant="brass" className="h-12 w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>

                  <p className="text-[10px] sm:text-xs text-center text-muted-foreground pt-2">
                    By creating an account, you agree to our{" "}
                    <a href="/terms" className="underline hover:text-foreground">Terms</a>
                    {" "}and{" "}
                    <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
                  </p>
                </form>
              )}
            </div>
          )}

          {/* Magic Link Form */}
          {authMode === 'magic' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>

              {magicLinkSent ? (
                <div className="space-y-4 text-center py-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Check your email</h3>
                  <p className="text-sm text-muted-foreground">
                    We've sent a magic link to <span className="font-medium text-foreground">{email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Click the link in your email to sign in instantly — no password needed.
                  </p>
                  <Button type="button" variant="outline" className="w-full mt-4" onClick={() => setMagicLinkSent(false)}>
                    Send Another Link
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg mb-4">
                    <Sparkles className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Sign in with a magic link — no password needed!
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="magic-email" className="text-sm font-medium">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="magic-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="pl-10 h-11"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="brass" className="h-12 w-full" disabled={loading}>
                    {loading ? "Sending..." : "Send Magic Link"}
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} Madison Studio. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Auth;

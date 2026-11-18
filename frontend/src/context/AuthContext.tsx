import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentUser,
  loginUser,
  refreshSession,
  updateCurrentUser,
  ApiRequestError,
  type User,
  type UserProfileUpdate,
} from "../services/api";

// ==========================================
// AUTH CONTEXT TYPES
// ==========================================

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;

  login: (
    email: string,
    password: string
  ) => Promise<void>;

  logout: () => void;

  updateProfile: (
    data: UserProfileUpdate
  ) => Promise<User>;
}

// ==========================================
// CONTEXT
// ==========================================

const AuthContext = createContext<
  AuthContextType | undefined
>(undefined);

// ==========================================
// PERSISTENT SESSION STORAGE
// ==========================================

function clearSession() {
  // Remove tokens left by versions deployed before cookie-based sessions.
  localStorage.removeItem("dumo_auth_token");
  localStorage.removeItem("dumo_refresh_token");
  sessionStorage.removeItem("dumo_auth_token");
}

clearSession();

// ==========================================
// AUTH PROVIDER
// ==========================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);

  const [token, setToken] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ========================================
  // RESTORE SESSION
  // ========================================

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        setAuthError(null);
        let profile: User;
        try {
          profile = await getCurrentUser("");
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
          await refreshSession("");
          profile = await getCurrentUser("");
        }

        if (cancelled) return;

        setToken("cookie-session");
        setUser(profile);
      } catch (error) {
        if (cancelled) return;

        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          clearSession();
          setToken(null);
          setUser(null);
        } else {
          setAuthError(
            "The Dumo Youth Network Election Monitoring System could not restore your session because the API is temporarily unavailable. Your login has been preserved."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Renew the access token while the application remains open. Password
  // changes and account deactivation invalidate the refresh token by version.
  useEffect(() => {
    if (!user || !token) return;
    const timer = window.setInterval(async () => {
      try {
        await refreshSession("");
        setToken("cookie-session");
      } catch (error) {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          clearSession(); setToken(null); setUser(null);
        }
      }
    }, 20 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [user, token]);

  // ========================================
  // LOGIN
  // ========================================

  async function login(
    email: string,
    password: string
  ): Promise<void> {
    await loginUser(
      email.trim(),
      password
    );

    const profile = await getCurrentUser("");

    setToken("cookie-session");
    setUser(profile);
    setAuthError(null);
  }

  // ========================================
  // UPDATE PROFILE
  // ========================================

  async function updateProfile(
    data: UserProfileUpdate
  ): Promise<User> {
    if (!token) {
      throw new Error(
        "Your session has expired. Please log in again."
      );
    }

    const updatedUser = await updateCurrentUser(
      token,
      data
    );

    // Update the user across the application.
    setUser(updatedUser);

    return updatedUser;
  }

  // ========================================
  // LOGOUT
  // ========================================

  function logout(): void {
    void fetch(`${import.meta.env.DEV?(import.meta.env.VITE_API_URL||"http://127.0.0.1:8000").replace(/\/$/,""):""}/api/auth/logout`, {method:"POST"});
    clearSession();

    setToken(null);
    setUser(null);
    setAuthError(null);
  }

  // ========================================
  // AUTHENTICATION STATUS
  // ========================================

  const isAuthenticated = Boolean(
    token && user
  );

  // ========================================
  // PROVIDER
  // ========================================

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        authError,
        login,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ==========================================
// CUSTOM AUTH HOOK
// ==========================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}

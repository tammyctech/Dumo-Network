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

const TOKEN_KEY = "dumo_auth_token";
const REFRESH_TOKEN_KEY = "dumo_refresh_token";

function saveSession(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.removeItem(TOKEN_KEY);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ==========================================
// AUTH PROVIDER
// ==========================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);

  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  );

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ========================================
  // RESTORE SESSION
  // ========================================

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      let storedToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (!storedToken && !storedRefreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        setAuthError(null);
        let profile: User;
        try {
          if (!storedToken) throw new ApiRequestError("Access token unavailable", 401);
          profile = await getCurrentUser(storedToken);
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.status !== 401 || !storedRefreshToken) throw error;
          const renewed = await refreshSession(storedRefreshToken);
          storedToken = renewed.access_token;
          saveSession(renewed.access_token, renewed.refresh_token);
          profile = await getCurrentUser(renewed.access_token);
        }

        if (cancelled) return;

        setToken(storedToken);
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
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) return;
      try {
        const renewed = await refreshSession(storedRefreshToken);
        saveSession(renewed.access_token, renewed.refresh_token);
        setToken(renewed.access_token);
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
    const result = await loginUser(
      email.trim(),
      password
    );

    const profile = await getCurrentUser(
      result.access_token
    );

    saveSession(result.access_token, result.refresh_token);

    setToken(result.access_token);
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

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
// SESSION STORAGE
// ==========================================

const TOKEN_KEY = "dumo_auth_token";

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
    () => sessionStorage.getItem(TOKEN_KEY)
  );

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ========================================
  // RESTORE SESSION
  // ========================================

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedToken = sessionStorage.getItem(TOKEN_KEY);

      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        setAuthError(null);
        const profile = await getCurrentUser(storedToken);

        if (cancelled) return;

        setToken(storedToken);
        setUser(profile);
      } catch (error) {
        if (cancelled) return;

        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        } else {
          setAuthError(
            "Dumo Network could not restore your session because the API is temporarily unavailable. Your login has been preserved."
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

    sessionStorage.setItem(
      TOKEN_KEY,
      result.access_token
    );

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
    sessionStorage.removeItem(TOKEN_KEY);

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

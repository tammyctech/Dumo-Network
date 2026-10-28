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
  type User,
} from "../services/api";

// ==========================================
// AUTH CONTEXT TYPES
// ==========================================

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (
    email: string,
    password: string
  ) => Promise<void>;

  logout: () => void;
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
        const profile = await getCurrentUser(storedToken);

        if (cancelled) return;

        setToken(storedToken);
        setUser(profile);
      } catch {
        if (cancelled) return;

        sessionStorage.removeItem(TOKEN_KEY);

        setToken(null);
        setUser(null);
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
  }

  // ========================================
  // LOGOUT
  // ========================================

  function logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);

    setToken(null);
    setUser(null);
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
        login,
        logout,
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
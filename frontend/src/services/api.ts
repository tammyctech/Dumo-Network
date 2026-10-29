const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// ==========================================
// USER TYPES
// ==========================================

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  role: string;
  is_active: boolean;
}

export interface RegisterData {
  full_name: string;
  email: string;
  password: string;
}

export interface UserProfileUpdate {
  full_name?: string;
  phone_number?: string | null;
}

// ==========================================
// REGISTER USER
// ==========================================

export async function registerUser(
  data: RegisterData
): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Registration failed. Check your details.");
  }

  return response.json();
}

// ==========================================
// LOGIN USER
// ==========================================

export async function loginUser(
  email: string,
  password: string
) {
  const formData = new URLSearchParams();

  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Invalid email or password.");
  }

  return response.json() as Promise<{
    access_token: string;
    token_type: string;
  }>;
}

// ==========================================
// GET CURRENT USER
// ==========================================

export async function getCurrentUser(
  token: string
): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Authentication failed.");
  }

  return response.json();
}

// ==========================================
// UPDATE CURRENT USER PROFILE
// ==========================================

export async function updateCurrentUser(
  token: string,
  data: UserProfileUpdate
): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMessage = "Unable to update your profile.";

    try {
      const errorData = await response.json();

      if (typeof errorData.detail === "string") {
        errorMessage = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail
          .map((item: { msg?: string }) => item.msg || "Invalid value")
          .join(". ");
      }
    } catch {
      // Use the default error message if the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<User>;
}
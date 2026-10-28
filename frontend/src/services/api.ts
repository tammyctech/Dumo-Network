const API_URL = "http://127.0.0.1:8000";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface RegisterData {
  full_name: string;
  email: string;
  password: string;
}

export async function registerUser(data: RegisterData): Promise<User> {
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

export async function loginUser(email: string, password: string) {
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

export async function getCurrentUser(token: string): Promise<User> {
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
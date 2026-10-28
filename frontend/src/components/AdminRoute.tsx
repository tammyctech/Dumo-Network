import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute() {
  const { user, token } = useAuth();

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
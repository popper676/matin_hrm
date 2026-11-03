import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import {
  can as hasPermission,
  personalCan as hasPersonal,
  hasManagement,
  ROUTE_MODULES,
} from "../../../shared/accessPolicy.js";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    current = useRef(null),
    refreshSequence = useRef(0),
    qc = useQueryClient();
  const accept = useCallback(
    (value) => {
      const previous = current.current;
      if (
        previous &&
        (previous.id !== value?.id ||
          previous.access_version !== value?.access_version ||
          previous.is_owner !== value?.is_owner)
      ) {
        qc.cancelQueries();
        qc.clear();
      }
      current.current = value;
      setUser(value);
    },
    [qc],
  );
  const refresh = useCallback(async () => {
    const sequence=++refreshSequence.current;
    try {
      const r = await api.get("/auth/me");
      if(sequence===refreshSequence.current)accept(r.data.user);
    } catch (e) {
      if (sequence===refreshSequence.current&&e.response?.status === 401) accept(null);
    } finally {
      if(sequence===refreshSequence.current)setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("hr-access-refresh", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("hr-access-refresh", focus);
    };
  }, [refresh]);
  const login = value=>{refreshSequence.current++;accept(value);setLoading(false);};
  const logout = async () => {
    refreshSequence.current++;
    try {
      await api.post("/auth/logout");
    } finally {
      accept(null);
      qc.clear();
    }
  };
  const updateUser = (updates) => accept({ ...user, ...updates });
  const can = (module, action = "view") => hasPermission(user, module, action);
  const personalCan = (app) => hasPersonal(user, app);
  // Compatibility helpers now use owner-assigned capabilities, never a job title.
  const isAdmin = () =>
    user?.is_owner ||
    can(
      ROUTE_MODULES.find(([p]) => window.location.pathname.startsWith(p))?.[1],
    );
  const isBoss = () => !!user?.is_owner;
  const isFinance = () => can("finance") || can("payroll");
  const isEmployee = () => !hasManagement(user);
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateUser,
        refresh,
        isAdmin,
        isBoss,
        isFinance,
        isEmployee,
        can,
        personalCan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("AuthProvider required");
  return c;
}

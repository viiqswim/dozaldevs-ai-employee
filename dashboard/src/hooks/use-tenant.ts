import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  createElement,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { gatewayFetch } from '../lib/gateway';

export interface TenantInfo {
  tenantId: string;
  name: string;
  slug: string;
  tenantRole: string;
}

interface TenantContextValue {
  tenantId: string;
  setTenantId: (id: string) => void;
  tenantName: string;
  tenants: TenantInfo[];
  loading: boolean;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [tenantId, setTenantIdState] = useState<string>(
    () => searchParams.get('tenant') ?? localStorage.getItem('selected_tenant_id') ?? '',
  );

  const setTenantId = useCallback(
    (id: string) => {
      localStorage.setItem('selected_tenant_id', id);
      setTenantIdState(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tenant', id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!session) {
      setTenants([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void gatewayFetch<TenantInfo[]>('/me/tenants')
      .then((data) => {
        if (cancelled) return;
        setTenants(data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!tenants.length) return;
    const valid = tenants.find((t) => t.tenantId === tenantId);
    if (!valid) {
      const firstId = tenants[0].tenantId;
      setTenantId(firstId);
    }
  }, [tenants, tenantId, setTenantId]);

  const tenantName = tenants.find((t) => t.tenantId === tenantId)?.name ?? tenantId;

  return createElement(
    TenantContext.Provider,
    { value: { tenantId, setTenantId, tenantName, tenants, loading } },
    children,
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
}

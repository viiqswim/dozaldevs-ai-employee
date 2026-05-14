import { createContext, useContext, useState, type ReactNode, createElement } from 'react';
import { DEFAULT_TENANT_ID, TENANTS } from '../lib/constants';

interface TenantContextValue {
  tenantId: string;
  setTenantId: (id: string) => void;
  tenantName: string;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const [tenantId, setTenantIdState] = useState<string>(() => {
    return localStorage.getItem('selected_tenant_id') ?? DEFAULT_TENANT_ID;
  });

  const setTenantId = (id: string) => {
    localStorage.setItem('selected_tenant_id', id);
    setTenantIdState(id);
  };

  const tenantName = TENANTS[tenantId] ?? tenantId;

  return createElement(
    TenantContext.Provider,
    { value: { tenantId, setTenantId, tenantName } },
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

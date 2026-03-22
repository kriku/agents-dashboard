import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface Workspace {
  id: string;
  name: string;
  org: string;
}

const DEMO_WORKSPACES: Workspace[] = [
  { id: 'ws-acme-prod', name: 'Acme Corp / Production', org: 'org-acme' },
  { id: 'ws-acme-staging', name: 'Acme Corp / Staging', org: 'org-acme' },
  { id: 'ws-globex-main', name: 'Globex Inc / Main', org: 'org-globex' },
  { id: 'ws-initech-prod', name: 'Initech / Production', org: 'org-initech' },
  { id: 'ws-initech-research', name: 'Initech / Research', org: 'org-initech' },
];

interface WorkspaceContextValue {
  workspaces: Workspace[];
  current: Workspace;
  switchWorkspace: (id: string) => Promise<void>;
  switching: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<Workspace>(DEMO_WORKSPACES[0]!);
  const [switching, setSwitching] = useState(false);

  const switchWorkspace = useCallback(
    async (id: string) => {
      const ws = DEMO_WORKSPACES.find((w) => w.id === id);
      if (!ws || ws.id === current.id) return;

      setSwitching(true);
      try {
        const res = await fetch(`/api/auth/demo-token?workspace=${id}`);
        if (!res.ok) throw new Error('Failed to get token');
        const { token } = await res.json();
        localStorage.setItem('auth_token', token);
        setCurrent(ws);
        queryClient.invalidateQueries();
      } finally {
        setSwitching(false);
      }
    },
    [current.id, queryClient],
  );

  return (
    <WorkspaceContext.Provider value={{ workspaces: DEMO_WORKSPACES, current, switchWorkspace, switching }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

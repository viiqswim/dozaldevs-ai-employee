import { useSearchParams } from 'react-router-dom';

export function useModelCatalogParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const modal = searchParams.get('modal');
  const editingId = searchParams.get('editing');
  const removingId = searchParams.get('removing');
  const query = searchParams.get('q') ?? '';
  const providerFilter = searchParams.get('provider') ?? '';

  const setModal = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('modal', value);
      next.delete('editing');
      next.delete('removing');
    } else {
      next.delete('modal');
    }
    setSearchParams(next, { replace: true });
  };

  const setEditing = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set('editing', id);
      next.delete('modal');
      next.delete('removing');
    } else {
      next.delete('editing');
    }
    setSearchParams(next, { replace: true });
  };

  const setRemoving = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set('removing', id);
      next.delete('modal');
      next.delete('editing');
    } else {
      next.delete('removing');
    }
    setSearchParams(next, { replace: true });
  };

  const closeAll = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('modal');
    next.delete('editing');
    next.delete('removing');
    setSearchParams(next, { replace: true });
  };

  const setQuery = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('q', v);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const setProviderFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('provider', v);
    else next.delete('provider');
    setSearchParams(next, { replace: true });
  };

  return {
    modal,
    editingId,
    removingId,
    query,
    providerFilter,
    setModal,
    setEditing,
    setRemoving,
    closeAll,
    setQuery,
    setProviderFilter,
  };
}

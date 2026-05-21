import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export function EditEmployeePage() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (archetypeId) {
      navigate(`/dashboard/employees/${archetypeId}`, { replace: true });
    }
  }, [archetypeId, navigate]);

  return null;
}

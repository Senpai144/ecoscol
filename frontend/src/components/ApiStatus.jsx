import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function ApiStatus() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('réponse invalide');
        setState('ok');
      } catch (err) {
        setState('down');
      }
    };
    check();
  }, []);

  if (state === 'checking') return <p id="api-status" className="status status-pending">Vérification de la connexion au serveur…</p>;
  if (state === 'ok') return <p id="api-status" className="status status-ok">API connectée — serveur opérationnel.</p>;
  return <p id="api-status" className="status status-error">Serveur injoignable — affichage local uniquement.</p>;
}

export default ApiStatus;
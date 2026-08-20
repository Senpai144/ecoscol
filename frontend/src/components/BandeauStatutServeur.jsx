import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function BandeauStatutServeur() {
  const [etat, setEtat] = useState('verification');

  useEffect(() => {
    let actif = true;
    const verifier = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('réponse invalide');
        if (actif) setEtat('ok');
      } catch {
        if (actif) setEtat('down');
      }
    };
    verifier();
    const intervalle = setInterval(verifier, 30000);
    return () => { actif = false; clearInterval(intervalle); };
  }, []);

  const classes = `status-band ${etat === 'ok' ? 'ok' : etat === 'down' ? 'down' : ''}`;
  const texte =
    etat === 'ok' ? 'Serveur opérationnel — données à jour.'
    : etat === 'down' ? 'Serveur injoignable — vérifiez votre connexion.'
    : 'Vérification de la connexion au serveur…';

  return (
    <div className={classes} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true"></span>
      <span>{texte}</span>
    </div>
  );
}
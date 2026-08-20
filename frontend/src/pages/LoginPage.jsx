import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BandeauStatutServeur from '../components/BandeauStatutServeur.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur(null);

    if (!identifiant.trim() || !motDePasse) {
      setErreur('Identifiant et mot de passe sont requis.');
      return;
    }

    setChargement(true);
    try {
      const user = await login(identifiant.trim(), motDePasse);
      navigate(user.roles?.includes('PARENT') ? '/portail' : '/tableau-de-bord', { replace: true });
    } catch (err) {
      setErreur(err.message || 'Connexion impossible');
    } finally {
      setChargement(false);
    }
  }

  return (
    <>
      <BandeauStatutServeur />
      <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>ECOSCOL</h1>
        <p className="auth-subtitle">Plateforme de gestion scolaire</p>

        {erreur && <div className="alert alert-error" role="alert">{erreur}</div>}

        <label htmlFor="identifiant">Identifiant</label>
        <input
          id="identifiant"
          type="text"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label htmlFor="mot_de_passe">Mot de passe</label>
        <input
          id="mot_de_passe"
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          autoComplete="current-password"
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={chargement}>
          {chargement ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="auth-link">
          <Link to="/">← Retour à l'accueil</Link>
        </p>
      </form>
    </main>
    </>
  );
}
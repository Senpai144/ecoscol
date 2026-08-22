import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BandeauStatutServeur from '../components/BandeauStatutServeur.jsx';
import { getEtablissementPublic } from '../api.js';
import { appliquerThemeEtablissement, reinitialiserTheme } from '../theme.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tenant, setTenant] = useState(null);
  const [tenantErreur, setTenantErreur] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(false);

  // Résolution du tenant AVANT connexion : sous-domaine de l'URL (college-victorhugo.monsite.com)
  // ou paramètre ?etab= en développement local.
  useEffect(() => {
    const host = window.location.hostname;
    const param = params.get('etab');
    const estLocal = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    const sousDomaine = (param || (!estLocal ? host.split('.')[0] : null))?.trim().toLowerCase();
    if (!sousDomaine || sousDomaine === 'www') return;
    getEtablissementPublic(sousDomaine)
      .then((j) => {
        setTenant(j.etablissement);
        appliquerThemeEtablissement(j.etablissement.couleur_principale);
      })
      .catch(() => {
        setTenantErreur(`Établissement « ${sousDomaine} » introuvable`);
        reinitialiserTheme();
      });
    return () => reinitialiserTheme();
  }, []);

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
      const roles = user.roles || [];
      const accueil = roles.includes('PARENT') ? '/portail'
        : roles.some((r) => ['ENSEIGNANT', 'SURVEILLANT'].includes(r)) ? '/vie-scolaire'
        : '/tableau-de-bord';
      navigate(accueil, { replace: true });
    } catch (err) {
      setErreur(err.message || 'Connexion impossible');
    } finally {
      setChargement(false);
    }
  }

  const label = tenant ? `Espace « ${tenant.nom} »` : 'Plateforme de gestion scolaire';

  return (
    <>
      <BandeauStatutServeur />
      <main className="auth-page">
        <form className="auth-card" onSubmit={handleSubmit} noValidate>
          {tenant?.logo_base64 && (
            <img
              className="auth-logo"
              src={tenant.logo_base64}
              alt={`Logo de ${tenant.nom}`}
              style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }}
            />
          )}
          <h1>{tenant?.nom ?? 'ECOSCOL'}</h1>
          <p className="auth-subtitle">{tenant?.slogan ?? label}</p>

          {(tenantErreur || erreur) && (
            <div className="alert alert-error" role="alert">{tenantErreur || erreur}</div>
          )}

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

          {tenant && <p className="auth-link auth-link-note">Identifiant fourni par {tenant.nom}.</p>}

          <p className="auth-link">
            <Link to="/inscription">Votre école n'est pas encore inscrite ? Créer un espace</Link>
          </p>
          <p className="auth-link">
            <Link to="/">← Retour à l'accueil</Link>
          </p>
        </form>
      </main>
    </>
  );
}
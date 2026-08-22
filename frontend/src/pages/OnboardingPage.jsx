import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BandeauStatutServeur from '../components/BandeauStatutServeur.jsx';
import { creerEtablissement, verifierSousDomaine, updateParametresEcole } from '../api.js';
import { appliquerThemeEtablissement } from '../theme.js';

export default function InscriptionPage() {
  const { connecter } = useAuth();
  const navigate = useNavigate();

  const [etape, setEtape] = useState(1);
  const [nom, setNom] = useState('');
  const [sousDomaine, setSousDomaine] = useState('');
  const [disponible, setDisponible] = useState(null);
  const [verificationEnCours, setVerificationEnCours] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [etabCree, setEtabCree] = useState(null);

  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [slogan, setSlogan] = useState('');
  const [couleur, setCouleur] = useState('#2B8C7E');
  const [logo, setLogo] = useState('');
  const logoInputRef = useRef(null);

  // Vérification d'unicité du sous-domaine en temps réel (débounce)
  useEffect(() => {
    const domaine = sousDomaine.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domaine)) {
      setDisponible(null);
      return;
    }
    setVerificationEnCours(true);
    const timer = setTimeout(async () => {
      try {
        const j = await verifierSousDomaine(domaine);
        setDisponible(j.disponible);
      } catch {
        setDisponible(null);
      } finally {
        setVerificationEnCours(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [sousDomaine]);

  function importerLogo(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => setLogo(lecteur.result);
    lecteur.readAsDataURL(fichier);
  }

  async function creerEtablissement_(e) {
    e.preventDefault();
    setErreur('');
    const domaine = sousDomaine.trim().toLowerCase();
    if (!nom || !domaine || !email || motDePasse.length < 8) {
      setErreur('Tous les champs sont requis ; le mot de passe doit compter au moins 8 caractères.');
      return;
    }
    // Re-vérification synchrone au moment du submit : l'utilisateur peut cliquer
    // avant la fin du débounce de vérification temps réel (400 ms).
    setVerificationEnCours(true);
    let verif = { disponible: false };
    try {
      verif = await verifierSousDomaine(domaine);
    } catch {
      verif = { disponible: false };
    } finally {
      setVerificationEnCours(false);
    }
    setDisponible(verif.disponible);
    if (!verif.disponible) {
      setErreur('Ce sous-domaine n\'est pas disponible.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setChargement(true);
    try {
      const j = await creerEtablissement({ nom, sous_domaine: domaine, email, mot_de_passe: motDePasse });
      connecter({ token: j.token, user: j.user });
      setEtabCree(j.etablissement ?? j.user.etablissement);
      setEtape(2);
    } catch (err) {
      setErreur(err.message || 'Impossible de créer l\'établissement.');
    } finally {
      setChargement(false);
    }
  }

  async function finaliser(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const token = localStorage.getItem('ecoscol_token');
      const j = await updateParametresEcole(
        { nom: etabCree?.nom, adresse, telephone, email_contact: email, slogan, couleur_principale: couleur },
        token
      );
      appliquerThemeEtablissement(j.etablissement.couleur_principale);
      localStorage.setItem('ecoscol_last_etab', sousDomaine.trim().toLowerCase());
      navigate('/tableau-de-bord', { replace: true });
    } catch (err) {
      setErreur(err.message || 'Échec de l\'enregistrement des informations.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <>
      <BandeauStatutServeur />
      <main className="auth-page">
        <form className="auth-card" onSubmit={etape === 1 ? creerEtablissement_ : finaliser} noValidate>
          <h1>{etape === 1 ? 'Inscription de votre école' : 'Personnalisez votre espace'}</h1>
          <p className="auth-subtitle">
            {etape === 1
              ? 'Créez un espace isolé, avec votre logo et vos données.'
              : `${etabCree?.nom} a été créé. Ajoutez votre logo et vos coordonnées.`}
          </p>

          <div className="auth-etapes">
            <span className={`auth-etape${etape === 1 ? ' active' : ''}`}>1. Création</span>
            <span className={`auth-etape${etape === 2 ? ' active' : ''}`}>2. Logo & informations</span>
          </div>

          {erreur && <div className="alert alert-error" role="alert">{erreur}</div>}

          {etape === 1 && (
            <>
              <label htmlFor="nom-etab">Nom de l'établissement</label>
              <input id="nom-etab" type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Collège Victor Hugo" autoFocus />

              <label htmlFor="sous-domaine">Sous-domaine : <span className="mono">votre-ecole.moncsite.com</span></label>
              <input
                id="sous-domaine"
                type="text"
                value={sousDomaine}
                onChange={(e) => setSousDomaine(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                placeholder="college-victorhugo"
              />
              <p className={`auth-check mono${disponible === true ? ' ok' : disponible === false ? ' ko' : ''}`}>
                {verificationEnCours ? 'Vérification…'
                  : disponible === true ? '✓ Sous-domaine disponible'
                  : disponible === false ? '✗ Sous-domaine déjà utilisé'
                  : sousDomaine ? 'Format : lettres, chiffres et tirets'
                  : 'Disponibilité vérifiée en temps réel'}
              </p>

              <label htmlFor="email-admin">E-mail de l'administrateur</label>
              <input id="email-admin" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@votre-ecole.sn" />

              <label htmlFor="mdp-admin">Mot de passe (8 caractères min.)</label>
              <input id="mdp-admin" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />

              <label htmlFor="confirme">Confirmation du mot de passe</label>
              <input id="confirme" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />

              <button type="submit" className="btn btn-primary btn-block" disabled={chargement}>
                {chargement ? 'Création…' : 'Créer mon école'}
              </button>
            </>
          )}

          {etape === 2 && (
            <>
              <label>Logo de l'établissement</label>
              <div className="auth-logo-zone">
                <div className="auth-logo-preview">
                  {logo ? <img src={logo} alt="Logo" /> : <span className="mono" style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>Aucun</span>}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={importerLogo} style={{ display: 'none' }} aria-label="Logo" />
                <button type="button" className="btn btn-light btn-small" onClick={() => logoInputRef.current?.click()}>
                  Choisir le logo
                </button>
              </div>

              <label htmlFor="adresse-etab">Adresse</label>
              <input id="adresse-etab" type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Ex. 12 Avenue de l'Indépendance, Dakar" />

              <label htmlFor="tel-etab">Téléphone</label>
              <input id="tel-etab" type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Ex. +221 33 000 00 00" />

              <label htmlFor="slogan-etab">Slogan (facultatif)</label>
              <input id="slogan-etab" type="text" value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Ex. Savoir, travail, réussite" />

              <label htmlFor="couleur-etab">Couleur du thème</label>
              <div className="auth-couleur-ligne">
                <input id="couleur-etab" type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} aria-label="Couleur principale" />
                <span className="mono">{couleur}</span>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={chargement}>
                {chargement ? 'Enregistrement…' : 'Créer mon espace de gestion'}
              </button>
            </>
          )}

          {etape === 1 && (
            <p className="auth-link">
              <Link to="/">← Retour à l'accueil</Link>
            </p>
          )}
        </form>

        <style>{`
          .auth-etapes { display: flex; gap: 8px; margin-top: 6px; }
          .auth-etape { font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: var(--paper); color: var(--text-faint); }
          .auth-etape.active { background: var(--teal-soft); color: var(--teal-strong); }
          .auth-check { font-size: 0.78rem; margin-top: 4px; min-height: 1rem; }
          .auth-check.ok { color: var(--teal-strong); }
          .auth-check.ko { color: var(--coral); }
          .auth-logo-zone { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
          .auth-logo-preview { width: 72px; height: 72px; border-radius: 12px; border: 1.5px dashed var(--line-strong); background: var(--paper); display: flex; align-items: center; justify-content: center; overflow: hidden; }
          .auth-logo-preview img { width: 100%; height: 100%; object-fit: contain; }
          .auth-couleur-ligne { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
          .auth-couleur-ligne input[type="color"] { width: 52px; height: 34px; border: none; border-radius: 8px; cursor: pointer; padding: 0; background: none; }
          .auth-logo { object-fit: contain; }
        `}</style>
      </main>
    </>
  );
}
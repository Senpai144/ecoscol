import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BandeauStatutServeur from '../components/BandeauStatutServeur.jsx';

const LOGO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
  </svg>
);

function IconeMallette() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2.5" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h6M22 13h-6" />
    </svg>
  );
}

function IconeParentEnfant() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20.5c.5-3.8 3.5-6 7.5-6s7 2.2 7.5 6" />
      <circle cx="17.5" cy="9.5" r="2" />
      <path d="M20.5 14.5c.8.8 1.3 1.9 1.4 3M2.5 19c.4-.6 1-1.1 1.6-1.5" />
    </svg>
  );
}

function IconeToque() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10.5 12 6l9.5 4.5L12 15 2.5 10.5Z" />
      <path d="M6.5 12.6V16c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-3.4" />
      <path d="M22 10v5" />
    </svg>
  );
}

function MotifScolaire() {
  return (
    <svg className="landing-hero-pattern" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="3" strokeLinecap="round">
        <path d="M150 110l20 20 42-48" />
        <path d="M430 150l18 18 38-42" />
        <path d="M910 96l17 17 34-38" />
        <path d="M1052 230l14 14 28-32" />
        <path d="M260 340l18 18 40-44" />
        <path d="M760 470l18 18 38-42" />
        <path d="M500 480l16 16 34-38" />
        <path d="M90 250l16 16 34-38" />
      </g>
      <g fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
        <path d="M70 420h120M1040 360h110M620 100h90M880 520h100M120 200h60M1100 120h70" />
      </g>
      <g fill="rgba(255,255,255,0.9)" fontSize="30" fontFamily="'IBM Plex Mono', monospace" textAnchor="middle">
        <text x="610" y="90">14,3</text>
        <text x="180" y="460">16,0</text>
        <text x="990" y="440">12,5</text>
        <text x="340" y="230">9/20</text>
        <text x="720" y="260">B</text>
        <text x="470" y="140">17,8</text>
      </g>
    </svg>
  );
}

const CARTES = [
  {
    espace: 'personnel',
    tone: 'teal',
    icone: <IconeMallette />,
    titre: 'Personnel',
    texte: "Connexion sécurisée pour l'administration, les enseignants et le personnel de l'établissement.",
  },
  {
    espace: 'parent',
    tone: 'amber',
    icone: <IconeParentEnfant />,
    titre: 'Portail parents',
    texte: 'Résultats, bulletins, absences et solde de cantine de votre enfant, en temps réel.',
  },
  {
    espace: 'eleve',
    tone: 'coral',
    icone: <IconeToque />,
    titre: 'Espace élève',
    texte: 'Emploi du temps, devoirs, notes et messagerie — tout votre quotidien au même endroit.',
  },
];

const STATS = [
  { nombre: '6e–Tle', label: 'Tous les niveaux couverts' },
  { nombre: '100 %', label: 'Scolarité centralisée' },
  { nombre: '24/7', label: 'Accès permanent sécurisé' },
];

export default function LandingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  function ouvrirConnexion(espace) {
    const roles = session?.user?.roles || [];
    let destination;
    if (espace === 'parent' && roles.includes('PARENT')) destination = '/portail';
    else if (espace === 'personnel' && session) destination = '/tableau-de-bord';
    else destination = '/login';
    console.log(`[ECOSCOL] Connexion « ${espace} » → ${destination}`);
    navigate(destination);
  }

  return (
    <div className="landing">
      <BandeauStatutServeur />

      <header className="landing-topbar">
        <a className="landing-brand" href="#" aria-label="ECOSCOL — retour en haut">
          <span className="landing-brand-mark">{LOGO}</span>
          <span className="landing-brand-name">ECOSCOL</span>
        </a>
        <nav className="landing-nav" aria-label="Navigation">
          <a href="#etablissements">Établissements</a>
          <a href="#assistance">Assistance</a>
        </nav>
        <div className="landing-actions">
          <Link to="/inscription" className="btn btn-primary">Créer mon école</Link>
          <button className="btn btn-ghost" onClick={() => navigate('/login')}>Se connecter</button>
        </div>
      </header>

      <section className="landing-hero">
        <MotifScolaire />
        <div className="landing-hero-content">
          <span className="landing-badge anim" style={{ animationDelay: '0s' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            Utilisé par des établissements du 6ème à la Terminale
          </span>
          <h1 className="landing-title anim" style={{ animationDelay: '0.08s' }}>
            <span>La gestion scolaire de votre établissement,</span>
            <span className="landing-accent anim" style={{ animationDelay: '0.16s' }}>de la 6ème à la Terminale.</span>
          </h1>
          <p className="landing-subtitle anim" style={{ animationDelay: '0.2s' }}>
            Notes, moyennes, bulletins, emplois du temps, absences, vie scolaire et messagerie : toute la vie
            de l'établissement, centralisée dans une plateforme unique, simple et fiable.
          </p>
        </div>
      </section>

      <div className="landing-body">
        <section className="landing-cards" id="connexion" aria-label="Portails de connexion">
          {CARTES.map((carte, i) => (
            <article className={`landing-card ${carte.tone} anim`} style={{ animationDelay: `${0.28 + i * 0.08}s` }} key={carte.espace}>
              <div className="landing-card-icon">{carte.icone}</div>
              <h2 className="landing-card-title">{carte.titre}</h2>
              <p className="landing-card-text">{carte.texte}</p>
              <button
                className="landing-card-btn"
                onClick={() => ouvrirConnexion(carte.espace)}
                aria-label={`Se connecter à l'espace ${carte.titre}`}
              >
                Se connecter
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </button>
            </article>
          ))}
        </section>

        <section className="landing-stats anim" style={{ animationDelay: '0.55s' }} aria-label="Chiffres clés">
          {STATS.map((s) => (
            <div className="landing-stat" key={s.label}>
              <span className="landing-stat-number">{s.nombre}</span>
              <span className="landing-stat-label">{s.label}</span>
            </div>
          ))}
        </section>
      </div>

      <footer className="landing-footer">
        <span className="landing-brand-mark" style={{ width: 26, height: 26 }}>{LOGO}</span>
        <span>© 2026 ECOSCOL — Plateforme de gestion scolaire du 6ème à la Terminale.</span>
      </footer>
    </div>
  );
}
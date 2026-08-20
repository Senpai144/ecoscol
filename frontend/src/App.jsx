import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { apiFetch } from './api.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { formatDate } from './components/ui.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import ClassesPage from './pages/ClassesPage.jsx';
import ScolariteElevesPage from './pages/ScolariteElevesPage.jsx';
import InscriptionPage from './pages/InscriptionPage.jsx';
import FicheElevePage from './pages/FicheElevePage.jsx';
import PortailPage from './pages/PortailPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import VieScolairePage from './pages/VieScolairePage.jsx';
import './index.css';

const MARQUE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
  </svg>
);

function IconeAccueil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
  );
}
function IconeEleves() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
  );
}
function IconeClasses() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>
  );
}
function IconeComptes() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  );
}
function IconeVieScolaire() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></svg>
  );
}

function LayoutApp() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const roles = session?.user?.roles || [];
  const peutScolarite = roles.some((r) => ['ADMIN', 'SECRETARIAT', 'CENSEUR'].includes(r));
  const peutVieScolaire = roles.some((r) => ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT'].includes(r));
  const initiales = ((session?.user?.prenom?.[0] ?? '') + (session?.user?.nom?.[0] ?? '')).toUpperCase();

  const items = [
    { vers: '/tableau-de-bord', label: 'Accueil', visible: true, icone: <IconeAccueil /> },
    { vers: '/eleves', label: 'Élèves', visible: peutScolarite, icone: <IconeEleves /> },
    { vers: '/classes', label: 'Classes', visible: peutScolarite, icone: <IconeClasses /> },
    { vers: '/vie-scolaire', label: 'Vie scolaire', visible: peutVieScolaire, icone: <IconeVieScolaire /> },
    { vers: '/comptes', label: 'Comptes', visible: roles.includes('ADMIN'), icone: <IconeComptes /> },
  ];

  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <div className="shell-brand-mark">{MARQUE}</div>
          <span className="shell-brand-name">Cursus</span>
        </div>
        <nav className="shell-nav" aria-label="Navigation principale">
          <div className="shell-nav-label">Espace personnel</div>
          {items.filter((i) => i.visible).map((i) => (
            <Link
              key={i.vers}
              to={i.vers}
              className={`shell-nav-item${location.pathname.startsWith(i.vers) ? ' active' : ''}`}
            >
              {i.icone}
              <span>{i.label}</span>
            </Link>
          ))}
        </nav>
        <div className="shell-footer">
          <div className="shell-avatar">{initiales}</div>
          <div className="shell-footer-text">
            <div className="shell-footer-name">{session?.user?.prenom} {session?.user?.nom}</div>
            <div className="shell-footer-role">{roles.join(' · ')}</div>
          </div>
        </div>
      </aside>
      <div className="shell-main">
        <div className="shell-topbar">
          <span className="shell-topbar-title">{items.find((i) => location.pathname.startsWith(i.vers))?.label ?? 'Cursus'}</span>
          <span className="shell-topbar-user">
            {session && (
              <button className="btn btn-ghost-dark btn-small" onClick={async () => { await logout(); navigate('/login'); }}>
                Déconnexion
              </button>
            )}
          </span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

function Comptes() {
  const { session } = useAuth();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    let actif = true;
    apiFetch('/api/users', { token: session?.token })
      .then((j) => { if (actif) setDonnees(j.users ?? []); })
      .catch((e) => { if (actif) setErreur(e.message || 'Impossible de charger les comptes.'); });
    return () => { actif = false; };
  }, []);
  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Gestion des comptes</h1>
          <p>Création, rôles et désactivation des comptes utilisateurs.</p>
        </div>
      </div>
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {!donnees && !erreur && <div className="etat-vide">Chargement des comptes…</div>}
      {donnees && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Identifiant</th>
                <th>Rôles</th>
                <th>Statut</th>
                <th>Dernier accès</th>
              </tr>
            </thead>
            <tbody>
              {donnees.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.prenom} {u.nom}</strong></td>
                  <td className="mono">{u.identifiant}</td>
                  <td>{(u.roles || []).map((r) => <span key={r} className="badge badge-ink" style={{ marginRight: 4 }}>{r}</span>)}</td>
                  <td>{u.statut === 'actif' ? <span className="badge badge-teal">Actif</span> : <span className="badge badge-coral">Désactivé</span>}</td>
                  <td className="mono" style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>{formatDate(u.dernier_acces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function AccesInterdit() {
  return (
    <main className="container">
      <h1>Accès interdit</h1>
      <p>Vous n'avez pas les permissions nécessaires pour consulter cette page.</p>
      <Link to="/">Retour à l'accueil</Link>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portail" element={<ProtectedRoute roles={['PARENT']}><PortailPage /></ProtectedRoute>} />
          <Route element={<ProtectedRoute><LayoutApp /></ProtectedRoute>}>
            <Route path="/tableau-de-bord" element={<DashboardPage />} />
            <Route path="/comptes" element={<ProtectedRoute roles={['ADMIN']}><Comptes /></ProtectedRoute>} />
            <Route path="/eleves" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT', 'CENSEUR']}><ScolariteElevesPage /></ProtectedRoute>} />
            <Route path="/eleves/inscription" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT']}><InscriptionPage /></ProtectedRoute>} />
            <Route path="/eleves/:id" element={<FicheElevePage />} />
            <Route path="/classes" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT', 'CENSEUR']}><ClassesPage /></ProtectedRoute>} />
            <Route path="/vie-scolaire" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT']}><VieScolairePage /></ProtectedRoute>} />
          </Route>
          <Route path="/acces-interdit" element={<AccesInterdit />} />
          <Route path="*" element={<main className="container"><h1>404 — Page introuvable</h1><Link to="/">Accueil</Link></main>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
import { BrowserRouter, Routes, Route, Link, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ApiStatus from './components/ApiStatus.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ClassesPage from './pages/ClassesPage.jsx';
import ScolariteElevesPage from './pages/ScolariteElevesPage.jsx';
import InscriptionPage from './pages/InscriptionPage.jsx';
import FicheElevePage from './pages/FicheElevePage.jsx';
import './index.css';

function Home() {
  const { session } = useAuth();
  return (
    <main className="container">
      <h1>ECOSCOL</h1>
      <p>Plateforme web de gestion scolaire — 6ème à Terminale</p>
      <div className="grid">
        <section>
          <h2>Personnel</h2>
          <p>Connexion sécurisée pour l'administration, les enseignants et le personnel.</p>
          <Link to="/login">Se connecter</Link>
        </section>
        <section>
          <h2>Portail parents</h2>
          <p>Résultats, absences et solde de votre enfant.</p>
          <Link to="/login">Accéder au portail</Link>
        </section>
      </div>
      {session && <p>Connecté en tant que {session.user.prenom} {session.user.nom}</p>}
      <ApiStatus />
    </main>
  );
}

function LayoutApp() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const roles = session?.user?.roles || [];
  const peutScolarite = roles.some((r) => ['ADMIN', 'SECRETARIAT', 'CENSEUR'].includes(r));
  return (
    <div>
      <header className="topbar">
        <strong>ECOSCOL</strong>
        <nav>
          <Link to="/tableau-de-bord">Accueil</Link>
          {peutScolarite && <Link to="/eleves">Élèves</Link>}
          {peutScolarite && <Link to="/classes">Classes</Link>}
          {roles.includes('ADMIN') && <Link to="/comptes">Comptes</Link>}
        </nav>
        <span className="topbar-user">
          {session ? `${session.user.prenom} ${session.user.nom} (${roles.join(', ')})` : ''}
          {session && (
            <button
              className="btn btn-ghost"
              onClick={async () => { await logout(); navigate('/login'); }}
            >
              Déconnexion
            </button>
          )}
        </span>
      </header>
      <Outlet />
    </div>
  );
}

function Dashboard() {
  const { session } = useAuth();
  return (
    <main className="container">
      <h1>Tableau de bord</h1>
      <p>Bienvenue {session?.user?.prenom}. Le tableau de bord (statistiques réelles) arrive à la phase 7.</p>
      <div className="grid">
        <section>
          <h2>Élèves inscrits</h2>
          <p>Consultez les dossiers élèves.</p>
          <Link to="/eleves">Ouvrir les élèves</Link>
        </section>
        <section>
          <h2>Classes</h2>
          <p>Gérez les classes et affectations.</p>
          <Link to="/classes">Ouvrir les classes</Link>
        </section>
      </div>
    </main>
  );
}

function Comptes() {
  return (
    <main className="container">
      <h1>Gestion des comptes</h1>
      <p>La gestion des comptes (création, rôles, désactivation) est opérationnelle côté API.</p>
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
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><LayoutApp /></ProtectedRoute>}>
            <Route path="/tableau-de-bord" element={<Dashboard />} />
            <Route path="/comptes" element={<ProtectedRoute roles={['ADMIN']}><Comptes /></ProtectedRoute>} />
            <Route path="/eleves" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT', 'CENSEUR']}><ScolariteElevesPage /></ProtectedRoute>} />
            <Route path="/eleves/inscription" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT']}><InscriptionPage /></ProtectedRoute>} />
            <Route path="/eleves/:id" element={<FicheElevePage />} />
            <Route path="/classes" element={<ProtectedRoute roles={['ADMIN', 'SECRETARIAT', 'CENSEUR']}><ClassesPage /></ProtectedRoute>} />
          </Route>
          <Route path="/acces-interdit" element={<AccesInterdit />} />
          <Route path="*" element={<main className="container"><h1>404 — Page introuvable</h1><Link to="/">Accueil</Link></main>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../api.js';
import { formatDate } from '../components/ui.jsx';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function aujourdHui() {
  const d = new Date();
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return `${jours[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

function IconeEleves() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
}
function IconeClasse() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>;
}
function IconeMatiere() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16M4 12h16M4 19h10" /></svg>;
}
function IconeProf() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function IconeRaccourci() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M21 3l-7 7M3 21l7-7" /></svg>;
}

export default function DashboardPage() {
  const { session } = useAuth();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    const token = session?.token;
    (async () => {
      try {
        const [eleves, classes, matieres, enseignants, sequences] = await Promise.all([
          apiFetch('/api/eleves', { token }),
          apiFetch('/api/classes', { token }),
          apiFetch('/api/pedagogique/matieres', { token }),
          apiFetch('/api/pedagogique/enseignants', { token }),
          apiFetch('/api/notes/sequences', { token }),
        ]);
        const listeEleves = eleves.eleves ?? eleves.data ?? [];
        const listeClasses = classes.classes ?? [];
        const listeMatieres = matieres.matieres ?? [];
        const listeEnseignants = enseignants.enseignants ?? [];

        const derniereValidee = [...sequences.sequences ?? []].sort((a, b) => (Number(b.ordre) || 0) - (Number(a.ordre) || 0)).find((s) => s.validee);
        const sequence = derniereValidee ?? [...sequences.sequences ?? []].sort((a, b) => (Number(b.ordre) || 0) - (Number(a.ordre) || 0))[0];

        let classements = [];
        if (sequence) {
          const moyennes = await apiFetch(`/api/notes/moyennes?classe_id=${listeClasses[0]?.id ?? 2}&sequence_id=${sequence.id}`, { token });
          classements = [...(moyennes.moyennes ?? [])].sort((a, b) => Number(a.rang) - Number(b.rang));
        }

        if (actif) {
          setDonnees({
            eleves: listeEleves,
            classes: listeClasses,
            matieres: listeMatieres,
            enseignants: listeEnseignants,
            sequences: sequences.sequences ?? [],
            classements,
            sequence,
          });
        }
      } catch (e) {
        if (actif) setErreur(e.message || 'Impossible de charger le tableau de bord.');
      }
    })();
    return () => { actif = false; };
  }, []);

  if (!donnees) {
    return (
      <main className="container">
        <div className="page-header">
          <div>
            <h1>Tableau de bord</h1>
            <p>Chargement des indicateurs…</p>
          </div>
        </div>
        {erreur && <div className="alert alert-error">{erreur}</div>}
        <div className="etat-vide">Chargement des statistiques de l'établissement.</div>
      </main>
    );
  }

  const totalEleves = donnees.eleves.length;
  const actifs = donnees.eleves.filter((e) => e.statut === 'actif').length;
  const effectifTotal = donnees.classes.reduce((s, c) => s + Number(c.effectif || 0), 0);
  const capaciteTotal = donnees.classes.reduce((s, c) => s + Number(c.capacite || 0), 0);
  const remplissage = capaciteTotal > 0 ? Math.round((effectifTotal / capaciteTotal) * 100) : 0;
  const moyenneGen = donnees.classements.length
    ? (donnees.classements.reduce((s, m) => s + Number(m.moyenne), 0) / donnees.classements.length).toFixed(2).replace('.', ',')
    : '—';

  return (
    <main className="container">
      <section className="dash-welcome">
        <div>
          <h1>Bienvenue, {session?.user?.prenom} 👋</h1>
          <p>Vue d'ensemble de l'établissement — {aujourdHui()}.</p>
        </div>
        <div className="dash-pills">
          <div className="dash-pill">
            <span className="mono">{donnees.sequence ? donnees.sequence.libelle : 'Séq. —'}</span>
            <span>Séquence active</span>
          </div>
          <div className="dash-pill">
            <span className="mono">{moyenneGen} / 20</span>
            <span>Moy. générale</span>
          </div>
          <div className="dash-pill">
            <span className="mono">{remplissage} %</span>
            <span>Remplissage</span>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon teal"><IconeEleves /></div>
          <div>
            <div className="stat-value">{actifs}<span style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}> / {totalEleves}</span></div>
            <div className="stat-label">Élèves actifs</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon ink"><IconeClasse /></div>
          <div>
            <div className="stat-value">{donnees.classes.length}</div>
            <div className="stat-label">Classes</div>
            <div className="stat-sub">{effectifTotal} élèves inscrits</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><IconeMatiere /></div>
          <div>
            <div className="stat-value">{donnees.matieres.length}</div>
            <div className="stat-label">Matières</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon coral"><IconeProf /></div>
          <div>
            <div className="stat-value">{donnees.enseignants.length}</div>
            <div className="stat-label">Enseignants</div>
          </div>
        </div>
      </section>

      <div className="dash-cols">
        <section className="section">
          <div className="page-header" style={{ margin: 0 }}>
            <div>
              <h2 style={{ margin: 0 }}>{donnees.sequence ? `Classement — ${donnees.sequence.libelle}` : 'Classement'}</h2>
              {donnees.sequence && <p style={{ margin: '2px 0 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>{donnees.sequence.libelle} · année {donnees.sequence.annee_libelle ?? ''}</p>}
            </div>
            <Link to="/eleves" className="btn btn-secondary btn-small">Voir les élèves</Link>
          </div>
          {donnees.classements.length === 0 ? (
            <div className="etat-vide">Aucune moyenne pour le moment — saisissez des notes pour alimenter le classement.</div>
          ) : (
            <ul className="race-list">
              {donnees.classements.map((m) => (
                <li className="race-item" key={m.eleve_id}>
                  <span className="race-rank">{m.rang}</span>
                  <div className="race-name">
                    <strong>{m.prenom} {m.nom}</strong>
                    <span>{m.matricule}</span>
                  </div>
                  <span className="race-score">{Number(m.moyenne).toFixed(2).replace('.', ',')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <section className="section">
            <h2 style={{ marginTop: 0 }}>Séquences</h2>
            {donnees.sequences.length === 0 ? (
              <p style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>Aucune séquence créée.</p>
            ) : (
              donnees.sequences.slice().sort((a, b) => Number(a.ordre) - Number(b.ordre)).map((s) => (
                <div className="seq-row" key={s.id}>
                  <span className="seq-label">{s.libelle}</span>
                  <span>{s.validee ? <span className="badge badge-teal">Validée</span> : <span className="badge badge-amber">En attente</span>}</span>
                  {s.validee && s.validee_le && <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>{formatDate(s.validee_le)}</span>}
                </div>
              ))
            )}
          </section>

          <section className="section">
            <h2 style={{ marginTop: 0 }}>Accès rapide</h2>
            <div className="dash-actions">
              <Link to="/eleves" className="dash-action"><IconeRaccourci /> Dossiers élèves</Link>
              <Link to="/eleves/inscription" className="dash-action"><IconeRaccourci /> Nouvelle inscription</Link>
              <Link to="/classes" className="dash-action"><IconeRaccourci /> Classes</Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
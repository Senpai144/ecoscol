import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../api.js';
import { getPaiementsPortail, payerEnLigne, modifierPaiementPortail, telechargerDocumentPortail } from '../api.portail.js';
import './portail.css';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatChrono(h) {
  if (h === null || h === undefined) return '--:--';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function heureFloat(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return h + m / 60;
}

function aujourdHui() {
  const d = new Date();
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return `${jours[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

function TimelineAujourdhui({ creneaux }) {
  const [maintenant, setMaintenant] = useState(() => new Date().getHours() + new Date().getMinutes() / 60);

  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date().getHours() + new Date().getMinutes() / 60), 60000);
    return () => clearInterval(t);
  }, []);

  const { debut, fin } = useMemo(() => {
    if (!creneaux || creneaux.length === 0) return { debut: 8, fin: 17 };
    const heures = creneaux.flatMap((c) => [heureFloat(c.heure_debut), heureFloat(c.heure_fin)]);
    return { debut: Math.min(...heures), fin: Math.max(...heures) };
  }, [creneaux]);

  const pct = Math.min(Math.max((maintenant - debut) / (fin - debut), 0), 1);

  if (!creneaux || creneaux.length === 0) {
    return (
      <div className="portail-empty">
        Aucun cours programmé aujourd'hui. Profitez-en pour réviser !
      </div>
    );
  }

  return (
    <div className="portail-timeline">
      <div className="portail-timeline-track"></div>
      <div className="portail-timeline-progress" style={{ width: `${pct * 100}%` }}></div>
      <div className="portail-timeline-now" style={{ left: `${pct * 100}%` }}></div>
      {creneaux.map((c, i) => {
        const now = maintenant >= heureFloat(c.heure_debut) && maintenant < heureFloat(c.heure_fin);
        return (
          <div className="portail-period" key={i}>
            <div className="portail-period-time">{c.heure_debut}–{c.heure_fin}</div>
            <div className={`portail-period-card${now ? ' now' : ''}`}>
              <div className="portail-period-subject">{c.matiere}</div>
              <div className="portail-period-room">{c.enseignant}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoyenneMatiere({ m }) {
  return (
    <div className="portail-subject-row">
      <span className="portail-subject-name">{m.matiere}</span>
      <span className="portail-subject-grade mono">
        {m.n_notes > 0 ? m.moyenne.toFixed(2).replace('.', ',') : '—'}
      </span>
    </div>
  );
}

function CarteMoyennes({ enfant }) {
  const moy = enfant.moyennes;
  if (!moy) {
    return (
      <div className="portail-empty">
        Aucune évaluation publiée pour le moment.
      </div>
    );
  }
  const moyenne = moy.moyenneGenerale.toFixed(2).replace('.', ',');
  return (
    <>
      <div className="portail-card-header">
        <span className="portail-card-title">Moyennes — {moy.sequence.libelle}</span>
        <span className="portail-card-link">{moy.rang > 0 ? `Rang ${moy.rang}/${moy.totalEleves}` : ''}</span>
      </div>
      <div className="portail-avg-hero">
        <span className="portail-avg-hero-num">{moyenne}</span>
        <span className="portail-avg-hero-label">/ 20 — moyenne générale</span>
      </div>
      {moy.parMatiere.map((m, i) => (
        <MoyenneMatiere key={i} m={m} />
      ))}
    </>
  );
}

function CarteDevoirs({ enfant }) {
  const devoirs = enfant.devoirs || [];
  return (
    <div className="portail-card portail-todo" style={{ animationDelay: '0.14s' }}>
      <div className="portail-card-header">
        <span className="portail-card-title">Cahier de texte</span>
        <span className="portail-card-link">{devoirs.length} entrée{devoirs.length > 1 ? 's' : ''}</span>
      </div>
      {devoirs.length === 0 ? (
        <div className="portail-empty">Aucun devoir publié sur le cahier de texte.</div>
      ) : (
        devoirs.map((d, i) => (
          <div className="portail-todo-item" key={i}>
            <div>
              <div className="portail-todo-text">{d.contenu}</div>
              <div className="portail-todo-meta">
                <span className="portail-pill due-later">{d.matiere}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CarteMessages({ enfant }) {
  const notifs = enfant.notifications || [];
  return (
    <div className="portail-card portail-msg" style={{ animationDelay: '0.2s' }}>
      <div className="portail-card-header">
        <span className="portail-card-title">Notifications</span>
        <span className="portail-card-link">Tout voir →</span>
      </div>
      {notifs.length === 0 ? (
        <div className="portail-empty">Aucune notification pour le moment.</div>
      ) : (
        notifs.map((n, i) => (
          <div className="portail-msg-item" key={i}>
            <div className="portail-msg-avatar">EC</div>
            <div className="portail-msg-body">
              <div className="portail-msg-top">
                <span className="portail-msg-sender">{n.type}</span>
                <span className="portail-msg-time">{n.date}</span>
              </div>
              <div className="portail-msg-preview">{n.message}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CarteVieScolaire({ enfant }) {
  const vs = enfant.vieScolaire || { absences: 0, retards: 0, absences_non_justifiees: 0, sanctions: 0 };
  const stats = [
    { num: vs.absences, label: vs.absences_non_justifiees > 0 ? `Absence${vs.absences > 1 ? 's' : ''} (${vs.absences_non_justifiees} non justif.)` : `Absence${vs.absences > 1 ? 's' : ''} justifiée${vs.absences > 1 ? 's' : ''}`, tone: 'teal' },
    { num: vs.retards, label: `Retard${vs.retards > 1 ? 's' : ''}`, tone: 'amber' },
    { num: vs.sanctions, label: `Sanction${vs.sanctions > 1 ? 's' : ''}`, tone: 'coral' },
  ];
  const icons = {
    teal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="17" height="17"><path d="M20 6 9 17l-5-5" /></svg>,
    amber: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
    coral: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>,
  };
  return (
    <div className="portail-card portail-vs" style={{ animationDelay: '0.26s' }}>
      <div className="portail-card-header">
        <span className="portail-card-title">Vie scolaire — {enfant.eleve.classe}</span>
        <span className="portail-card-link">Historique →</span>
      </div>
      <div className="portail-vs-row">
        {stats.map((s, i) => (
          <div className="portail-vs-stat" key={i}>
            <div>
              <div className="portail-vs-stat-num">{s.num}</div>
              <div className="portail-vs-stat-label">{s.label}</div>
            </div>
            <div className="portail-vs-icon" style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `var(--${s.tone}-soft)`, color: `var(--${s.tone})` }}>
              {icons[s.tone]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fmtMontant = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;

const LIBELLES_MODES = {
  especes: 'Espèces',
  cheque: 'Chèque',
  mobile_money: 'Mobile Money / Wave',
  virement: 'Virement',
};

function CartePaiements({ enfant, token }) {
  const [donnees, setDonnees] = useState(null);
  const [form, setForm] = useState(null);
  const [modification, setModification] = useState(null);
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const charger = async () => {
    setErreur('');
    try {
      const d = await getPaiementsPortail(enfant.eleve.id);
      setDonnees(d);
    } catch (e) {
      setErreur(e.message);
    }
  };

  useEffect(() => { charger(); }, [enfant.eleve.id]);

  async function payer(e) {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    setMessage(null);
    try {
      const d = await payerEnLigne({
        eleve_id: enfant.eleve.id,
        echeancier_id: Number(form.echeancier_id),
        montant: Number(form.montant),
        motif: form.motif,
        mode: form.mode,
      });
      setMessage(d.message);
      if (d.paiement?.recu_fichier) {
        telechargerDocumentPortail(d.paiement.recu_fichier).catch(() => {});
      }
      setForm(null);
      charger();
    } catch (err) {
      setErreur(err.message || 'Échec du paiement');
    } finally {
      setChargement(false);
    }
  }

  async function corriger(e) {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    setMessage(null);
    try {
      const d = await modifierPaiementPortail(modification.paiement.id, {
        montant: Number(modification.montant),
        mode: modification.mode,
        motif: modification.motif,
        transaction_ref: modification.transaction_ref,
      });
      setMessage(d.message);
      if (d.paiement?.recu_fichier) {
        telechargerDocumentPortail(d.paiement.recu_fichier).catch(() => {});
      }
      setModification(null);
      charger();
    } catch (err) {
      setErreur(err.message || 'Échec de la modification');
    } finally {
      setChargement(false);
    }
  }

  const reste = donnees?.resteDu ?? 0;
  const echeances = donnees?.echeanciers ?? [];
  const paiements = donnees?.paiements ?? [];
  const motifs = [...new Set(echeances.map((e) => e.libelle).filter(Boolean))];

  return (
    <div className="portail-card portail-todo portail-pay" style={{ animationDelay: '0.3s' }}>
      <div className="portail-card-header">
        <span className="portail-card-title">Paiements — {enfant.eleve.classe}</span>
        <span className="portail-card-link">{donnees ? fmtMontant(reste) : '…'}</span>
      </div>

      {erreur && <div className="alert alert-error" style={{ margin: '0.5rem 0' }}>{erreur}</div>}
      {message && <div className="alert alert-ok" style={{ margin: '0.5rem 0' }}>{message}</div>}

      {!donnees ? (
        <div className="portail-empty">Chargement du solde…</div>
      ) : echeances.length === 0 ? (
        <div className="portail-empty">Aucun frais à régler. À jour ✓</div>
      ) : (
        <>
          {echeances.map((ec) => {
            const resteEc = Number(ec.solde);
            return (
              <div key={ec.id} className="portail-recu-row">
                <div>
                  <div className="portail-recu-label">{ec.libelle}</div>
                  <div className="portail-recu-meta">{ec.annee_libelle} · échéance {ec.date_echeance}</div>
                </div>
                <div className="portail-recu-right">
                  {resteEc > 0 ? (
                    <>
                      <span className="portail-recu-montant">{fmtMontant(resteEc)}</span>
                      <button
                        className="portail-pay-btn"
                        onClick={() => setForm({ echeancier_id: ec.id, montant: resteEc.toFixed(0), mode: 'mobile_money', motif: ec.libelle })}
                      >
                        Payer en ligne
                      </button>
                    </>
                  ) : (
                    <span className="portail-pay-ok">Soldé ✓</span>
                  )}
                </div>
              </div>
            );
          })}

          {form && (
            <form className="portail-pay-form" onSubmit={payer}>
              <div className="portail-pay-title">
                Paiement mobile money — reçu immédiat
              </div>
              <select value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} required aria-label="Motif">
                {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" min="1" step="1" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} required aria-label="Montant" />
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} aria-label="Mode">
                {Object.entries(LIBELLES_MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="portail-pay-autoref">Référence de transaction générée automatiquement.</p>
              <button type="submit" className="portail-pay-btn portail-pay-btn-primary" disabled={chargement}>
                {chargement ? 'Confirmation…' : `Confirmer le paiement (${fmtMontant(form.montant)})`}
              </button>
              <button type="button" className="portail-pay-cancel" onClick={() => setForm(null)}>Annuler</button>
            </form>
          )}

          {modification && (
            <form className="portail-pay-form" onSubmit={corriger}>
              <div className="portail-pay-title">
                Corriger le paiement {modification.paiement.numero_recu}
              </div>
              <select value={modification.motif} onChange={(e) => setModification({ ...modification, motif: e.target.value })} aria-label="Motif">
                {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" min="1" step="1" value={modification.montant} onChange={(e) => setModification({ ...modification, montant: e.target.value })} required aria-label="Montant" />
              <select value={modification.mode} onChange={(e) => setModification({ ...modification, mode: e.target.value })} aria-label="Mode">
                {Object.entries(LIBELLES_MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input
                type="text"
                value={modification.transaction_ref}
                onChange={(e) => setModification({ ...modification, transaction_ref: e.target.value })}
                placeholder="Référence de transaction (facultatif)"
                aria-label="Référence transaction"
              />
              <button type="submit" className="portail-pay-btn portail-pay-btn-primary" disabled={chargement}>
                {chargement ? 'Enregistrement…' : 'Enregistrer la correction'}
              </button>
              <button type="button" className="portail-pay-cancel" onClick={() => setModification(null)}>Annuler</button>
            </form>
          )}

          {paiements.length > 0 && (
            <>
              <div className="portail-card-header" style={{ marginTop: '0.9rem' }}>
                <span className="portail-card-title">Historique des reçus</span>
                <span className="portail-card-link">{paiements.length}</span>
              </div>
              {paiements.map((p) => (
                <div key={p.id} className="portail-recu-row">
                  <div>
                    <div className="portail-recu-label mono">{p.numero_recu}</div>
                    <div className="portail-recu-meta">{p.date_paiement} · {LIBELLES_MODES[p.mode] || p.mode} · {p.motif}</div>
                  </div>
                  <div className="portail-recu-right">
                    <span className={`portail-recu-montant${p.recu_annule ? ' portail-recu-annule' : ''}`}>{fmtMontant(p.montant)}</span>
                    {!p.recu_annule && (
                      <button
                        className="portail-pay-btn"
                        onClick={() => setModification({
                          paiement: p,
                          montant: Number(p.montant).toFixed(0),
                          mode: p.mode,
                          motif: p.motif,
                          transaction_ref: p.transaction_ref || '',
                        })}
                      >
                        Modifier
                      </button>
                    )}
                    {!p.recu_annule && p.recu_fichier && (
                      <button className="portail-pay-btn" onClick={() => telechargerDocumentPortail(p.recu_fichier).catch(() => setErreur('Reçu indisponible au téléchargement'))}>
                        Reçu PDF
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function PortailPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enfantId, setEnfantId] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const data = await apiFetch('/api/portail/tableau-de-bord', { token: session?.token });
        if (vivant) setDonnees(data);
      } catch (err) {
        if (vivant) setErreur(err.message);
      }
    })();
    return () => { vivant = false; };
  }, [session?.token]);

  if (erreur) {
    return (
      <div className="portail">
        <div className="portail-error portail-main">Impossible de charger le portail : {erreur}</div>
      </div>
    );
  }
  if (!donnees) {
    return <div className="portail"><div className="portail-loading portail-main">Chargement du portail…</div></div>;
  }

  const enfant = donnees?.enfants?.find((e) => Number(e.eleve.id) === Number(enfantId)) ?? donnees?.enfants?.[0];
  const heures = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const initiales = (enfant?.eleve.prenom?.[0] ?? 'E') + (enfant?.eleve.nom?.[0] ?? '');

  const deconnexion = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="portail">
      <aside className="portail-sidebar">
        <div className="portail-brand">
          <div className="portail-brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" width="18" height="18"><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" /></svg>
          </div>
          <span className="portail-brand-name">Cursus</span>
        </div>
        <nav className="portail-nav">
          <a className="portail-nav-item active" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
            <span>Accueil</span>
          </a>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>
            <span>Emploi du temps</span>
          </a>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 19V5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M8 8h8M8 13h5" /></svg>
            <span>Notes</span>
          </a>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            <span>Devoirs</span>
          </a>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
            <span>Messagerie</span>
          </a>
          <div className="portail-nav-label">Suivi</div>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
            <span>Vie scolaire</span>
          </a>
          <a className="portail-nav-item" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /></svg>
            <span>Documents</span>
          </a>
        </nav>
        <div className="portail-sidebar-footer">
          <div className="portail-avatar">{initiales.toUpperCase()}</div>
          <div className="portail-sidebar-footer-text">
            <div className="portail-sidebar-name">{enfant?.eleve.prenom} {enfant?.eleve.nom}</div>
            <div className="portail-sidebar-role">{enfant?.eleve.classe ?? 'Élève'}</div>
          </div>
        </div>
      </aside>

      <div className="portail-main">
        <div className="portail-topbar">
          <div className="portail-page-sub mono">{heures}</div>
          <div className="portail-topbar-right">
            <span className="portail-page-sub">{donnees.parent.prenom} {donnees.parent.nom}</span>
            <button className="btn btn-ghost" onClick={deconnexion}>Déconnexion</button>
          </div>
        </div>

        <div className="portail-content">
          <div className="portail-page-head">
            <div className="portail-eyebrow">{aujourdHui()}</div>
            <h1 className="portail-page-title">Bienvenue {enfant?.eleve.prenom} 👋</h1>
            <p className="portail-page-sub">Voici où tu en es aujourd'hui — cours, notes et vie scolaire.</p>
          </div>

          <div className="portail-grid">
            <section className="portail-card portail-today" style={{ animationDelay: '0.02s' }}>
              <div className="portail-card-header">
                <div className="portail-today-meta">
                  <span className="portail-card-title">Aujourd'hui</span>
                  <span className="portail-today-date mono">{formatChrono(new Date().getHours() + new Date().getMinutes() / 60)}</span>
                </div>
                <span className="portail-card-link">{enfant?.eleve.classe}</span>
              </div>
              <TimelineAujourdhui creneaux={enfant?.edt} />
            {donnees?.enfants?.length > 1 && (
              <div className="portail-enfant-select">
                <label htmlFor="portail-enfant">Mon enfant :</label>
                <select
                  id="portail-enfant"
                  value={enfant?.eleve.id}
                  onChange={(e) => setEnfantId(e.target.value)}
                >
                  {donnees.enfants.map((en) => (
                    <option key={en.eleve.id} value={en.eleve.id}>
                      {en.eleve.prenom} {en.eleve.nom} — {en.eleve.classe}
                    </option>
                  ))}
                </select>
              </div>
            )}
            </section>

            <section className="portail-card portail-avg" style={{ animationDelay: '0.08s' }}>
              <CarteMoyennes enfant={enfant} />
            </section>

            <CarteDevoirs enfant={enfant} />
            <CarteMessages enfant={enfant} />
            <CarteVieScolaire enfant={enfant} />
            <CartePaiements enfant={enfant} token={session?.token} />
          </div>
        </div>
      </div>
    </div>
  );
}
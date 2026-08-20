import { useState, useEffect, useMemo } from 'react';
import { getClasses, getEleves, getNiveaux, getSeries } from '../api.scolarite.js';
import {
  getGrilleTarifaire, ajouterTarif, supprimerTarif,
  getDossiersFinanciers, getDossierEleve, ajouterEcheancier, supprimerEcheancier,
  enregistrerPaiement, annulerPaiement, genererRecuPDF, getPaiements,
} from '../api.finances.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES_GESTION = ['ADMIN', 'SECRETARIAT', 'COMPTABLE'];
const ROLES_ANNULATION = ['ADMIN', 'COMPTABLE'];

const LIBELLES_MODES = {
  especes: 'Espèces',
  cheque: 'Chèque',
  mobile_money: 'Mobile Money',
  virement: 'Virement',
};

const fmt = (n) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;

function telechargerFichier(nomFichier) {
  const token = localStorage.getItem('ecoscol_token');
  return fetch(`/api/documents/documents/${encodeURIComponent(nomFichier)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((resp) => {
    if (!resp.ok) throw new Error('Impossible de télécharger le document');
    return resp.blob();
  }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function OngletPaiements({ classes, roles }) {
  const [filtres, setFiltres] = useState({ classe: '', date_debut: '', date_fin: '', annule: '' });
  const [paiements, setPaiements] = useState([]);
  const [montrerSaisie, setMontrerSaisie] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const [eleves, setEleves] = useState([]);
  const [form, setForm] = useState({
    eleve_id: '', echeancier_id: '', montant: '', motif: '', mode: 'especes', date: '', transaction_ref: '',
  });
  const [echeanciers, setEcheanciers] = useState([]);
  const peutAnnuler = roles.some((r) => ROLES_ANNULATION.includes(r));

  async function charger() {
    setErreur('');
    try {
      const d = await getPaiements({
        classe_id: filtres.classe, date_debut: filtres.date_debut, date_fin: filtres.date_fin, annule: filtres.annule,
      });
      setPaiements(d.paiements || []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => { charger(); }, []);

  useEffect(() => {
    if (filtres.classe) {
      getEleves({ classe: filtres.classe, statut: 'actif', limit: 200 }).then((d) => setEleves(d.eleves || [])).catch(() => {});
    }
  }, [filtres.classe]);

  useEffect(() => {
    if (form.eleve_id) {
      getDossierEleve(form.eleve_id)
        .then((d) => setEcheanciers((d.echeanciers || []).filter((ec) => Number(ec.solde) > 0)))
        .catch(() => setEcheanciers([]));
    } else {
      setEcheanciers([]);
    }
  }, [form.eleve_id]);

  async function saisir(e) {
    e.preventDefault();
    setErreur('');
    setMessage(null);
    try {
      const d = await enregistrerPaiement({
        eleve_id: Number(form.eleve_id),
        echeancier_id: form.echeancier_id ? Number(form.echeancier_id) : null,
        montant: Number(form.montant),
        motif: form.motif,
        mode: form.mode,
        date_paiement: form.date || undefined,
        transaction_ref: form.transaction_ref || undefined,
      });
      setMessage(`Paiement enregistré — reçu ${d.paiement.numero_recu}.`);
      setForm({ ...form, echeancier_id: '', montant: '', motif: '', transaction_ref: '', eleve_id: '' });
      setMontrerSaisie(false);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function imprimerRecu(p) {
    setErreur('');
    try {
      const d = await genererRecuPDF(p.id);
      await telechargerFichier(d.fichier);
      setMessage(`Reçu ${d.identifiant} téléchargé.`);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function annuler(p) {
    if (!confirm(`Annuler le paiement ${p.numero_recu} (${fmt(p.montant)}) ? Le solde sera recrédité.`)) return;
    setErreur('');
    setMessage(null);
    try {
      await annulerPaiement(p.id, 'Annulé en régie');
      setMessage(`Paiement ${p.numero_recu} annulé.`);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div>
      <div className="filtres">
        <select value={filtres.classe} onChange={(e) => setFiltres({ ...filtres, classe: e.target.value })} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <input type="date" value={filtres.date_debut} onChange={(e) => setFiltres({ ...filtres, date_debut: e.target.value })} aria-label="Du" />
        <input type="date" value={filtres.date_fin} onChange={(e) => setFiltres({ ...filtres, date_fin: e.target.value })} aria-label="Au" />
        <select value={filtres.annule} onChange={(e) => setFiltres({ ...filtres, annule: e.target.value })} aria-label="Statut">
          <option value="">Tous les reçus</option>
          <option value="0">Non annulés</option>
          <option value="1">Annulés</option>
        </select>
        <button className="btn btn-secondary" onClick={charger}>Filtrer</button>
        <button className="btn btn-primary" onClick={() => setMontrerSaisie((v) => !v)}>
          {montrerSaisie ? 'Fermer la saisie' : '+ Saisir un paiement'}
        </button>
      </div>

      {erreur && <div className="alert alert-error">{erreur}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {montrerSaisie && (
        <form className="formulaire" onSubmit={saisir}>
          <fieldset>
            <legend>Nouveau paiement</legend>
            <div className="form-grid">
              <label>Classe
                <select value={filtres.classe} onChange={(e) => setFiltres({ ...filtres, classe: e.target.value })} required>
                  <option value="">Choisir une classe…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                </select>
              </label>
              <label>Élève
                <select value={form.eleve_id} onChange={(e) => setForm({ ...form, eleve_id: e.target.value })} required>
                  <option value="">Choisir un élève…</option>
                  {eleves.map((el) => <option key={el.id} value={el.id}>{el.prenom} {el.nom}</option>)}
                </select>
              </label>
              <label>Échéance (facultatif)
                <select value={form.echeancier_id} onChange={(e) => setForm({ ...form, echeancier_id: e.target.value })}>
                  <option value="">Sans affectation</option>
                  {echeanciers.map((ec) => <option key={ec.id} value={ec.id}>{ec.libelle} — reste {fmt(ec.solde)}</option>)}
                </select>
              </label>
              <label>Montant (FCFA)
                <input type="number" min="1" step="1" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} placeholder="Ex. 15000" required />
              </label>
              <label>Motif
                <input type="text" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="Ex. Frais de scolarité" required />
              </label>
              <label>Mode
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  {Object.entries(LIBELLES_MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label>Date
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label>Réf. transaction
                <input type="text" value={form.transaction_ref} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} placeholder="Ex. OM-884521" />
              </label>
            </div>
            <button className="btn btn-primary" type="submit">Enregistrer et générer le numéro de reçu</button>
          </fieldset>
        </form>
      )}

      {paiements.length === 0 ? (
        <div className="etat-vide">Aucun paiement enregistré.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Motif</th><th>Mode</th><th>Montant</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.numero_recu}</td>
                  <td className="mono">{p.date_paiement}</td>
                  <td>{p.prenom} {p.nom} <span style={{ color: 'var(--text-faint)', display: 'block', fontSize: '0.8rem' }}>{p.matricule}</span></td>
                  <td>{p.motif}{p.echeancier_libelle ? <span style={{ color: 'var(--text-faint)', display: 'block', fontSize: '0.8rem' }}>{p.echeancier_libelle}</span> : null}</td>
                  <td>{LIBELLES_MODES[p.mode] || p.mode}</td>
                  <td><strong>{fmt(p.montant)}</strong></td>
                  <td>{p.recu_annule ? <span className="badge badge-coral">Annulé</span> : <span className="badge badge-teal">Valide</span>}</td>
                  <td>
                    {!p.recu_annule && (
                      <button className="btn btn-small" onClick={() => imprimerRecu(p)}>Reçu PDF</button>
                    )}
                    {!p.recu_annule && peutAnnuler && (
                      <button className="btn btn-small btn-danger" style={{ marginLeft: 6 }} onClick={() => annuler(p)}>Annuler</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OngletDossiers({ classes }) {
  const [classeId, setClasseId] = useState('');
  const [eleves, setEleves] = useState([]);
  const [eleveId, setEleveId] = useState('');
  const [dossier, setDossier] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ libelle: '', montant_du: '', date_echeance: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    if (classeId) {
      getEleves({ classe: classeId, statut: 'actif', limit: 200 }).then((d) => setEleves(d.eleves || [])).catch(() => {});
    }
  }, [classeId]);

  useEffect(() => {
    if (eleveId) {
      getDossierEleve(eleveId).then(setDossier).catch((e) => setErreur(e.message));
    } else {
      setDossier(null);
    }
  }, [eleveId]);

  async function ajouter(e) {
    e.preventDefault();
    setErreur('');
    setMessage(null);
    try {
      const d = await ajouterEcheancier({
        eleve_id: Number(eleveId),
        libelle: form.libelle,
        montant_du: Number(form.montant_du),
        date_echeance: form.date_echeance,
      });
      setMessage(`Échéance « ${d.echeancier.libelle} » créée (${fmt(d.echeancier.montant_du)}).`);
      setForm({ libelle: '', montant_du: '', date_echeance: new Date().toISOString().slice(0, 10) });
      getDossierEleve(eleveId).then(setDossier).catch(() => {});
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimer(ec) {
    if (!confirm(`Supprimer l'échéance « ${ec.libelle} » ?`)) return;
    setErreur('');
    setMessage(null);
    try {
      await supprimerEcheancier(ec.id);
      setMessage('Échéance supprimée.');
      getDossierEleve(eleveId).then(setDossier).catch(() => {});
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div>
      <div className="filtres">
        <select value={classeId} onChange={(e) => { setClasseId(e.target.value); setEleveId(''); }} aria-label="Classe">
          <option value="">Choisir une classe…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <select value={eleveId} onChange={(e) => setEleveId(e.target.value)} aria-label="Élève">
          <option value="">Choisir un élève…</option>
          {eleves.map((el) => <option key={el.id} value={el.id}>{el.prenom} {el.nom} ({el.matricule})</option>)}
        </select>
      </div>
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {!dossier ? (
        <div className="etat-vide">Sélectionnez un élève pour consulter son dossier financier.</div>
      ) : (
        <div>
          <div className="home-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="carte"><h3>Total dû</h3><p className="carte-petit" style={{ fontWeight: 700, color: 'var(--ink-strong)' }}>{fmt(dossier.totalDu)}</p></div>
            <div className="carte"><h3>Total payé</h3><p className="carte-petit" style={{ fontWeight: 700, color: 'var(--teal)' }}>{fmt(dossier.totalPaye)}</p></div>
            <div className="carte"><h3>Reste à payer</h3><p className="carte-petit" style={{ fontWeight: 700, color: 'var(--coral)' }}>{fmt(dossier.resteDu)}</p></div>
          </div>

          <h2 style={{ marginTop: '1.5rem', fontSize: '1rem' }}>Échéancier de {dossier.eleve.prenom} {dossier.eleve.nom}</h2>
          <form className="formulaire" onSubmit={ajouter}>
            <fieldset>
              <legend>Ajouter une échéance</legend>
              <div className="form-grid">
                <label>Libellé
                  <input type="text" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex. Frais de scolarité (2e trimestre)" required />
                </label>
                <label>Montant (FCFA)
                  <input type="number" min="1" value={form.montant_du} onChange={(e) => setForm({ ...form, montant_du: e.target.value })} placeholder="Ex. 50000" required />
                </label>
                <label>Date d'échéance
                  <input type="date" value={form.date_echeance} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} required />
                </label>
              </div>
              <button className="btn btn-primary" type="submit">Créer l'échéance</button>
            </fieldset>
          </form>

          {dossier.echeanciers.length === 0 ? (
            <div className="etat-vide">Aucune échéance pour cet élève.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Échéance</th><th>Année</th><th>Échéance le</th><th>Montant dû</th><th>Reste</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {dossier.echeanciers.map((ec) => (
                    <tr key={ec.id}>
                      <td><strong>{ec.libelle}</strong></td>
                      <td>{ec.annee_libelle}</td>
                      <td className="mono">{ec.date_echeance}</td>
                      <td>{fmt(ec.montant_du)}</td>
                      <td>{Number(ec.solde) > 0 ? <span className="badge badge-amber">{fmt(ec.solde)}</span> : <span className="badge badge-teal">Soldé</span>}</td>
                      <td>
                        <button className="btn btn-small btn-danger" onClick={() => supprimer(ec)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ marginTop: '1.5rem', fontSize: '1rem' }}>Paiements de {dossier.eleve.prenom} {dossier.eleve.nom}</h2>
          {dossier.paiements.length === 0 ? (
            <div className="etat-vide">Aucun paiement pour cet élève.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Reçu</th><th>Date</th><th>Motif</th><th>Mode</th><th>Montant</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {dossier.paiements.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.numero_recu}</td>
                      <td className="mono">{p.date_paiement}</td>
                      <td>{p.motif}</td>
                      <td>{LIBELLES_MODES[p.mode] || p.mode}</td>
                      <td><strong>{fmt(p.montant)}</strong></td>
                      <td>{p.recu_annule ? <span className="badge badge-coral">Annulé</span> : <span className="badge badge-teal">Valide</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OngletImpayes({ classes }) {
  const [classeId, setClasseId] = useState('');
  const [impaye, setImpaye] = useState(true);
  const [dossiers, setDossiers] = useState([]);
  const [erreur, setErreur] = useState('');

  async function charger() {
    setErreur('');
    try {
      const d = await getDossiersFinanciers({ classe: classeId, impaye });
      setDossiers(d.dossiers || []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => { charger(); }, [classeId, impaye]);

  return (
    <div>
      <div className="filtres">
        <select value={classeId} onChange={(e) => setClasseId(e.target.value)} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <label style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={impaye} onChange={(e) => setImpaye(e.target.checked)} />
          Uniquement les impayés
        </label>
        <button className="btn btn-secondary" onClick={charger}>Actualiser</button>
      </div>
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {dossiers.length === 0 ? (
        <div className="etat-vide">{impaye ? 'Aucun impayé. Tout est soldé !' : 'Aucun dossier.'}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Classe</th><th>Élève</th><th>Total dû</th><th>Total payé</th><th>Reste</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dossiers.map((d) => (
                <tr key={d.id}>
                  <td>{d.classe}</td>
                  <td>{d.prenom} {d.nom} <span style={{ color: 'var(--text-faint)' }}>{d.matricule}</span></td>
                  <td>{fmt(d.total_du)}</td>
                  <td>{fmt(d.total_paye)}</td>
                  <td><strong>{fmt(d.reste_du)}</strong></td>
                  <td>{Number(d.reste_du) > 0 ? <span className="badge badge-coral">Impayé</span> : <span className="badge badge-teal">À jour</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OngletGrille() {
  const [tarifs, setTarifs] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [series, setSeries] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ niveau_id: '', serie_id: '', libelle: '', montant: '' });

  async function charger() {
    setErreur('');
    try {
      const d = await getGrilleTarifaire();
      setTarifs(d.tarifs || []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => {
    charger();
    getNiveaux().then((d) => setNiveaux(d.niveaux || [])).catch(() => {});
    getSeries().then((d) => setSeries(d.series || [])).catch(() => {});
  }, []);

  async function ajouter(e) {
    e.preventDefault();
    setErreur('');
    setMessage(null);
    try {
      const d = await ajouterTarif({
        niveau_id: form.niveau_id ? Number(form.niveau_id) : null,
        serie_id: form.serie_id ? Number(form.serie_id) : null,
        libelle: form.libelle,
        montant: Number(form.montant),
      });
      setMessage(`Tarif « ${d.tarif.libelle} » ajouté à la grille.`);
      setForm({ ...form, libelle: '', montant: '', serie_id: '' });
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimer(t) {
    if (!confirm(`Supprimer le tarif « ${t.libelle} » (${fmt(t.montant)}) ?`)) return;
    setErreur('');
    setMessage(null);
    try {
      await supprimerTarif(t.id);
      setMessage('Tarif supprimé.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div>
      <form className="formulaire" onSubmit={ajouter}>
        <fieldset>
          <legend>Ajouter un tarif</legend>
          <div className="form-grid">
            <label>Niveau
              <select value={form.niveau_id} onChange={(e) => setForm({ ...form, niveau_id: e.target.value })}>
                <option value="">Tous les niveaux</option>
                {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
              </select>
            </label>
            <label>Série
              <select value={form.serie_id} onChange={(e) => setForm({ ...form, serie_id: e.target.value })}>
                <option value="">Toutes les séries</option>
                {series.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>Libellé
              <input type="text" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex. Frais de scolarité annuels, Tenue, Transport…" required />
            </label>
            <label>Montant (FCFA)
              <input type="number" min="1" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} required />
            </label>
          </div>
          <button className="btn btn-primary" type="submit">Ajouter à la grille</button>
        </fieldset>
      </form>
      {message && <div className="alert alert-ok">{message}</div>}
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {tarifs.length === 0 ? (
        <div className="etat-vide">Aucun tarif pour l'année scolaire active.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Année</th><th>Niveau</th><th>Série</th><th>Libellé</th><th>Montant</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tarifs.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.annee_libelle}</td>
                  <td>{t.niveau_libelle || '—'}</td>
                  <td>{t.serie_libelle || '—'}</td>
                  <td><strong>{t.libelle}</strong></td>
                  <td>{fmt(t.montant)}</td>
                  <td><button className="btn btn-small btn-danger" onClick={() => supprimer(t)}>Supprimer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FinancePage() {
  const { session } = useAuth();
  const roles = session?.user?.roles || [];
  const [onglet, setOnglet] = useState('paiements');
  const [classes, setClasses] = useState([]);
  const peutGerer = roles.some((r) => ROLES_GESTION.includes(r));

  useEffect(() => {
    getClasses().then((d) => setClasses(d.classes || [])).catch(() => {});
  }, []);

  const onglets = useMemo(() => [
    { id: 'paiements', label: 'Paiements' },
    { id: 'dossiers', label: 'Dossiers' },
    { id: 'impayes', label: 'Impayés' },
    { id: 'grille', label: 'Grille tarifaire' },
  ], []);

  if (!peutGerer) {
    return (
      <main className="container"><h1>Accès refusé</h1><p>Vous n'avez pas les droits nécessaires pour consulter la comptabilité.</p></main>
    );
  }

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Finances</h1>
          <p>Comptabilité, encaissements et suivi des impayés</p>
        </div>
        <div className="filtres" style={{ margin: 0 }}>
          {onglets.map((o) => (
            <button
              key={o.id}
              className={`btn btn-secondary btn-small${onglet === o.id ? ' onglet-actif' : ''}`}
              onClick={() => setOnglet(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'paiements' && <OngletPaiements classes={classes} roles={roles} />}
      {onglet === 'dossiers' && <OngletDossiers classes={classes} />}
      {onglet === 'impayes' && <OngletImpayes classes={classes} />}
      {onglet === 'grille' && <OngletGrille />}
    </main>
  );
}
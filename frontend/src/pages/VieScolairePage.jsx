import { useState, useEffect, useMemo } from 'react';
import { getClasses, getEleves } from '../api.scolarite.js';
import { apiFetch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge } from '../components/ui.jsx';

const ROLES_GESTION = ['ADMIN', 'SECRETARIAT', 'CENSEUR'];

const LIBELLES_SANCTION = {
  avertissement: 'Avertissement',
  blame: 'Blâme',
  exclusion: 'Exclusion',
  conseil_discipline: 'Conseil de discipline',
};
const TONES_SANCTION = {
  avertissement: 'badge-amber',
  blame: 'badge-coral',
  exclusion: 'badge-ink',
  conseil_discipline: 'badge-teal',
};

function OngletAppel({ classes, classesChargees }) {
  const [classeId, setClasseId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eleves, setEleves] = useState([]);
  const [choix, setChoix] = useState({});
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  async function chargerEleves() {
    setErreur('');
    setMessage(null);
    if (!classeId) return;
    try {
      const d = await getEleves({ classe: classeId, statut: 'actif', limit: 200 });
      const liste = d.eleves || [];
      setEleves(liste);
      setChoix(Object.fromEntries(liste.map((e) => [e.id, null])));
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => {
    if (classesChargees && !classeId && classes.length > 0) setClasseId(String(classes[0].id));
  }, [classesChargees, classes, classeId]);

  useEffect(() => { if (classeId) chargerEleves(); }, [classeId]);

  async function enregistrer() {
    setChargement(true);
    setErreur('');
    setMessage(null);
    try {
      const items = eleves.map((e) => ({ eleve_id: Number(e.id), type: choix[e.id] }));
      const d = await apiFetch('/api/vie-scolaire/appel', {
        method: 'POST',
        body: { classe_id: Number(classeId), date, items },
        token: localStorage.getItem('ecoscol_token'),
      });
      setMessage(d.message);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }

  const nbSignales = eleves.filter((e) => choix[e.id]).length;

  return (
    <div>
      <div className="filtres">
        <select value={classeId} onChange={(e) => setClasseId(e.target.value)} aria-label="Classe">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de l'appel" />
        <span style={{ alignSelf: 'center', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          {nbSignales} signalement{nbSignales > 1 ? 's' : ''}
        </span>
      </div>
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {message && <div className="alert alert-ok">{message}</div>}
      {eleves.length === 0 ? (
        <div className="etat-vide">Choisissez une classe pour faire l'appel.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Matricule</th><th>Élève</th><th>Appel</th></tr>
            </thead>
            <tbody>
              {eleves.map((e) => (
                <tr key={e.id}>
                  <td><Badge tone="blue">{e.matricule}</Badge></td>
                  <td>{e.prenom} {e.nom}</td>
                  <td>
                    <select value={choix[e.id] ?? ''} onChange={(ev) => setChoix({ ...choix, [e.id]: ev.target.value || null })}>
                      <option value="">Présent</option>
                      <option value="absence">Absent</option>
                      <option value="retard">Retard</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {eleves.length > 0 && (
        <button className="btn btn-primary" onClick={enregistrer} disabled={chargement}>
          {chargement ? 'Enregistrement…' : 'Enregistrer l\'appel'}
        </button>
      )}
    </div>
  );
}

function OngletAbsences({ classes, roles }) {
  const [classeId, setClasseId] = useState('');
  const [absences, setAbsences] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const peutGerer = roles.some((r) => ROLES_GESTION.includes(r));

  async function charger(classe) {
    setErreur('');
    try {
      const qs = classe ? `?classe_id=${classe}` : '';
      const d = await apiFetch(`/api/vie-scolaire/absences${qs}`, { token: localStorage.getItem('ecoscol_token') });
      setAbsences(d.absences || []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => {
    if (classes.length > 0 && !classeId) { setClasseId(String(classes[0].id)); charger(classes[0].id); }
  }, [classes]);

  useEffect(() => { if (classeId) charger(classeId); }, [classeId]);

  async function justifier(a) {
    setErreur('');
    setMessage(null);
    try {
      await apiFetch(`/api/vie-scolaire/absences/${a.id}`, {
        method: 'PATCH',
        body: { justifiee: true, justificatif_note: 'Justifié (saisie censeur)' },
        token: localStorage.getItem('ecoscol_token'),
      });
      setMessage(`${a.prenom} ${a.nom} : signalement justifié.`);
      charger(classeId);
    } catch (e) {
      setErreur(e.message);
    }
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer le signalement de ${a.prenom} ${a.nom} (${a.date}) ?`)) return;
    setErreur('');
    try {
      await apiFetch(`/api/vie-scolaire/absences/${a.id}`, {
        method: 'DELETE',
        token: localStorage.getItem('ecoscol_token'),
      });
      setMessage('Signalement supprimé.');
      charger(classeId);
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <div>
      <div className="filtres">
        <select value={classeId} onChange={(e) => setClasseId(e.target.value)} aria-label="Classe">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <span style={{ alignSelf: 'center', color: 'var(--text-soft)', fontSize: '0.9rem' }}>{absences.length} signalement{absences.length > 1 ? 's' : ''}</span>
      </div>
      {erreur && <div className="alert alert-error">{erreur}</div>}
      {message && <div className="alert alert-ok">{message}</div>}
      {absences.length === 0 ? (
        <div className="etat-vide">Aucun signalement pour cette classe.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Élève</th><th>Type</th><th>Justification</th><th>Saisi par</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.date}</td>
                  <td>{a.prenom} {a.nom} <span style={{ color: 'var(--text-faint)' }}>{a.matricule}</span></td>
                  <td>{a.type === 'absence' ? <Badge tone="red">Absence</Badge> : <Badge tone="amber">Retard</Badge>}</td>
                  <td>{a.justifiee ? <span className="badge badge-teal">Justifié</span> : <span className="badge badge-slate">Non justifié</span>}</td>
                  <td>{a.saisi_prenom} {a.saisi_nom}</td>
                  <td>
                    {peutGerer && !a.justifiee && (
                      <button className="btn btn-small" onClick={() => justifier(a)}>Justifier</button>
                    )}
                    {peutGerer && (
                      <button className="btn btn-small btn-danger" style={{ marginLeft: 6 }} onClick={() => supprimer(a)}>Supprimer</button>
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

function OngletSanctions({ classes, roles }) {
  const [classeId, setClasseId] = useState('');
  const [sanctions, setSanctions] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ eleve_id: '', type: 'avertissement', motif: '', date: new Date().toISOString().slice(0, 10) });
  const [eleves, setEleves] = useState([]);
  const peutGerer = roles.some((r) => ROLES_GESTION.includes(r));

  async function charger(classe) {
    setErreur('');
    try {
      const qs = classe ? `?classe_id=${classe}` : '';
      const d = await apiFetch(`/api/vie-scolaire/sanctions${qs}`, { token: localStorage.getItem('ecoscol_token') });
      setSanctions(d.sanctions || []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => {
    if (classes.length > 0 && !classeId) { setClasseId(String(classes[0].id)); charger(classes[0].id); }
  }, [classes]);

  useEffect(() => {
    if (classeId) {
      charger(classeId);
      getEleves({ classe: classeId, statut: 'actif', limit: 200 }).then((d) => setEleves(d.eleves || [])).catch(() => {});
    }
  }, [classeId]);

  async function ajouter(e) {
    e.preventDefault();
    setErreur('');
    setMessage(null);
    try {
      const d = await apiFetch('/api/vie-scolaire/sanctions', {
        method: 'POST',
        body: { eleve_id: Number(form.eleve_id), type: form.type, motif: form.motif, date: form.date },
        token: localStorage.getItem('ecoscol_token'),
      });
      setMessage(d.message);
      setForm({ ...form, eleve_id: '', motif: '' });
      charger(classeId);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimer(s) {
    if (!confirm(`Supprimer la sanction de ${s.prenom} ${s.nom} ?`)) return;
    setErreur('');
    try {
      await apiFetch(`/api/vie-scolaire/sanctions/${s.id}`, { method: 'DELETE', token: localStorage.getItem('ecoscol_token') });
      setMessage('Sanction supprimée.');
      charger(classeId);
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div>
      <div className="filtres">
        <select value={classeId} onChange={(e) => setClasseId(e.target.value)} aria-label="Classe">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </div>
      {message && <div className="alert alert-ok">{message}</div>}
      {erreur && <div className="alert alert-error">{erreur}</div>}

      {peutGerer && (
        <form className="formulaire" onSubmit={ajouter}>
          <fieldset>
            <legend>Ajouter une sanction</legend>
            <div className="form-grid">
              <label>Élève
                <select value={form.eleve_id} onChange={(e) => setForm({ ...form, eleve_id: e.target.value })} required>
                  <option value="">Choisir un élève…</option>
                  {eleves.map((el) => <option key={el.id} value={el.id}>{el.prenom} {el.nom}</option>)}
                </select>
              </label>
              <label>Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(LIBELLES_SANCTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label>Date
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Motif
                <input type="text" placeholder="Ex. : retards répétés, perturbation en classe…" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} required />
              </label>
            </div>
            <button className="btn btn-primary" type="submit">Enregistrer la sanction</button>
          </fieldset>
        </form>
      )}

      {sanctions.length === 0 ? (
        <div className="etat-vide">Aucune sanction pour cette classe.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Élève</th><th>Sanction</th><th>Motif</th><th>Saisi par</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {sanctions.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.date}</td>
                  <td>{s.prenom} {s.nom} <span style={{ color: 'var(--text-faint)' }}>{s.matricule}</span></td>
                  <td><span className={`badge ${TONES_SANCTION[s.type] || 'badge-slate'}`}>{LIBELLES_SANCTION[s.type] || s.type}</span></td>
                  <td>{s.motif}</td>
                  <td>{s.saisi_prenom} {s.saisi_nom}</td>
                  <td>{peutGerer && <button className="btn btn-small btn-danger" onClick={() => supprimer(s)}>Supprimer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function VieScolairePage() {
  const { session } = useAuth();
  const [onglet, setOnglet] = useState('appel');
  const [classes, setClasses] = useState([]);
  const [classesChargees, setClassesChargees] = useState(false);
  const roles = session?.user?.roles || [];

  useEffect(() => {
    getClasses().then((d) => { setClasses(d.classes || []); setClassesChargees(true); }).catch(() => setClassesChargees(true));
  }, []);

  const onglets = useMemo(() => [
    { id: 'appel', label: 'Appel' },
    { id: 'absences', label: 'Absences & retards' },
    { id: 'sanctions', label: 'Sanctions' },
  ], []);

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Vie scolaire</h1>
          <p>Appel, absences, retards et sanctions</p>
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

      {onglet === 'appel' && <OngletAppel classes={classes} classesChargees={classesChargees} />}
      {onglet === 'absences' && <OngletAbsences classes={classes} roles={roles} />}
      {onglet === 'sanctions' && <OngletSanctions classes={classes} roles={roles} />}
    </main>
  );
}
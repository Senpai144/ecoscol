import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getClasses, creerClasse, getNiveaux, getSeries, getAnneesScolaires } from '../api.scolarite.js';

export default function ClassesPage() {
  const [classesData, setClassesData] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [series, setSeries] = useState([]);
  const [annees, setAnnees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    annee_scolaire_id: '', niveau_id: '', serie_id: '', libelle: '', capacite: 40, salle: '',
  });

  async function charger() {
    setChargement(true);
    try {
      const [c, n, s, a] = await Promise.all([
        getClasses(), getNiveaux(), getSeries(), getAnneesScolaires(),
      ]);
      setClassesData(c.classes || []);
      setNiveaux(n.niveaux || []);
      setSeries(s.series || []);
      setAnnees(a.anneesScolaires || []);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => { charger(); }, []);

  function set(champ) {
    return (e) => setForm({ ...form, [champ]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur(null);
    if (!form.annee_scolaire_id || !form.niveau_id || !form.libelle.trim()) {
      setErreur('Année scolaire, niveau et libellé sont obligatoires.');
      return;
    }
    try {
      await creerClasse({
        annee_scolaire_id: parseInt(form.annee_scolaire_id, 10),
        niveau_id: parseInt(form.niveau_id, 10),
        serie_id: form.serie_id ? parseInt(form.serie_id, 10) : null,
        libelle: form.libelle.trim(),
        capacite: parseInt(form.capacite, 10) || 40,
        salle: form.salle || null,
      });
      setShowForm(false);
      setForm({ annee_scolaire_id: '', niveau_id: '', serie_id: '', libelle: '', capacite: 40, salle: '' });
      await charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  const anneeActive = annees.find((a) => a.active);

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Classes</h1>
          <p>Année scolaire active : <strong>{anneeActive?.libelle || '—'}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Fermer' : '+ Nouvelle classe'}
        </button>
      </div>

      {erreur && <div className="alert alert-error">{erreur}</div>}

      {showForm && (
        <form className="formulaire" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Année scolaire *
              <select value={form.annee_scolaire_id} onChange={set('annee_scolaire_id')}>
                <option value="">— Choisir —</option>
                {annees.map((a) => (
                  <option key={a.id} value={a.id}>{a.libelle}{a.active ? ' (active)' : ''}</option>
                ))}
              </select>
            </label>
            <label>
              Niveau *
              <select value={form.niveau_id} onChange={set('niveau_id')}>
                <option value="">— Choisir —</option>
                {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
              </select>
            </label>
            <label>
              Série
              <select value={form.serie_id} onChange={set('serie_id')}>
                <option value="">— Aucune —</option>
                {series.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
              </select>
            </label>
            <label>
              Libellé de la classe *
              <input type="text" value={form.libelle} onChange={set('libelle')} placeholder="Ex. Terminale C" />
            </label>
            <label>
              Capacité
              <input type="number" min="1" max="200" value={form.capacite} onChange={set('capacite')} />
            </label>
            <label>
              Salle
              <input type="text" value={form.salle} onChange={set('salle')} placeholder="Ex. Salle 1" />
            </label>
          </div>
          <button type="submit" className="btn btn-primary">Créer la classe</button>
        </form>
      )}

      {chargement ? (
        <p className="status status-pending">Chargement…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Classe</th>
                <th>Niveau</th>
                <th>Série</th>
                <th>Année</th>
                <th>Effectif / Capacité</th>
                <th>Salle</th>
              </tr>
            </thead>
            <tbody>
              {classesData.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.libelle}</strong></td>
                  <td>{c.niveau_libelle}</td>
                  <td>{c.serie_libelle || '—'}</td>
                  <td>{c.annee_libelle}</td>
                  <td>
                    <span className={c.effectif >= c.capacite ? 'text-danger' : ''}>
                      {c.effectif} / {c.capacite}
                    </span>
                  </td>
                  <td>{c.salle || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
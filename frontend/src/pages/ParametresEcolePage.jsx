import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getParametresEcole, updateParametresEcole, uploadLogoEtablissement } from '../api.js';

export default function ParametresEcolePage() {
  const { session } = useAuth();
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState('');
  const [logoDirty, setLogoDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    getParametresEcole(session?.token)
      .then((j) => {
        const e = j.etablissement;
        setForm({
          nom: e?.nom ?? '',
          adresse: e?.adresse ?? '',
          telephone: e?.telephone ?? '',
          email: e?.email ?? '',
          slogan: e?.slogan ?? '',
          couleur: e?.couleur_principale ?? '#2B8C7E',
        });
        setLogo(e?.logo_base64 ?? '');
        setLogoDirty(false);
      })
      .catch((e) => setErreur(e.message || 'Impossible de charger les paramètres.'));
  }, []);

  function importerLogo(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      setLogo(lecteur.result);
      setLogoDirty(true);
    };
    lecteur.readAsDataURL(fichier);
  }

  async function enregistrer(e) {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    setMessage('');
    try {
      const j = await updateParametresEcole(
        {
          nom: form.nom,
          adresse: form.adresse,
          telephone: form.telephone,
          email_contact: form.email,
          slogan: form.slogan,
          couleur_principale: form.couleur,
        },
        session?.token
      );
      setForm({
        nom: j.etablissement.nom,
        adresse: j.etablissement.adresse ?? '',
        telephone: j.etablissement.telephone ?? '',
        email: j.etablissement.email ?? '',
        slogan: j.etablissement.slogan ?? '',
        couleur: j.etablissement.couleur_principale ?? '#2B8C7E',
      });
      setLogo(j.etablissement.logo_base64 ?? '');
      setLogoDirty(false);
      setMessage('Paramètres de l\'établissement enregistrés. Le reçu est mis à jour immédiatement.');
    } catch (err) {
      setErreur(err.message || 'Échec de l\'enregistrement.');
    } finally {
      setChargement(false);
    }
  }

  async function uploaderLogo() {
    if (!logoInputRef.current?.files?.[0]) return;
    setChargement(true);
    setErreur('');
    try {
      const data = new FormData();
      data.append('logo', logoInputRef.current.files[0]);
      const j = await uploadLogoEtablissement(data, session?.token);
      setLogo(j.etablissement.logo_base64 ?? '');
      setForm({ ...form, couleur: j.etablissement.couleur_principale ?? form.couleur });
      setMessage('Logo mis à jour.');
    } catch (err) {
      setErreur(err.message || 'Échec du téléversement du logo.');
    } finally {
      setChargement(false);
    }
  }

  if (!form) {
    return (
      <main className="container">
        <div className="etat-vide">Chargement des paramètres…</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Paramètres de l'établissement</h1>
          <p>Identité, coordonnées et logo utilisés sur les reçus et documents officiels.</p>
        </div>
      </div>

      {message && <div className="alert alert-ok">{message}</div>}
      {erreur && <div className="alert alert-error">{erreur}</div>}

      <form onSubmit={enregistrer} className="form-grid" style={{ maxWidth: 720 }}>
        <div className="field-label">
          <label>Logo de l'établissement</label>
          <div className="param-logo-zone">
            <div className="param-logo-preview">
              {logo ? (
                <img src={logo} alt="Logo de l'établissement" />
              ) : (
                <span className="mono" style={{ color: 'var(--text-faint)' }}>Aucun logo</span>
              )}
            </div>
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={importerLogo}
                aria-label="Choisir le logo de l'établissement"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-light btn-small"
                onClick={() => logoInputRef.current?.click()}
              >
                {logo ? 'Changer le logo' : 'Importer un logo'}
              </button>
              {logoDirty && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  style={{ marginLeft: 8 }}
                  onClick={() => { setLogo(''); setLogoDirty(true); }}
                >
                  Retirer
                </button>
              )}
              <p className="param-logo-aide">
                PNG, JPG ou SVG — le logo apparaît en haut du reçu de paiement.
              </p>
            </div>
          </div>
        </div>

        <label>
          Nom de l'établissement
          <input
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            placeholder="Ex. École Pilote ECOSCOL"
            required
          />
        </label>
        <label>
          Adresse
          <input
            value={form.adresse}
            onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            placeholder="Ex. Dakar, Sénégal"
          />
        </label>
        <label>
          Téléphone
          <input
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            placeholder="Ex. +221 33 000 00 00"
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Ex. contact@ecolepilote.sn"
          />
        </label>
        <label>
          Slogan (facultatif)
          <input
            value={form.slogan}
            onChange={(e) => setForm({ ...form, slogan: e.target.value })}
            placeholder="Ex. Savoir, travail, réussite"
          />
        </label>
        <label>
          Couleur principale
          <div className="auth-couleur-ligne">
            <input
              type="color"
              value={form.couleur}
              onChange={(e) => setForm({ ...form, couleur: e.target.value })}
              aria-label="Couleur principale"
            />
            <span className="mono">{form.couleur}</span>
          </div>
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={chargement}>
            {chargement ? 'Enregistrement…' : 'Enregistrer les paramètres'}
          </button>
        </div>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--line)' }} />

        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Logo de l'établissement</h3>
        <div className="param-logo-zone">
          <div className="param-logo-preview">
            {logo ? (
              <img src={logo} alt="Logo de l'établissement" />
            ) : (
              <span className="mono" style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>Aucun logo</span>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={importerLogo}
            aria-label="Choisir le logo de l'établissement"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-light btn-small"
            onClick={() => logoInputRef.current?.click()}
            disabled={chargement}
          >
            {logo ? 'Changer le logo' : 'Importer un logo'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={uploaderLogo}
            disabled={chargement || !logoDirty}
          >
            Appliquer le logo
          </button>
          {logoDirty && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              style={{ marginLeft: 8 }}
              onClick={() => { setLogo(''); setLogoDirty(true); }}
            >
              Annuler
            </button>
          )}
          <p className="param-logo-aide">
            PNG, JPG ou SVG — le logo apparaît en haut du reçu de paiement et sur la page de connexion.
          </p>
        </div>

        <style>{`
          .auth-couleur-ligne { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
          .auth-couleur-ligne input[type="color"] { width: 52px; height: 34px; border: none; border-radius: 8px; cursor: pointer; padding: 0; background: none; }
        `}</style>
      </form>

      <style>{`
        .param-logo-zone { display: flex; align-items: center; gap: 14px; }
        .param-logo-preview {
          width: 92px; height: 92px; border-radius: 12px; border: 1.5px dashed var(--line-strong);
          background: var(--paper); display: flex; align-items: center; justify-content: center;
          overflow: hidden; padding: 4px;
        }
        .param-logo-preview img { width: 100%; height: 100%; object-fit: contain; }
        .param-logo-aide { font-size: 0.78rem; color: var(--text-faint); margin-top: 6px; font-weight: 400; }
        .field-label { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 600; font-size: 0.88rem; color: var(--ink-soft); }
      `}</style>
    </main>
  );
}
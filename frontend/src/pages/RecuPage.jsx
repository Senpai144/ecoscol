import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getRecuPortail } from '../api.portail.js';
import './recu.css';

const LIBELLES_MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', mobile_money: 'Mobile Money' };
const FALLBACK_ECOLE = { nom: 'ECOSCOL — Collège & Lycée', adresse: '12 Avenue de l\'Indépendance, Dakar, Sénégal', telephone: 'Tél. +221 33 000 00 00 · contact@ecoscol.sn' };

function nbEnLettres(n) {
  if (n === 0) return 'zéro';
  const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function sousCent(k) {
    if (k < 20) return unites[k];
    const d = Math.floor(k / 10);
    const u = k % 10;
    if (d === 7) return u === 0 ? 'soixante-dix' : u === 1 ? 'soixante-et-onze' : 'soixante-' + unites[10 + u];
    if (d === 9) return u === 0 ? 'quatre-vingt-dix' : 'quatre-vingt-' + unites[10 + u];
    if (d === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + unites[u];
    let s = dizaines[d];
    if (u === 1) s += '-et-un';
    else if (u > 0) s += '-' + unites[u];
    return s;
  }
  function sousMille(m) {
    const c = Math.floor(m / 100);
    const r = m % 100;
    let s = '';
    if (c) s += c === 1 ? 'cent' : unites[c] + '-cent';
    if (r) s += s ? ' ' + sousCent(r) : sousCent(r);
    else if (c > 1 && !r) s += 's';
    return s;
  }
  const millions = Math.floor(n / 1000000);
  const milliers = Math.floor((n % 1000000) / 1000);
  const reste = n % 1000;
  let s = '';
  if (millions) s += millions === 1 ? 'un million' : sousMille(millions) + ' millions';
  if (milliers) s += (s ? ' ' : '') + (milliers === 1 ? 'mille' : sousMille(milliers) + ' mille');
  if (reste) s += (s ? ' ' : '') + sousMille(reste);
  return s || 'zéro';
}

function formatMontant(n) {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default function RecuPage() {
  const { paiementId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [lignes, setLignes] = useState([]);
  const [logo, setLogo] = useState('');
  const [totaux, setTotaux] = useState({ sousTotal: 0, total: 0 });
  const itemsRef = useRef(null);
  const discountRef = useRef(null);

  useEffect(() => {
    if (!session?.token) {
      navigate('/login');
      return;
    }
    getRecuPortail(paiementId)
      .then((d) => {
        setDonnees(d);
        setLignes([{
          designation: d.paiement.motif || 'Frais de scolarité',
          sub: d.echeancier?.libelle ?? (d.eleve?.classe_libelle || ''),
          montant: formatMontant(d.paiement.montant),
        }]);
      })
      .catch((e) => setErreur(e.message));
  }, [paiementId]);

  function recalcTotals() {
    if (!itemsRef.current) return;
    let sousTotal = 0;
    itemsRef.current.querySelectorAll('tr').forEach((row) => {
      const cellule = row.querySelector('td.num');
      if (cellule) sousTotal += parseInt(String(cellule.textContent).replace(/[^\d-]/g, ''), 10) || 0;
    });
    const remise = parseInt(String(discountRef.current?.textContent ?? '0').replace(/[^\d-]/g, ''), 10) || 0;
    const total = Math.max(sousTotal - remise, 0);
    setTotaux({ sousTotal, total });
  }

  useEffect(() => {
    if (!donnees) return;
    recalcTotals();
    const zone = itemsRef.current;
    const maj = () => recalcTotals();
    zone?.addEventListener('input', maj);
    discountRef.current?.addEventListener('input', maj);
    return () => {
      zone?.removeEventListener('input', maj);
      discountRef.current?.removeEventListener('input', maj);
    };
  }, [donnees, lignes.length]);

  if (erreur) {
    return <main className="recu-page"><div className="recu-error">{erreur} — <button onClick={() => navigate('/portail')}>Retour au portail</button></div></main>;
  }
  if (!donnees) {
    return <main className="recu-page"><div className="recu-error">Chargement du reçu…</div></main>;
  }

  const { paiement, eleve, echeancier, ecole, payePar } = donnees;
  const ecoleInfo = ecole ?? FALLBACK_ECOLE;
  const modeActif = LIBELLES_MODES[paiement.mode] ?? paiement.mode;
  const dateEmission = new Date(paiement.date_paiement + (String(paiement.date_paiement).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR');

  function ajouterLigne() {
    setLignes([...lignes, { designation: 'Nouvelle ligne', sub: '', montant: '0' }]);
  }

  function retirerLigne(index) {
    setLignes(lignes.filter((_, i) => i !== index));
  }

  function importerLogo(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => setLogo(lecteur.result);
    lecteur.readAsDataURL(fichier);
  }

  return (
    <main className="recu-page">
      <div className="toolbar">
        <div>
          <div className="toolbar-title">Reçu de paiement — Scolarité</div>
          <div className="toolbar-hint">Cliquez sur le logo ou sur n'importe quel champ pour le personnaliser.</div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" type="button" onClick={() => window.location.reload()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
            Réinitialiser
          </button>
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimer / Enregistrer en PDF
          </button>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-header">
          <div className="school-block">
            <div className={`logo-upload${logo ? ' has-logo' : ''}`}>
              {logo ? (
                <img src={logo} alt="Logo de l'établissement" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
                  <span className="logo-hint">LOGO</span>
                </>
              )}
              <input type="file" accept="image/*" aria-label="Importer le logo de l'établissement" onChange={importerLogo} />
            </div>
            <div className="school-info">
              <div className="school-name" contentEditable suppressContentEditableWarning>{ecoleInfo.nom}</div>
              <div className="school-meta">
                <div contentEditable suppressContentEditableWarning>
                  {ecoleInfo.adresse}{ecoleInfo.telephone ? ` · ${ecoleInfo.telephone}` : ''}
                </div>
                {ecoleInfo.email && <div contentEditable suppressContentEditableWarning>{ecoleInfo.email}</div>}
              </div>
            </div>
          </div>
          <div className="receipt-tag">
            <div className="receipt-tag-label">Reçu de paiement</div>
            <div className="receipt-tag-title mono">N° {paiement.numero_recu}</div>
            <div className="receipt-tag-num">Date d'émission : {dateEmission}</div>
          </div>
        </div>

        <div className="meta-grid">
          <div className="meta-field">
            <label>Nom de l'élève</label>
            <div contentEditable suppressContentEditableWarning>{eleve ? `${eleve.prenom} ${eleve.nom}` : '—'}</div>
          </div>
          <div className="meta-field">
            <label>Classe</label>
            <div contentEditable suppressContentEditableWarning>{eleve?.classe_libelle || '—'}</div>
          </div>
          <div className="meta-field">
            <label>Année scolaire</label>
            <div contentEditable suppressContentEditableWarning>{echeancier?.annee_libelle || '—'}</div>
          </div>
          <div className="meta-field">
            <label>Matricule élève</label>
            <div contentEditable suppressContentEditableWarning>{eleve?.matricule || '—'}</div>
          </div>
          <div className="meta-field">
            <label>Période concernée</label>
            <div contentEditable suppressContentEditableWarning>{paiement.motif || '—'}</div>
          </div>
          <div className="meta-field">
            <label>Payé par</label>
            <div contentEditable suppressContentEditableWarning>{payePar ? `${payePar} (tuteur)` : '—'}</div>
          </div>
        </div>

        <div className="items">
          <table>
            <thead>
              <tr>
                <th style={{ width: '60%' }}>Désignation</th>
                <th className="num" style={{ width: '40%' }}>Montant (FCFA)</th>
              </tr>
            </thead>
            <tbody ref={itemsRef}>
              {lignes.map((ligne, i) => (
                <tr key={i}>
                  <td>
                    <div className="recu-td-ligne">
                      <div contentEditable suppressContentEditableWarning style={{ flex: 1 }}>{ligne.designation}</div>
                      <button className="row-remove" type="button" aria-label="Supprimer la ligne" onClick={() => retirerLigne(i)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    {ligne.sub && <div className="item-desc-sub" contentEditable suppressContentEditableWarning>{ligne.sub}</div>}
                  </td>
                  <td className="num" contentEditable suppressContentEditableWarning>{ligne.montant}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="add-row" type="button" onClick={ajouterLigne}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter une ligne
          </button>

          <div className="totals">
            <div className="total-row">
              <span>Sous-total</span>
              <span className="num">{formatMontant(totaux.sousTotal)}</span>
            </div>
            <div className="total-row">
              <span>Remise éventuelle</span>
              <span className="num" contentEditable suppressContentEditableWarning ref={discountRef}>0</span>
            </div>
            <div className="total-row grand">
              <span>Total payé</span>
              <span className="num">{formatMontant(totaux.total)} FCFA</span>
            </div>
          </div>

          <div className="amount-words">
            Arrêté le présent reçu à la somme de{' '}
            <strong>{nbEnLettres(totaux.total)} francs CFA</strong>.
          </div>
        </div>

        <div className="receipt-footer">
          <div className="payment-mode">
            <label>Mode de paiement</label>
            <div className="mode-pills">
              {Object.values(LIBELLES_MODES).map((libelle) => (
                <button
                  key={libelle}
                  type="button"
                  className={`mode-pill${libelle === modeActif ? ' active' : ''}`}
                  disabled={!paiement.recu_annule}
                >
                  {libelle}
                </button>
              ))}
            </div>
            {paiement.transaction_ref && (
              <div className="payment-ref mono">Réf. transaction : {paiement.transaction_ref}</div>
            )}
          </div>
          <div className="signature-block">
            <div className="signature-line"></div>
            <div className="signature-label">Signature &amp; cachet de l'établissement</div>
          </div>
        </div>

        <div className="sheet-bottom-note" contentEditable suppressContentEditableWarning>
          Ce reçu fait foi de paiement. Merci de le conserver pour toute réclamation ultérieure.
        </div>
      </div>
    </main>
  );
}
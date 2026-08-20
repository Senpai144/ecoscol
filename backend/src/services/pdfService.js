import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DOCUMENTS_DIR = path.resolve(__dirname, '..', '..', 'documents');

export function garantirDossierDocuments() {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

export function cheminDocument(filename) {
  return path.join(DOCUMENTS_DIR, filename);
}

function chargerImage(ecole, field) {
  const p = ecole?.[field];
  if (!p || !fs.existsSync(p)) return null;
  return p;
}

export async function genererCertificatScolarite({ ecole, eleve, classe, annee, identifiant }) {
  garantirDossierDocuments();
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Certificat de scolarité - ${eleve.matricule}` } });

  const nomFichier = `certificat_${identifiant}.pdf`;
  const chemin = cheminDocument(nomFichier);
  const stream = fs.createWriteStream(chemin);
  doc.pipe(stream);

  const logoPath = chargerImage(ecole, 'logo_path');

  const enTete = () => {
    if (logoPath) {
      try { doc.image(logoPath, 50, 45, { width: 80 }); } catch { /* image absente */ }
    }
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a5276')
      .text(ecole.nom, 145, 50, { align: 'center', width: 400 });
    if (ecole.slogan) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#2c3e50')
        .text(ecole.slogan, 145, 75, { align: 'center', width: 400 });
    }
    doc.fontSize(9).font('Helvetica').fillColor('#555566')
      .text([ecole.adresse, ecole.telephone, ecole.email].filter(Boolean).join('  •  '), 145, 95, { align: 'center', width: 400 });
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#1a5276').lineWidth(1.5).stroke();
  };

  const piedPage = () => {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#777888')
      .text(`Document généré électroniquement le ${new Date().toLocaleDateString('fr-FR')}`, 50, 785, { align: 'center', width: 500 });
  };

  doc.on('pageAdded', () => { enTete(); });
  enTete();

  doc.moveDown(6);
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#2c3e50').text('CERTIFICAT DE SCOLARITÉ', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica').fillColor('#2c3e50')
    .text('Le soussigné atteste que l\'élève :', { align: 'center' });

  doc.moveDown(2);
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a5276')
    .text(`${eleve.prenom} ${eleve.nom}`, { align: 'center' });

  doc.moveDown(2);
  const lignes = [
    `Né(e) le : ${new Date(eleve.date_naissance).toLocaleDateString('fr-FR')}`,
    `Matricule : ${eleve.matricule}`,
    `Classe : ${classe?.libelle || '—'}`,
    `Année scolaire : ${annee?.libelle || '—'}`,
  ];
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica').fillColor('#2c3e50')
    .text(lignes.join('\n'), { align: 'center', lineGap: 8 });

  doc.moveDown(4);
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fontSize(12).font('Helvetica').text(`Fait le ${dateStr}`, 400, 640);

  const signaturePath = chargerImage(ecole, 'signature_path');
  if (signaturePath) {
    try { doc.image(signaturePath, 400, 655, { width: 120 }); } catch { /* absente */ }
  }
  doc.fontSize(11).font('Helvetica-Bold').text('Le Directeur', 400, 700);

  const cachetPath = chargerImage(ecole, 'cachet_path');
  if (cachetPath) {
    try { doc.image(cachetPath, 120, 630, { width: 140 }); } catch { /* absente */ }
  }

  piedPage();
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ nomFichier, chemin }));
    stream.on('error', reject);
  });
}

export async function genererRecu({ ecole, eleve, classe, paiement, echeancier }) {
  garantirDossierDocuments();
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Reçu ${paiement.numero_recu} - ${eleve.nom}` } });

  const nomFichier = `recu_${paiement.numero_recu}.pdf`;
  const chemin = cheminDocument(nomFichier);
  const stream = fs.createWriteStream(chemin);
  doc.pipe(stream);

  const logoPath = chargerImage(ecole, 'logo_path');
  const enTete = () => {
    if (logoPath) {
      try { doc.image(logoPath, 50, 45, { width: 80 }); } catch { /* image absente */ }
    }
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a5276')
      .text(ecole.nom, 145, 50, { align: 'center', width: 400 });
    if (ecole.slogan) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#2c3e50')
        .text(ecole.slogan, 145, 75, { align: 'center', width: 400 });
    }
    doc.fontSize(9).font('Helvetica').fillColor('#555566')
      .text([ecole.adresse, ecole.telephone, ecole.email].filter(Boolean).join('  •  '), 145, 95, { align: 'center', width: 400 });
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#1a5276').lineWidth(1.5).stroke();
  };

  const piedPage = () => {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#777888')
      .text(`Document généré électroniquement le ${new Date().toLocaleDateString('fr-FR')}`, 50, 785, { align: 'center', width: 500 });
  };

  doc.on('pageAdded', () => { enTete(); });
  enTete();

  doc.moveDown(6);
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#2c3e50').text('REÇU DE PAIEMENT', { align: 'center' });
  doc.moveDown(1);

  const dateStr = new Date(paiement.date_paiement).toLocaleDateString('fr-FR');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a5276')
    .text(`N° ${paiement.numero_recu}`, { align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor('#2c3e50')
    .text(`Date : ${dateStr}`, { align: 'right' });

  doc.moveDown(2);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c3e50').text('Reçu de :');
  doc.moveDown(0.5);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a5276')
    .text(`${eleve.prenom} ${eleve.nom}`);
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#2c3e50')
    .text(`Matricule : ${eleve.matricule}    •    Classe : ${classe?.libelle || '—'}`);

  doc.moveDown(2);
  const libelleEcheance = echeancier?.libelle ?? null;
  doc.fontSize(11).font('Helvetica').fillColor('#2c3e50')
    .text(`Motif : ${paiement.motif}${libelleEcheance ? ` (${libelleEcheance})` : ''}`);
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica')
    .text(`Mode de paiement : ${paiement.mode === 'especes' ? 'Espèces' : paiement.mode === 'cheque' ? 'Chèque' : paiement.mode === 'mobile_money' ? 'Mobile Money' : 'Virement'}${paiement.transaction_ref ? `    •    Réf. : ${paiement.transaction_ref}` : ''}`);
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').text(`Comptabilisé par : ${paiement.saisie_par_nom || '—'}`);

  doc.moveDown(3);
  const montant = Number(paiement.montant).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
  doc.rect(50, doc.y, 495, 56).fill('#eef3fb').strokeColor('#1a5276').lineWidth(0.5).stroke();
  doc.fillColor('#1a5276').fontSize(12).font('Helvetica-Bold')
    .text('MONTANT PAYÉ', 65, doc.y + 8);
  doc.fillColor('#1a5276').fontSize(22).font('Helvetica-Bold')
    .text(`${montant} FCFA`, 65, doc.y + 22);

  doc.moveDown(5);
  const dateEnLettres = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fontSize(12).font('Helvetica').text(`Fait le ${dateEnLettres}`, 400, 640);

  const signaturePath = chargerImage(ecole, 'signature_path');
  if (signaturePath) {
    try { doc.image(signaturePath, 400, 655, { width: 120 }); } catch { /* absente */ }
  }
  doc.fontSize(11).font('Helvetica-Bold').text('Le Directeur', 400, 700);

  const cachetPath = chargerImage(ecole, 'cachet_path');
  if (cachetPath) {
    try { doc.image(cachetPath, 120, 630, { width: 140 }); } catch { /* absente */ }
  }

  piedPage();
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ nomFichier, chemin }));
    stream.on('error', reject);
  });
}

export function cheminAbsolu(nomFichier) {
  return path.join(DOCUMENTS_DIR, path.basename(nomFichier));
}

function mentionPourMoyenne(moyenne) {
  if (moyenne >= 16) return 'Très bien';
  if (moyenne >= 14) return 'Bien';
  if (moyenne >= 12) return 'Assez bien';
  if (moyenne >= 10) return 'Passable';
  return 'Insuffisant';
}

// Bulletin de notes: moyennes par matière, moyenne générale, rang, mention
export async function genererBulletin({
  ecole, eleve, classe, annee, sequence,
  moyennesParMatiere, moyenneGenerale, rang, TOTAL_ELEVES,
  decision = null,
}) {
  garantirDossierDocuments();
  moyennesParMatiere.forEach((m) => { m.moyenne = Number(m.moyenne); });
  moyenneGenerale = Number(moyenneGenerale) || 0;
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Bulletin ${eleve.prenom} ${eleve.nom}` } });
  const identifiantDoc = `BUL-${eleve.matricule}-${sequence.id}`;
  const nomFichier = `bulletin_${identifiantDoc}.pdf`;
  const chemin = cheminDocument(nomFichier);
  const stream = fs.createWriteStream(chemin);
  doc.pipe(stream);

  const logoPath = chargerImage(ecole, 'logo_path');

  const enTete = () => {
    if (logoPath) {
      try { doc.image(logoPath, 50, 45, { width: 80 }); } catch { /* absente */ }
    }
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#1a5276')
      .text(ecole.nom, 140, 50, { align: 'center', width: 410 });
    if (ecole.adresse) {
      doc.fontSize(9).font('Helvetica').fillColor('#555566')
        .text(ecole.adresse, 140, 72, { align: 'center', width: 410 });
    }
    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#1a5276').lineWidth(1.5).stroke();
  };

  doc.on('pageAdded', () => { enTete(); });
  enTete();

  doc.moveDown(5);
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#2c3e50').text('BULLETIN DE NOTES', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#555555')
    .text(sequence.libelle, { align: 'center' });

  doc.moveDown(1.5);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a5276')
    .text(`${eleve.prenom} ${eleve.nom}`, { align: 'left' });
  doc.fontSize(10).font('Helvetica').fillColor('#2c3e50')
    .text([
      `Matricule : ${eleve.matricule}`,
      `Classe : ${classe?.libelle || '—'}${classe?.serie_libelle ? ` (Série ${classe.serie_libelle})` : ''}`,
      `Année scolaire : ${annee?.libelle || '—'}`,
    ].join('    •    '));

  doc.moveDown(1.2);

  // Tableau des moyennes par matière
  const startY = doc.y;
  const colMatiere = 60;
  const colMoyenne = 270;
  const colMention = 420;
  const colWidth = [colMatiere, 130, 90, 90];

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
  doc.rect(50, startY, 180, 22).fill('#1a5276');
  doc.rect(230, startY, 120, 22).fill('#1f618d');
  doc.rect(350, startY, 100, 22).fill('#1f618d');
  doc.rect(450, startY, 95, 22).fill('#1f618d');
  doc.fill('#ffffff')
    .text('Matière', 60, startY + 6)
    .text('Moyenne /20', 235, startY + 6)
    .text('Coeff.', 375, startY + 6)
    .text('Mention', 460, startY + 6);

  let y = startY + 22;
  doc.font('Helvetica').fillColor('#2c3e50').fontSize(10);
  for (const m of moyennesParMatiere) {
    if (y > 740) {
      doc.addPage();
      y = 130;
      enTete();
    }
    doc.rect(50, y, 495, 19).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.text(m.matiere, 60, y + 5);
    doc.fillColor('#1a5276').font('Helvetica-Bold').text(m.moyenne.toFixed(2), 235, y + 5);
    doc.fillColor('#555555').font('Helvetica').text(String(m.coefficient), 375, y + 5);
    doc.fillColor('#2c3e50').text(mentionPourMoyenne(m.moyenne), 460, y + 5);
    y += 19;
  }

  y += 12;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a5276')
    .text('MOYENNE GÉNÉRALE', 60, y);
  doc.fillColor('#28b463').fontSize(14)
    .text(moyenneGenerale.toFixed(2) + ' / 20', 300, y);
  doc.fillColor('#2c3e50').fontSize(10).font('Helvetica')
    .text(`Rang : ${rang}${TOTAL_ELEVES ? ` / ${TOTAL_ELEVES}` : ''}`, 380, y + 2);
  y += 26;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a5276')
    .text('MENTION', 60, y);
  doc.fillColor('#2c3e50').font('Helvetica').fontSize(10)
    .text(mentionPourMoyenne(moyenneGenerale), 140, y + 2);
  y += 22;

  if (decision) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#c0392b')
      .text(`Décision du conseil : ${decision}`, 60, y);
  }

  // Signatures
  doc.moveDown(4);
  const signY = 680;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50');
  doc.text("Le Chef d'établissement", 60, signY);
  doc.text('Le Censeur', 300, signY);

  const signaturePath = chargerImage(ecole, 'signature_path');
  if (signaturePath) {
    try { doc.image(signaturePath, 60, 690, { width: 120 }); } catch { /* absente */ }
  }
  const cachetPath = chargerImage(ecole, 'cachet_path');
  if (cachetPath) {
    try { doc.image(cachetPath, 380, 690, { width: 140 }); } catch { /* absente */ }
  }

  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#777888')
    .text(`Document généré électroniquement le ${new Date().toLocaleDateString('fr-FR')}`, 50, 785, { align: 'center', width: 500 });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ nomFichier, identifiant: identifiantDoc }));
    stream.on('error', reject);
  });
}
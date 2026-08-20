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

export function cheminAbsolu(nomFichier) {
  return path.join(DOCUMENTS_DIR, path.basename(nomFichier));
}
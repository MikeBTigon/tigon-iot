// Insights — credit application PDF summary (jsPDF + AutoTable, loaded on demand like mp/finance/financePdf.ts).
import { storeName } from '../../sales/closing/closingUtils';
import { isNativeApp } from '../../../native/platform';
import { creditSections, type CreditApp } from './creditShared';

const BLUE: [number, number, number] = [14, 70, 113];

/** Builds the one-page summary. Returns the jsPDF document. */
export async function buildCreditPdf(a: CreditApp) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(20).text('Credit application', M, 40);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(`TIGON Golf Carts${a.storeId ? ` · ${storeName(a.storeId)}` : ''}`, W - M, 30, { align: 'right' });
  doc.text(new Date(a.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W - M, 46, { align: 'right' });
  let y = 84;
  for (const s of creditSections(a)) {
    autoTable(doc, {
      startY: y,
      head: [[s.title, '']],
      body: s.rows,
      theme: 'grid',
      margin: { left: M, right: M },
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: BLUE, textColor: 255 },
      columnStyles: { 0: { cellWidth: 150, textColor: [90, 90, 90] } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }
  doc.setTextColor(40, 40, 40).setFontSize(9);
  const consent = doc.splitTextToSize(
    `Customer consent (${new Date(a.consentAt || a.createdAt).toLocaleString('en-US')}): "${a.consentText}"`, W - 2 * M,
  );
  doc.text(consent, M, y + 4);
  doc.setFont('helvetica', 'bold').text('No Social Security number or date of birth was collected. The lender must get them from the customer securely.', M, y + 8 + consent.length * 11);
  return doc;
}

const fileName = (a: CreditApp) => `credit-application-${`${a.firstName}-${a.lastName}`.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`;

/** Downloads the PDF (phone app: saves it and opens the share sheet, like the financing sheet). */
export async function downloadCreditPdf(a: CreditApp) {
  const doc = await buildCreditPdf(a);
  const name = fileName(a);
  if (!isNativeApp()) {
    doc.save(name);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const saved = await Filesystem.writeFile({ path: `credit/${name}`, data: doc.output('datauristring').split(',')[1], directory: Directory.Cache, recursive: true });
  await Share.share({ title: name, files: [saved.uri] });
}

/** Base64 (no data: prefix) for emailing. */
export async function creditPdfBase64(a: CreditApp): Promise<string> {
  const doc = await buildCreditPdf(a);
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf(',') + 1);
}

import jsPDF from 'jspdf';
import QRCode from 'qrcode';

interface WorksheetOptions {
  organizationName?: string;
}

export async function generateWorksheet(options: WorksheetOptions = {}): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const { organizationName = 'MADISON' } = options;
  
  // Colors matching brand
  const brassColor: [number, number, number] = [184, 149, 106]; // #B8956A
  const inkBlack: [number, number, number] = [41, 35, 29]; // #29231D
  const warmGray: [number, number, number] = [107, 99, 91]; // #6B635B
  
  // Page margins
  const margin = 20;
  const pageWidth = 210;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Helper to add line
  const addLine = (length: number = contentWidth) => {
    doc.setDrawColor(...warmGray);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, margin + length, yPos);
  };

  // Header Section
  doc.setFontSize(24);
  doc.setTextColor(...inkBlack);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTENT BRIEF WORKSHEET', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...warmGray);
  doc.text(organizationName, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 5;
  addLine();
  yPos += 10;

  // Date and ID
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  const today = new Date().toLocaleDateString();
  const worksheetId = `WS-${Date.now().toString(36).toUpperCase()}`;
  doc.text(`Date: ${today}`, margin, yPos);
  doc.text(`Worksheet ID: ${worksheetId}`, pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 10;

  // Section 1: Product/Collection
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('1. PRODUCT OR COLLECTION NAME', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('Enter the product or collection this content is about:', margin, yPos);
  yPos += 5;
  
  addLine();
  yPos += 10;

  // Section 2: Deliverable Format
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('2. DELIVERABLE FORMAT', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('Select the type of content you need (check one):', margin, yPos);
  yPos += 6;

  const formats = [
    'Email Campaign',
    'Blog Post',
    'Social Media Post',
    'Product Description',
    'Newsletter',
    'Website Copy'
  ];

  formats.forEach(format => {
    // Draw checkbox
    doc.rect(margin + 2, yPos - 3, 3, 3);
    doc.text(format, margin + 8, yPos);
    yPos += 6;
  });

  yPos += 4;

  // Section 3: Target Audience
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('3. TARGET AUDIENCE', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('Who is this content for? (demographics, interests, pain points)', margin, yPos);
  yPos += 5;
  
  // Add lines for writing
  for (let i = 0; i < 3; i++) {
    addLine();
    yPos += 6;
  }
  yPos += 4;

  // Section 4: Content Goal
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('4. CONTENT GOAL', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('What should this content achieve? (inform, persuade, educate, convert)', margin, yPos);
  yPos += 5;
  
  for (let i = 0; i < 3; i++) {
    addLine();
    yPos += 6;
  }
  yPos += 4;

  // Section 5: Style Overlay
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('5. STYLE OVERLAY', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('Choose the writing style (select one):', margin, yPos);
  yPos += 6;

  const styles = [
    { name: 'Brand Voice', desc: 'House voice from brand knowledge' },
    { name: 'Madison Editorial', desc: 'Professional, authoritative, editorial' },
    { name: 'Balanced', desc: 'Mix of both styles' }
  ];

  styles.forEach(style => {
    // Draw radio button
    doc.circle(margin + 3, yPos - 1, 1.5);
    doc.text(`${style.name} - ${style.desc}`, margin + 8, yPos);
    yPos += 6;
  });

  yPos += 4;

  // Section 6: Additional Direction
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...inkBlack);
  doc.text('6. ADDITIONAL EDITORIAL DIRECTION', margin, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...warmGray);
  doc.text('Any specific requirements, tone preferences, or key messages?', margin, yPos);
  yPos += 5;
  
  for (let i = 0; i < 5; i++) {
    addLine();
    yPos += 6;
  }

  // Footer Section with QR Code - side-by-side layout
  yPos = 248; // Fixed position near bottom
  
  // Generate QR code
  const uploadUrl = `${window.location.origin}/create?upload=true`;
  const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: {
      dark: '#29231D',
      light: '#FFFFFF'
    }
  });

  // QR code on the right side - smaller size
  const qrSize = 25; // Smaller QR code
  const qrXPos = pageWidth - margin - qrSize; // Position on right
  doc.addImage(qrDataUrl, 'PNG', qrXPos, yPos, qrSize, qrSize);
  
  yPos += qrSize + 8;

  // Instructions centered below
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...warmGray);
  doc.text('Scan to upload this worksheet or visit: madison.io/create', pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFontSize(8);
  doc.text('Supported formats: PDF, JPG, PNG', pageWidth / 2, yPos, { align: 'center' });

  // Return as blob
  return doc.output('blob');
}

export async function downloadWorksheet(options: WorksheetOptions = {}) {
  const blob = await generateWorksheet(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `content-brief-worksheet-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

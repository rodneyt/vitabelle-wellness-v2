import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function hashDocument(uint8Array) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateConsentPDF(templateVersion, submissionData, signaturePngBase64, auditData) {
  const pdfDoc = await PDFDocument.create();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let y = height - 50;

  const drawText = (text, size = 12, isBold = false) => {
    if (y < 50) {
      page = pdfDoc.addPage();
      y = height - 50;
    }
    page.drawText(text, { x: 50, y, size, font: isBold ? boldFont : font });
    y -= size + 8;
  };

  drawText(`Consent Form - Template ${templateVersion}`, 16, true);
  y -= 20;
  
  drawText('Submission Data:', 14, true);
  for (const [key, value] of Object.entries(submissionData)) {
    drawText(`${key}: ${value}`);
  }
  
  y -= 20;
  drawText('Signature:', 14, true);
  
  if (signaturePngBase64) {
    // Strip metadata prefix if present (e.g. data:image/png;base64,)
    const b64Data = signaturePngBase64.replace(/^data:image\/\w+;base64,/, '');
    const signatureBytes = Uint8Array.from(atob(b64Data), c => c.charCodeAt(0));
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    const { width: imgWidth, height: imgHeight } = signatureImage.scale(0.5);
    
    if (y - imgHeight < 50) {
      page = pdfDoc.addPage();
      y = height - 50;
    }
    
    page.drawImage(signatureImage, {
      x: 50,
      y: y - imgHeight,
      width: imgWidth,
      height: imgHeight,
    });
    
    y -= imgHeight + 20;
  }
  
  // Audit Page
  page = pdfDoc.addPage();
  y = height - 50;
  
  drawText('Audit Information', 16, true);
  y -= 20;
  drawText(`IP Address: ${auditData.ip || 'Unknown'}`);
  drawText(`User Agent: ${auditData.userAgent || 'Unknown'}`);
  drawText(`Date: ${new Date().toISOString()}`);
  
  // Save first time to get the hash of the document minus the hash string itself
  const pdfBytes = await pdfDoc.save();
  const docHash = await hashDocument(pdfBytes);
  
  drawText(`SHA-256 Document Hash: ${docHash}`);
  
  // Save final document containing the hash
  return await pdfDoc.save();
}

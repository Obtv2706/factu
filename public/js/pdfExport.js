window.PdfExport = (function () {
  const PAGE_W = 612;
  const MARGIN = 44;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  function slug(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'estimado';
  }

  function fmt(n, cur) {
    return Money.fmt(n, cur);
  }

  function stagePrice(stage) {
    let p = 0;
    for (const it of stage.items) p += it.qty * it.cost * (1 + stage.profit_pct / 100);
    return p;
  }

  function build(data, settings) {
    const project = data.project || data;
    const stages = data.stages || [];
    const cur = project.currency || '$';
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' });
    const company = settings || {};

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    let y = MARGIN;

    function tryLogo() {
      if (!company.logo_url) return;
      try {
        const img = new Image();
        img.src = company.logo_url;
        doc.addImage(img, 'PNG', MARGIN, y, 64, 64);
      } catch (e) {}
    }

    tryLogo();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(31, 41, 55);
    doc.text(company.company_name || 'Estimado de Construcción', MARGIN, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(107, 114, 128);
    let cLine = y + 38;
    const clines = [];
    if (company.company_address) clines.push(company.company_address);
    if (company.company_phone) clines.push(company.company_phone);
    if (company.company_email) clines.push(company.company_email);
    doc.text(clines.join('  |  '), MARGIN, cLine);
    doc.setFontSize(10);
    doc.text('Fecha: ' + dateStr, PAGE_W - MARGIN, y + 24, { align: 'right' });
    y += 44;

    doc.setDrawColor(37, 99, 235);
    doc.setFillColor(37, 99, 235);
    doc.rect(MARGIN, y, CONTENT_W, 2, 'F');
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text('ESTIMADO DE CONSTRUCCIÓN', MARGIN, y);
    y += 26;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(31, 41, 55);
    const meta = [
      ['Cliente', project.client_name],
      ['Proyecto', project.project_name],
      ['Teléfono', project.phone],
      ['Email', project.email],
      ['Dirección', project.address],
    ].filter(([, v]) => v);
    for (const [k, v] of meta) {
      doc.setFont('helvetica', 'bold');
      doc.text(k + ':', MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(v), MARGIN + 90, y);
      y += 15;
    }
    y += 12;

    let grandTotal = 0;

    for (const stage of stages) {
      const included = !stage.excluded;
      const stageBody = stage.items.map((it) => {
        const unitPrice = it.cost * (1 + stage.profit_pct / 100);
        return [it.qty, it.unit, it.description, fmt(unitPrice, cur), fmt(it.qty * unitPrice, cur)];
      });
      const price = stagePrice(stage);
      if (included) grandTotal += price;

      if (y > 620) { doc.addPage(); y = MARGIN + 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(stage.excluded ? 220 : 31, stage.excluded ? 38 : 41, stage.excluded ? 38 : 55);
      doc.text(stage.name, MARGIN, y);
      if (stage.excluded && stage.note) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.5);
        doc.setTextColor(220, 38, 38);
        doc.text('(' + stage.note + ' — NO INCLUIDO EN EL TOTAL)', MARGIN, y + 12);
        y += 14;
      } else {
        y += 6;
      }

      const head = [['Cant.', 'Unidad', 'Descripción', 'Precio Unit.', 'Precio']];
      doc.autoTable({
        startY: y + 8,
        margin: { left: MARGIN, right: MARGIN, bottom: 60 },
        head,
        body: stageBody,
        theme: 'grid',
        styles: { fontSize: 9.5, cellPadding: 5, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9.5, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { halign: 'right', cellWidth: 42 },
          1: { halign: 'left', cellWidth: 64 },
          2: { cellWidth: 'auto' },
          3: { halign: 'right', cellWidth: 110 },
          4: { halign: 'right', cellWidth: 110 },
        },
      });

      y = doc.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(31, 41, 55);
      doc.text('Subtotal' + (included ? '' : ' (no incluido)') + ': ' + fmt(price, cur), PAGE_W - MARGIN, y, { align: 'right' });
      y += 24;
    }

    if (y > 620) { doc.addPage(); y = MARGIN + 20; }

    const summaryBody = stages.filter((s) => !s.excluded).map((s) => [s.name, fmt(stagePrice(s), cur)]);
    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 60 },
      head: [['RESUMEN POR ETAPAS', 'Precio']],
      body: summaryBody,
      foot: [['TOTAL DEL ESTIMADO', fmt(grandTotal, cur)]],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6, textColor: [31, 41, 55], lineColor: [229, 231, 235], lineWidth: 0.5 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255 },
      footStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 160 },
      },
    });
    y = doc.lastAutoTable.finalY + 24;

    const notes = [];
    if (project.notes) notes.push(project.notes);
    if (company.footer_note) notes.push(company.footer_note);
    if (notes.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(31, 41, 55);
      doc.text('Notas y condiciones', MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(75, 85, 99);
      y += 14;
      for (const n of notes) {
        const lines = doc.splitTextToSize(n, CONTENT_W);
        doc.text(lines, MARGIN, y);
        y += lines.length * 13;
      }
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(156, 163, 175);
      doc.text((company.company_name || '') + (company.company_phone ? '  |  ' + company.company_phone : ''), MARGIN, PAGE_W - 26);
      doc.text('Página ' + i + ' de ' + pageCount, PAGE_W - MARGIN, PAGE_W - 26, { align: 'right' });
    }

    return doc;
  }

  function filename(data) {
    const project = data.project || data;
    const base = slug(project.project_name || project.client_name);
    const d = new Date().toISOString().slice(0, 10);
    return 'Estimado-' + base + '-' + d + '.pdf';
  }

  return { build, filename };
})();

window.Share = (function () {
  function summaryText(data) {
    const project = data.project || data;
    const stages = data.stages || [];
    let total = 0;
    for (const s of stages) {
      if (s.excluded) continue;
      for (const it of s.items) total += it.qty * it.cost * (1 + s.profit_pct / 100);
    }
    const cur = project.currency || '$';
    const lines = ['ESTIMADO DE CONSTRUCCIÓN'];
    if (project.client_name) lines.push('Cliente: ' + project.client_name);
    if (project.project_name) lines.push('Proyecto: ' + project.project_name);
    lines.push('Total: ' + Money.fmt(total, cur));
    lines.push('Adjunto encontrará el detalle por etapas.');
    return lines.join('\n');
  }

  function downloadDoc(doc, filename) {
    doc.save(filename);
  }

  async function shareDoc(doc, filename, text) {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename, text: text || '' });
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function openWhatsApp(text) {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  return { summaryText, downloadDoc, shareDoc, openWhatsApp, copy };
})();

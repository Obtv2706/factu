window.Money = {
  fmt(n, cur) {
    const v = Number.isFinite(n) ? n : 0;
    const neg = v < 0;
    const abs = Math.abs(v);
    const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-' : '') + (cur || '$') + s;
  },
  pct(n) {
    const v = Number.isFinite(n) ? n : 0;
    return (Math.round(v * 100) / 100).toFixed(2) + '%';
  },
  num(v) {
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
};

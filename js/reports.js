function initReportsPage() {
  document.getElementById('exportAllBtn').onclick = () => window.open('/api/export/companies.xlsx', '_blank');
  document.getElementById('exportShortlistBtn2').onclick = () => window.open('/api/export/shortlist.xlsx', '_blank');
  document.getElementById('exportScreenerBtn2').onclick = () => {
    if (!screenerResultRows || screenerResultRows.length === 0) {
      alert('Run the Screener first to generate a filtered result set to export.');
      return;
    }
    const ids = screenerResultRows.map(c => c.id).join(',');
    window.open(`/api/export/companies.xlsx?ids=${encodeURIComponent(ids)}`, '_blank');
  };
  document.getElementById('printCurrentBtn').onclick = () => window.print();
}

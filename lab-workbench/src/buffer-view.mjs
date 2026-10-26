// Preserve raw legacy snapshots while retiring only optional stock-target checks.
export function bufferPresentationResults(results) {
  const errors = (list) => (list || []).filter((text) => !/^(?:Component \d+: )?Stock target mass\b/i.test(text));
  return {
    ...results,
    errors: errors(results.errors),
    rows: (results.rows || []).map((row) => ({
      ...row,
      errors: errors(row.errors),
      formulas: (row.formulas || []).filter((text) => !/^Stock weighing error\b/i.test(text)),
    })),
  };
}

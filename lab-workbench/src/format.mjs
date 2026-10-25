export function formatResult(value, { signed = false } = {}) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  if (value !== 0 && Math.abs(value) < 0.005) return `${value < 0 ? "-" : sign}<0.01`;
  return sign + value.toFixed(2);
}
export function excelResultFormat(value, signed = false) {
  if (value !== 0 && Math.abs(value) < 0.005) return `"${value < 0 ? "-" : signed ? "+" : ""}<0.01"`;
  return signed ? "+0.00;-0.00;0.00" : "0.00";
}

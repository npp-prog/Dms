import { STATUSES } from '../lib/defaults.js';

export default function StatusBadge({ status }) {
  const s = STATUSES[status] || { label: status, className: 'badge-gray' };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}

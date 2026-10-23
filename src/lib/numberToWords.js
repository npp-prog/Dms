const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function chunkToWords(n) {
  const words = [];
  if (n >= 100) {
    words.push(ONES[Math.floor(n / 100)], 'Hundred');
    n %= 100;
  }
  if (n >= 20) {
    words.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0) {
    words.push(ONES[n]);
  }
  return words.join(' ');
}

export function integerToWords(num) {
  num = Math.floor(Math.abs(num));
  if (num === 0) return 'Zero';
  const parts = [];
  let scale = 0;
  while (num > 0 && scale < SCALES.length) {
    const chunk = num % 1000;
    if (chunk) parts.unshift([chunkToWords(chunk), SCALES[scale]].filter(Boolean).join(' '));
    num = Math.floor(num / 1000);
    scale++;
  }
  return parts.join(' ');
}

// 1234.5 -> "One Thousand Two Hundred Thirty-Four Pesos and 50/100"
export function amountToWords(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const cents = Math.round(Math.abs(amount) * 100);
  const pesos = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, '0');
  return `${integerToWords(pesos)} Peso${pesos === 1 ? '' : 's'} and ${centavos}/100 Only`;
}

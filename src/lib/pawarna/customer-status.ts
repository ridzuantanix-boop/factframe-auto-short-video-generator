// Historical operational errors stay in private records, not customer billing UI.
export function customerError(error?: string) {
  return error && /nexabot|penyedia|provider|refund|kredit|credit|caj/i.test(error)
    ? "Video belum dapat disiapkan. Hubungi sokongan sebelum mencuba semula."
    : error;
}

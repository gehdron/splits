export type AiReceiptItem = {
  quantity: string;
  description: string;
  amount: string;
};

export type AiReceiptTotals = {
  subtotal: string;
  tax: string;
  tip: string;
  total: string;
};

export type AiParsedReceipt = {
  merchant?: string;
  items: AiReceiptItem[];
  totals: AiReceiptTotals;
};

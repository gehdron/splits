export type SplitInstructionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReceiptAssignment = {
  itemIndex: number;
  people: string[];
};

export type SplitAssistantResult = {
  reply: string;
  clarification: string;
  assignments: ReceiptAssignment[];
};

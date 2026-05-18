declare module 'tau-prolog' {
  interface TauSession {
    consult(program: string, callbacks: { success: () => void; error: (error: unknown) => void }): void;
    query(goal: string, callbacks: { success: () => void; error: (error: unknown) => void }): void;
    answer(callbacks: {
      success: (answer: unknown) => void;
      fail: () => void;
      error: (error: unknown) => void;
      limit: () => void;
    }): void;
    format_answer(answer: unknown): string;
  }

  const pl: {
    create(limit?: number): TauSession;
  };

  export default pl;
}

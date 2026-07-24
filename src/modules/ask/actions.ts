"use server";

import { answerQuestion, type AskAnswer } from "./answer";

export async function ask(query: string): Promise<AskAnswer> {
  return answerQuestion(query);
}

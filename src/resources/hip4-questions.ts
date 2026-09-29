import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, Hip4ListQuestionsParams, Hip4Question } from '../types';
import { Hip4QuestionArrayResponseSchema, Hip4QuestionResponseSchema } from '../schemas';

/**
 * HIP-4 questions: groupings of binary outcome markets under one ballot, with
 * one named outcome per choice plus a fallback outcome that resolves Yes when
 * no named choice does. Outcome ids here match `hip4.outcomes`.
 *
 * @example
 * ```typescript
 * const questions = [];
 * let page = await client.hyperliquid.hip4.questions.list({ limit: 500 });
 * questions.push(...page.data);
 * while (page.nextCursor) {
 *   page = await client.hyperliquid.hip4.questions.list({ limit: 500, cursor: page.nextCursor });
 *   questions.push(...page.data);
 * }
 * const question = await client.hyperliquid.hip4.questions.get(0);
 * console.log(question.namedOutcomeIds, question.fallbackOutcomeId);
 * ```
 */
export class Hip4QuestionsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/hip4'
  ) {}

  /**
   * List HIP-4 questions, one page at a time. Pass `nextCursor` back
   * unchanged as `cursor` until it is undefined.
   *
   * @param params - Cursor and page size (default 100, max 1000)
   */
  async list(params?: Hip4ListQuestionsParams): Promise<CursorResponse<Hip4Question[]>> {
    const response = await this.http.get<ApiResponse<Hip4Question[]>>(
      `${this.basePath}/questions`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? Hip4QuestionArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta?.nextCursor,
    };
  }

  /**
   * Get one HIP-4 question by id.
   *
   * @param questionId - Numeric question id
   */
  async get(questionId: number | string): Promise<Hip4Question> {
    const response = await this.http.get<ApiResponse<Hip4Question>>(
      `${this.basePath}/questions/${encodeURIComponent(String(questionId))}`,
      undefined,
      this.http.validationEnabled ? Hip4QuestionResponseSchema : undefined
    );
    return response.data;
  }
}

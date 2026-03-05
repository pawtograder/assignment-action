export declare const BASE_PROMPT: string;
export declare const CHECKLIST_STRATEGY_PROMPT = "\nStrategy instructions (checklist-strategy):\nBefore writing your response, silently decide which ONE of the three focuses below is most useful given the error, then write your hint based on that focus. Do not name or reveal your choice in the output.\n\nFocuses:\n- WHERE: Which class, method, or test type is this error coming from?\n- WHAT: What is the correct behavior per the spec?\n- DIFFERENT: What specific condition or input might cause actual behavior to diverge from expected?\n\nUse exactly one focus to shape the 3\u20134 sentence hint. The output must read as a single, natural paragraph of encouragement and guidance \u2014 not a structured report.";
/**
 * Build the full LLM prompt: BASE_PROMPT (with readme) + strategy + error output.
 */
export declare function buildFeedBotPrompt(errorOutput: string): string;

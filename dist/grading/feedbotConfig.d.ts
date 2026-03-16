import { FeedBotConfig } from './types.js';
export interface FeedbotValidationResult {
    runtimeEnabled: boolean;
    valid: boolean;
    missingFields: string[];
}
export declare function validateFeedbotConfig(feedbot: FeedBotConfig | undefined): FeedbotValidationResult;

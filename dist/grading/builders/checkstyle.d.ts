import Logger from '../Logger.js';
import { LintResult } from './Builder.js';
export declare function parseLintingReports(file: string, logger: Logger): Promise<LintResult>;

import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import Logger from '../Logger.js';
import { PawtograderConfig } from '../types.js';
export declare abstract class Grader<Config extends PawtograderConfig> {
    protected solutionDir: string;
    protected submissionDir: string;
    protected config: Config;
    protected regressionTestJob?: number | undefined;
    protected logger: Logger;
    constructor(solutionDir: string, submissionDir: string, config: Config, regressionTestJob?: number | undefined);
    abstract grade(): Promise<AutograderFeedback>;
}

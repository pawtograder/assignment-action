import { PawtograderConfig } from '../types.js';
import { JavaGrader } from './JavaGrader.js';
import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import Logger from '../Logger.js';
export declare abstract class Grader<Config extends PawtograderConfig> {
    protected solutionDir: string;
    protected submissionDir: string;
    protected config: Config;
    protected gradingDir: string;
    protected regressionTestJob?: number | undefined;
    protected logger: Logger;
    constructor(solutionDir: string, submissionDir: string, config: Config, gradingDir: string, regressionTestJob?: number | undefined);
    copyStudentFiles(whichFiles: keyof Config['submissionFiles']): Promise<void>;
    abstract grade(): Promise<AutograderFeedback>;
    static fromPreset(solutionDir: string, submissionDir: string, config: PawtograderConfig, gradingDir: string, regressionTestJob?: number): JavaGrader;
}

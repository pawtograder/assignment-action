import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { Grader } from './Grader.js';
import { PyretPawtograderConfig } from '../types.js';
export declare class PyretGrader extends Grader<PyretPawtograderConfig> {
    constructor(solutionDir: string, submissionDir: string, config: PyretPawtograderConfig, regressionTestJob?: number);
    grade(): Promise<AutograderFeedback>;
}

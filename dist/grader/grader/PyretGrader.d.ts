import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { PyretPawtograderConfig } from '../types.js';
import { Grader } from './Grader.js';
export declare class PyretGrader extends Grader<PyretPawtograderConfig> {
    constructor(solutionDir: string, submissionDir: string, config: PyretPawtograderConfig, gradingDir: string, regressionTestJob?: number);
    grade(): Promise<AutograderFeedback>;
}

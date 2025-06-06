import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { JavaPawtograderConfig } from '../types.js';
import { Grader } from './Grader.js';
export declare class JavaGrader extends Grader<JavaPawtograderConfig> {
    private builder;
    constructor(solutionDir: string, submissionDir: string, config: JavaPawtograderConfig, gradingDir: string, regressionTestJob?: number);
    resetSolutionFiles(): Promise<void>;
    private gradePart;
    private gradeGradedUnit;
    grade(): Promise<AutograderFeedback>;
}

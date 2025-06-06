import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { GradlePawtograderConfig, PawtograderConfig } from '../types.js';
import { Grader } from './Grader.js';
export declare class GradleGrader extends Grader<GradlePawtograderConfig> {
    private gradingDir;
    private builder;
    constructor(solutionDir: string, submissionDir: string, config: PawtograderConfig, gradingDir: string, regressionTestJob?: number);
    copyStudentFiles(whichFiles: 'files' | 'testFiles'): Promise<void>;
    resetSolutionFiles(): Promise<void>;
    private gradePart;
    private gradeGradedUnit;
    grade(): Promise<AutograderFeedback>;
}

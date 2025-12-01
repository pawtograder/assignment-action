import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { OverlayPawtograderConfig, PawtograderConfig } from '../types.js';
import { Grader } from './Grader.js';
export declare class OverlayGrader extends Grader<OverlayPawtograderConfig> {
    private gradingDir;
    private builder;
    private mutantHintsShown;
    private implementationHintsShown;
    constructor(solutionDir: string, submissionDir: string, config: PawtograderConfig, gradingDir: string, regressionTestJob?: number);
    copyStudentFiles(whichFiles: 'files' | 'testFiles'): Promise<void>;
    copyFallbackFiles(): Promise<void>;
    private copyArtifactToTemp;
    resetSolutionFiles(): Promise<void>;
    private gradeGradedUnit;
    /**
     * Check if dependencies are satisfied based on part and unit scores.
     * Works for both GradedPart and GradedUnit dependencies.
     * Returns an object with:
     * - satisfied: boolean indicating if all dependencies are met
     * - unmetDependencies: array of strings describing which dependencies were not met
     */
    private checkDependencies;
    /**
     * Check if any dependency has a custom minScore
     */
    private hasCustomMinScore;
    /**
     * Create feedback for a part whose dependencies were not met
     */
    private createPartDependencyNotMetFeedback;
    /**
     * Create feedback for a unit whose dependencies were not met
     */
    private createUnitDependencyNotMetFeedback;
    grade(): Promise<AutograderFeedback>;
}

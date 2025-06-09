import { AutograderFeedback } from '../api/adminServiceSchemas.js';
import { PawtograderConfig } from './types.js';
import { OverlayGrader } from './graders/OverlayGrader.js';
export declare function makeGrader(config: PawtograderConfig, solutionDir: string, submissionDir: string, regressionTestJob?: number): Promise<OverlayGrader>;
export default function grade(solutionDir: string, submissionDir: string, regressionTestJob?: number): Promise<AutograderFeedback>;

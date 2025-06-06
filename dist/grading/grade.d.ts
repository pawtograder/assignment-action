import { AutograderFeedback } from '../api/adminServiceSchemas.js';
import { PawtograderConfig } from './types.js';
import { OverlayGrader } from './graders/OverlayGrader.js';
import { PyretGrader } from './graders/PyretGrader.js';
export declare function makeGrader(config: PawtograderConfig, solutionDir: string, submissionDir: string, regressionTestJob?: number): Promise<OverlayGrader | PyretGrader>;
export default function grade(solutionDir: string, submissionDir: string, regressionTestJob?: number): Promise<AutograderFeedback>;

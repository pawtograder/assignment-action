import { AutograderFeedback } from '../api/adminServiceSchemas.js';
export default function grade(solutionDir: string, submissionDir: string, regressionTestJob?: number): Promise<AutograderFeedback>;

import { GradeResponse, GradingScriptResult, RegressionTestRunResponse, SubmissionResponse } from './api/adminServiceSchemas.js';
export declare function submitFeedback(body: GradingScriptResult, token: string, queryParams?: {
    autograder_regression_test_id?: number;
}): Promise<GradeResponse>;
export declare function createSubmission(token: string): Promise<SubmissionResponse>;
export declare function createRegressionTestRun(token: string, regression_test_id: number): Promise<RegressionTestRunResponse>;

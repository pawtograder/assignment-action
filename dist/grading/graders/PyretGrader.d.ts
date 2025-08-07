import { AutograderFeedback } from '../../api/adminServiceSchemas.js';
import { Grader } from './Grader.js';
import { PyretPawtograderConfig } from '../types.js';
export declare class PyretGrader extends Grader<PyretPawtograderConfig> {
    constructor(solutionDir: string, submissionDir: string, config: PyretPawtograderConfig, regressionTestJob?: number);
    resolveSpec(): Promise<{
        solution_dir: string;
        submission_dir: string;
        config: {
            grader: "pyret";
            graders: Record<string, {
                type: "well-formed";
                deps?: string[] | undefined;
                entry?: string | undefined;
            } | {
                type: "wheat" | "chaff";
                config: {
                    path: string;
                    function: string;
                };
                deps?: string[] | undefined;
                entry?: string | undefined;
                points?: number | undefined;
            } | {
                type: "functional";
                config: {
                    path: string;
                    check: string;
                };
                deps?: string[] | undefined;
                entry?: string | undefined;
                points?: number | undefined;
            } | {
                type: "self-test";
                config: {
                    function: string;
                };
                deps?: string[] | undefined;
                entry?: string | undefined;
                points?: number | undefined;
            }>;
            default_entry?: string | undefined;
        };
    }>;
    tryGrade(): Promise<AutograderFeedback>;
    grade(): Promise<AutograderFeedback>;
}

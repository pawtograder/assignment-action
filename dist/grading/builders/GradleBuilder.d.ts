import { Builder, BuildStepOptions, LintResult, MutantResult, TestResult } from './Builder.js';
import { JavacError } from './javacErrorParser.js';
export declare class GradleBuildError extends Error {
    readonly rawOutput: string;
    readonly parsedErrors: JavacError[];
    constructor(message: string, rawOutput: string, parsedErrors: JavacError[]);
}
export default class GradleBuilder extends Builder {
    setupVenv(): Promise<void>;
    lint(): Promise<LintResult>;
    getCoverageReport(): Promise<string>;
    getCoverageReportDir(): string;
    test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]>;
    getMutationCoverageReportDir(): string | undefined;
    mutationTest({ timeoutSeconds }: BuildStepOptions): Promise<MutantResult[]>;
    buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void>;
}

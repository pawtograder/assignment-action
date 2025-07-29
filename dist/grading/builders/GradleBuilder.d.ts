import { Builder, BuildStepOptions, LintResult, MutantResult, TestResult } from './Builder.js';
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

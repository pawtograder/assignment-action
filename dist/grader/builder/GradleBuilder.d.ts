import { Builder, BuildStepOptions, LintResult, MutantResult, TestResult } from './Builder.js';
export default class GradleBuilder extends Builder {
    lint(): Promise<LintResult>;
    getCoverageReport(): Promise<string>;
    getCoverageReportDir(): string;
    test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]>;
    mutationTest({ timeoutSeconds }: BuildStepOptions): Promise<MutantResult[]>;
    buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void>;
}

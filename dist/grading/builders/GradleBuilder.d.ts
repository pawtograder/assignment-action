import { Builder, BuildStepOptions, LintResult, MutantResult, TestResult } from './Builder.js';
export default class GradleBuilder extends Builder {
    setupVenv(dir: string, key: string): Promise<void>;
    lint(): Promise<LintResult>;
    getCoverageReport(): Promise<string>;
    getCoverageReportDir(): string;
    test({ timeoutSeconds }: BuildStepOptions): Promise<TestResult[]>;
    mutationTest({ timeoutSeconds }: BuildStepOptions): Promise<MutantResult[]>;
    buildClean({ timeoutSeconds }: BuildStepOptions): Promise<void>;
}

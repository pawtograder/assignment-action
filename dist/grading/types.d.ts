import { AutograderFeedback } from '../api/adminServiceSchemas.js';
export declare const DEFAULT_TIMEOUTS: {
    build: number;
    student_tests: number;
    instructor_tests: number;
    mutants: number;
};
export interface VenvInfo {
    cache_key: string;
    dir_name: string;
}
export interface ScriptInfo {
    setup_venv: string;
    activate_venv: string;
    linting_report: string;
    html_coverage_reports: string;
    textual_coverage_reports: string;
    test_runner: string;
    mutation_test_runner: string;
    install_deps: string;
}
export interface BuildConfig {
    preset: 'java-gradle' | 'python-script' | 'none';
    cmd?: string;
    timeouts_seconds?: {
        build?: number;
        student_tests?: number;
        instructor_tests?: number;
        mutants?: number;
    };
    artifacts?: GraderArtifact[];
    linter?: {
        preset: 'checkstyle';
        policy: 'fail' | 'ignore';
    };
    student_tests?: {
        student_impl?: {
            run_tests?: boolean;
            report_branch_coverage?: boolean;
            run_mutation?: boolean;
            report_mutation_coverage?: boolean;
        };
        instructor_impl?: {
            run_tests?: boolean;
            run_mutation?: boolean;
            report_mutation_coverage?: boolean;
        };
    };
    venv?: VenvInfo;
    script_info?: ScriptInfo;
}
export interface GraderArtifact {
    name: string;
    path: string;
    data?: object;
}
export interface BreakPoint {
    minimumMutantsDetected: number;
    pointsToAward: number;
}
export interface MutationTestUnit {
    name: string;
    locations: string[];
    breakPoints?: BreakPoint[];
    linearScoring?: {
        total_faults: number;
        points: number;
    };
}
export interface RegularTestUnit {
    name: string;
    tests: string | string[];
    points: number;
    testCount: number;
    allow_partial_credit?: boolean;
    hide_output?: boolean;
}
export type GradedUnitBase = MutationTestUnit | RegularTestUnit;
export interface PartDependencyRef {
    part: string;
    minScore?: number;
}
export interface UnitDependencyRef {
    unit: string;
    minScore?: number;
}
export type Dependency = string | PartDependencyRef | UnitDependencyRef;
export declare function isPartDependency(dep: Dependency): dep is PartDependencyRef;
export declare function isUnitDependency(dep: Dependency): dep is UnitDependencyRef;
export declare function isSimpleDependency(dep: Dependency): dep is string;
export type GradedUnit = GradedUnitBase & {
    dependencies?: Dependency[];
};
export interface GradedPart {
    name: string;
    gradedUnits: GradedUnit[];
    hide_until_released?: boolean;
    dependencies?: Dependency[];
}
export interface MutantAdvice {
    name: string;
    prompt: string;
    sourceClass: string;
    targetClass: string;
}
export type LLMProvider = 'openai' | 'azure' | 'anthropic' | 'openrouter';
export interface LLMConfig {
    model: string;
    provider: LLMProvider;
    temperature?: number;
    max_tokens?: number;
    rate_limit?: object;
}
export interface OverlayPawtograderConfig {
    grader: 'overlay';
    build: BuildConfig;
    gradedParts?: GradedPart[];
    submissionFiles: {
        files: string[];
        testFiles: string[];
    };
    fallbackFiles?: string;
    mutantAdvice?: MutantAdvice[];
    maxMutantHints?: number;
    maxImplementationHints?: number;
    llm?: LLMConfig;
}
export type PawtograderConfig = OverlayPawtograderConfig;
export declare function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit;
export declare function isRegularTestUnit(unit: GradedUnit): unit is RegularTestUnit;
export type OutputFormat = 'text' | 'ansi' | 'markdown';
export type OutputVisibility = 'hidden' | 'visible' | 'after_due_date' | 'after_published';
export type AutograderTestFeedback = AutograderFeedback['tests'][0];

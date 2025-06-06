import { AutograderFeedback } from '../api/adminServiceSchemas.js';
export declare const DEFAULT_TIMEOUTS: {
    build: number;
    student_tests: number;
    instructor_tests: number;
    mutants: number;
};
export interface BuildConfig {
    preset: 'java-gradle' | 'none';
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
        policy: 'fail' | 'warn' | 'ignore';
    };
    student_tests?: {
        student_impl?: {
            run_tests?: boolean;
            report_branch_coverage?: boolean;
        };
        instructor_impl?: {
            run_tests?: boolean;
            run_mutation?: boolean;
            report_mutation_coverage?: boolean;
        };
    };
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
    breakPoints: BreakPoint[];
}
export interface RegularTestUnit {
    name: string;
    tests: string | string[];
    points: number;
    testCount: number;
    allow_partial_credit?: boolean;
}
export type GradedUnit = MutationTestUnit | RegularTestUnit;
export interface GradedPart {
    name: string;
    gradedUnits: GradedUnit[];
    hide_until_released?: boolean;
}
export interface OverlayPawtograderConfig {
    grader: 'overlay';
    build: BuildConfig;
    gradedParts?: GradedPart[];
    submissionFiles: {
        files: string[];
        testFiles: string[];
    };
    mutantAdvice?: {
        sourceClass: string;
        targetClass: string;
        name: string;
        prompt: string;
    }[];
}
export interface PyretPawtograderConfig {
    grader: 'pyret';
}
export type PawtograderConfig = OverlayPawtograderConfig | PyretPawtograderConfig;
export declare function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit;
export declare function isRegularTestUnit(unit: GradedUnit): unit is RegularTestUnit;
export type OutputFormat = 'text' | 'ansi' | 'markdown';
export type OutputVisibility = 'hidden' | 'visible' | 'after_due_date' | 'after_published';
export type AutograderTestFeedback = AutograderFeedback['tests'][0];

import { AutograderFeedback } from '../api/adminServiceSchemas.js';
export interface BuildConfig {
    preset: 'java-gradle';
    cmd: string;
    artifacts: string[];
    linter: {
        preset: 'checkstyle';
        policy: 'fail' | 'warn' | 'ignore';
    };
    student_tests: {
        grading: 'none' | 'mutation';
    };
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
    hide_until_released?: boolean;
}
export type GradedUnit = MutationTestUnit | RegularTestUnit;
export interface GradedPart {
    name: string;
    gradedUnits: GradedUnit[];
}
export interface PawtograderConfig {
    build: BuildConfig;
    gradedParts: GradedPart[];
    submissionFiles: {
        files: string[];
        testFiles: string[];
    };
}
export declare function isMutationTestUnit(unit: GradedUnit): unit is MutationTestUnit;
export declare function isRegularTestUnit(unit: GradedUnit): unit is RegularTestUnit;
export type OutputFormat = 'text' | 'ansi' | 'markdown';
export type OutputVisibility = 'hidden' | 'visible' | 'after_due_date' | 'after_published';
export type AutograderTestFeedback = AutograderFeedback['tests'][0];

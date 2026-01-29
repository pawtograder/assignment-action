/**
 * Parser for Java compiler errors from Gradle/javac output
 * Extracts structured error information and generates student-friendly messages
 */
export interface JavacError {
    type: 'cannot_find_symbol' | 'incompatible_types' | 'method_cannot_be_applied' | 'other';
    file: string;
    line: number;
    symbolType?: 'method' | 'class' | 'variable' | 'field';
    symbolName?: string;
    symbolSignature?: string;
    locationClass?: string;
    errorMessage?: string;
}
/**
 * Parse Java compiler errors from Gradle build output
 * @param output Raw Gradle/javac output string
 * @param gradingDir Base directory for resolving relative paths
 * @returns Array of parsed error objects
 */
export declare function parseJavacErrors(output: string, gradingDir: string): JavacError[];
/**
 * Generate a student-friendly error message from parsed Java compiler errors
 * @param errors Array of parsed JavacError objects
 * @returns Formatted markdown message
 */
export declare function generateStudentFriendlyError(errors: JavacError[]): string;

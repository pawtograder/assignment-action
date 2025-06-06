export interface CheckstyleError {
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    source: string;
}
export interface CheckstyleFile {
    name: string;
    errors: CheckstyleError[];
}
export interface CheckstyleReport {
    version: string;
    files: CheckstyleFile[];
    totalErrors: number;
}
export declare function parseCheckstyleXml(filePath: string): CheckstyleReport;

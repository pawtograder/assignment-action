/* eslint-disable */
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';
export function parsePitestXml(filePath) {
    const xmlContent = readFileSync(filePath, 'utf-8');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: '_text'
    });
    const parsed = parser.parse(xmlContent);
    // Initialize the report structure
    const report = {
        statistics: {
            totalMutations: 0,
            killed: 0,
            survived: 0,
            noCoverage: 0,
            timedOut: 0,
            memoryError: 0,
            runError: 0,
            mutationScore: 0
        },
        mutations: []
    };
    // Handle case where there are no mutations
    if (!parsed.mutations?.mutation) {
        return report;
    }
    // Convert to array if single mutation
    const mutations = Array.isArray(parsed.mutations.mutation)
        ? parsed.mutations.mutation
        : [parsed.mutations.mutation];
    // Process each mutation
    report.mutations = mutations.map((mut) => {
        const mutation = {
            detected: mut.status === 'KILLED',
            status: mut.status,
            numberOfTestsRun: parseInt(mut.numberOfTestsRun || '0', 10),
            sourceFile: mut.sourceFile,
            mutatedClass: mut.mutatedClass,
            mutatedMethod: mut.mutatedMethod,
            methodDescription: mut.methodDescription,
            lineNumber: parseInt(mut.lineNumber, 10),
            mutator: mut.mutator,
            index: parseInt(mut.index, 10),
            block: parseInt(mut.block, 10),
            description: mut.description
        };
        if (mut.killingTest) {
            mutation.killingTest = mut.killingTest;
        }
        if (mut.killingTests) {
            mutation.killingTests = mut.killingTests;
        }
        // Update statistics
        report.statistics.totalMutations++;
        switch (mutation.status) {
            case 'KILLED':
                report.statistics.killed++;
                break;
            case 'SURVIVED':
                report.statistics.survived++;
                break;
            case 'NO_COVERAGE':
                report.statistics.noCoverage++;
                break;
            case 'TIMED_OUT':
                report.statistics.timedOut++;
                break;
            case 'MEMORY_ERROR':
                report.statistics.memoryError++;
                break;
            case 'RUN_ERROR':
                report.statistics.runError++;
                break;
        }
        return mutation;
    });
    // Calculate mutation score
    if (report.statistics.totalMutations > 0) {
        report.statistics.mutationScore =
            (report.statistics.killed / report.statistics.totalMutations) * 100;
    }
    return report;
}
// Helper function to get mutations for a specific location range
export function getMutationsInRange(report, className, startLine, endLine) {
    return report.mutations.filter((mutation) => mutation.mutatedClass === className &&
        mutation.lineNumber >= startLine &&
        mutation.lineNumber <= endLine);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGl0ZXN0LmpzIiwic291cmNlUm9vdCI6Ii9Vc2Vycy9zbWFyYW50L0RvY3VtZW50cy9Vbml2ZXJzaXR5IHN0dWZmL1N1bW1lci0yMDI1L0NvdXJzZSBEZXYvYXNzaWdubWVudC1hY3Rpb24vIiwic291cmNlcyI6WyJzcmMvZ3JhZGluZy9idWlsZGVycy9waXRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0JBQW9CO0FBQ3BCLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQTtBQUMzQyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sSUFBSSxDQUFBO0FBbURqQyxNQUFNLFVBQVUsY0FBYyxDQUFDLFFBQWdCO0lBQzdDLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUE7SUFDbEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxTQUFTLENBQUM7UUFDM0IsZ0JBQWdCLEVBQUUsS0FBSztRQUN2QixtQkFBbUIsRUFBRSxFQUFFO1FBQ3ZCLFlBQVksRUFBRSxPQUFPO0tBQ3RCLENBQUMsQ0FBQTtJQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUE7SUFFdkMsa0NBQWtDO0lBQ2xDLE1BQU0sTUFBTSxHQUF3QjtRQUNsQyxVQUFVLEVBQUU7WUFDVixjQUFjLEVBQUUsQ0FBQztZQUNqQixNQUFNLEVBQUUsQ0FBQztZQUNULFFBQVEsRUFBRSxDQUFDO1lBQ1gsVUFBVSxFQUFFLENBQUM7WUFDYixRQUFRLEVBQUUsQ0FBQztZQUNYLFdBQVcsRUFBRSxDQUFDO1lBQ2QsUUFBUSxFQUFFLENBQUM7WUFDWCxhQUFhLEVBQUUsQ0FBQztTQUNqQjtRQUNELFNBQVMsRUFBRSxFQUFFO0tBQ2QsQ0FBQTtJQUVELDJDQUEyQztJQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQztRQUNoQyxPQUFPLE1BQU0sQ0FBQTtJQUNmLENBQUM7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
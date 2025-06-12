import Logger from '../Logger.js';
export class Grader {
    solutionDir;
    submissionDir;
    config;
    regressionTestJob;
    logger;
    constructor(solutionDir, submissionDir, config, regressionTestJob) {
        this.solutionDir = solutionDir;
        this.submissionDir = submissionDir;
        this.config = config;
        this.regressionTestJob = regressionTestJob;
        this.logger = new Logger(regressionTestJob);
        if (regressionTestJob) {
            console.log(`Autograder configuration: ${JSON.stringify(this.config, null, 2)}`);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR3JhZGVyLmpzIiwic291cmNlUm9vdCI6Ii9Vc2Vycy9zbWFyYW50L0RvY3VtZW50cy9Vbml2ZXJzaXR5IHN0dWZmL1N1bW1lci0yMDI1L0NvdXJzZSBEZXYvYXNzaWdubWVudC1hY3Rpb24vIiwic291cmNlcyI6WyJzcmMvZ3JhZGluZy9ncmFkZXJzL0dyYWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLE1BQU0sTUFBTSxjQUFjLENBQUE7QUFHakMsTUFBTSxPQUFnQixNQUFNO0lBSWQ7SUFDQTtJQUNBO0lBQ0E7SUFORixNQUFNLENBQVE7SUFFeEIsWUFDWSxXQUFtQixFQUNuQixhQUFxQixFQUNyQixNQUFjLEVBQ2QsaUJBQTBCO1FBSDFCLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBQ25CLGtCQUFhLEdBQWIsYUFBYSxDQUFRO1FBQ3JCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDZCxzQkFBaUIsR0FBakIsaUJBQWlCLENBQVM7UUFFcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO1FBQzNDLElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN0QixPQUFPLENBQUMsR0FBRyxDQUNULDZCQUE2QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQ3BFLENBQUE7UUFDSCxDQUFDO0lBQ0gsQ0FBQztDQUdGIn0=
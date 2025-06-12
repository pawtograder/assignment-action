export default class Logger {
    regressionTestJob;
    output = [];
    constructor(regressionTestJob) {
        this.regressionTestJob = regressionTestJob;
    }
    log(visibility, message) {
        if (visibility === 'visible') {
            console.log(message);
        }
        else if (this.regressionTestJob) {
            console.log(`CIDebug: ${message}`);
        }
        this.output.push({
            output: message,
            visibility: visibility
        });
    }
    hasOutput(visibility) {
        return this.output.some((o) => o.visibility === visibility);
    }
    getEachOutput() {
        const ret = {};
        for (const visibility of [
            'visible',
            'hidden',
            'after_due_date',
            'after_published'
        ]) {
            if (this.hasOutput(visibility)) {
                ret[visibility] = {
                    output: this.getOutput(visibility),
                    output_format: 'text'
                };
            }
        }
        return ret;
    }
    getOutput(visibility) {
        const includeLine = (v) => {
            if (visibility === 'visible') {
                return v === 'visible';
            }
            if (visibility === 'hidden') {
                return true;
            }
            if (visibility === 'after_due_date') {
                return v === 'visible' || v === 'after_due_date';
            }
            if (visibility === 'after_published') {
                return (v === 'visible' || v === 'after_published' || v === 'after_due_date');
            }
            return false;
        };
        return this.output
            .filter((o) => includeLine(o.visibility))
            .map((o) => o.output)
            .join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nZ2VyLmpzIiwic291cmNlUm9vdCI6Ii9Vc2Vycy9zbWFyYW50L0RvY3VtZW50cy9Vbml2ZXJzaXR5IHN0dWZmL1N1bW1lci0yMDI1L0NvdXJzZSBEZXYvYXNzaWdubWVudC1hY3Rpb24vIiwic291cmNlcyI6WyJzcmMvZ3JhZGluZy9Mb2dnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsTUFBTSxDQUFDLE9BQU8sT0FBTyxNQUFNO0lBS0w7SUFKWixNQUFNLEdBR1IsRUFBRSxDQUFBO0lBQ1IsWUFBb0IsaUJBQTBCO1FBQTFCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBUztJQUFHLENBQUM7SUFFbEQsR0FBRyxDQUFDLFVBQTRCLEVBQUUsT0FBZTtRQUMvQyxJQUFJLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ3RCLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxPQUFPLEVBQUUsQ0FBQyxDQUFBO1FBQ3BDLENBQUM7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNmLE1BQU0sRUFBRSxPQUFPO1lBQ2YsVUFBVSxFQUFFLFVBQVU7U0FDdkIsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUNELFNBQVMsQ0FBQyxVQUE0QjtRQUNwQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxLQUFLLFVBQVUsQ0FBQyxDQUFBO0lBQzdELENBQUM7SUFDRCxhQUFhO1FBQ1gsTUFBTSxHQUFHLEdBS0wsRUFBRSxDQUFBO1FBQ04sS0FBSyxNQUFNLFVBQVUsSUFBSTtZQUN2QixTQUFTO1lBQ1QsUUFBUTtZQUNSLGdCQUFnQjtZQUNoQixpQkFBaUI7U0FDSSxFQUFFLENBQUM7WUFDeEIsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRztvQkFDaEIsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO29CQUNsQyxhQUFhLEVBQUUsTUFBTTtpQkFDdEIsQ0FBQTtZQUNILENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUE7SUFDWixDQUFDO0lBRUQsU0FBUyxDQUFDLFVBQTRCO1FBQ3BDLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBbUIsRUFBRSxFQUFFO1lBQzFDLElBQUksVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUM3QixPQUFPLENBQUMsS0FBSyxTQUFTLENBQUE7WUFDeEIsQ0FBQztZQUNELElBQUksVUFBVSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM1QixPQUFPLElBQUksQ0FBQTtZQUNiLENBQUM7WUFDRCxJQUFJLFVBQVUsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNwQyxPQUFPLENBQUMsS0FBSyxTQUFTLElBQUksQ0FBQyxLQUFLLGdCQUFnQixDQUFBO1lBQ2xELENBQUM7WUFDRCxJQUFJLFVBQVUsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLENBQ0wsQ0FBQyxLQUFLLFNBQVMsSUFBSSxDQUFDLEtBQUssaUJBQWlCLElBQUksQ0FBQyxLQUFLLGdCQUFnQixDQUNyRSxDQUFBO1lBQ0gsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFBO1FBQ2QsQ0FBQyxDQUFBO1FBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTTthQUNmLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQzthQUN4QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7YUFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ2YsQ0FBQztDQUNGIn0=
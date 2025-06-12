export const DEFAULT_TIMEOUTS = {
    build: 600,
    student_tests: 300,
    instructor_tests: 300,
    mutants: 1800
};
// Type guard to check if a unit is a mutation test unit
export function isMutationTestUnit(unit) {
    return 'locations' in unit && 'breakPoints' in unit;
}
// Type guard to check if a unit is a regular test unit
export function isRegularTestUnit(unit) {
    return 'tests' in unit && 'testCount' in unit;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiL1VzZXJzL3NtYXJhbnQvRG9jdW1lbnRzL1VuaXZlcnNpdHkgc3R1ZmYvU3VtbWVyLTIwMjUvQ291cnNlIERldi9hc3NpZ25tZW50LWFjdGlvbi8iLCJzb3VyY2VzIjpbInNyYy9ncmFkaW5nL3R5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHO0lBQzlCLEtBQUssRUFBRSxHQUFHO0lBQ1YsYUFBYSxFQUFFLEdBQUc7SUFDbEIsZ0JBQWdCLEVBQUUsR0FBRztJQUNyQixPQUFPLEVBQUUsSUFBSTtDQUNkLENBQUE7QUFxRkQsd0RBQXdEO0FBQ3hELE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxJQUFnQjtJQUNqRCxPQUFPLFdBQVcsSUFBSSxJQUFJLElBQUksYUFBYSxJQUFJLElBQUksQ0FBQTtBQUNyRCxDQUFDO0FBRUQsdURBQXVEO0FBQ3ZELE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxJQUFnQjtJQUNoRCxPQUFPLE9BQU8sSUFBSSxJQUFJLElBQUksV0FBVyxJQUFJLElBQUksQ0FBQTtBQUMvQyxDQUFDIn0=
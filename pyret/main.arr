# TODO: nicer pyret entry?
import npm("pyret-autograder-pawtograder", "../src/main.arr") as P
include js-file("stdin")

input = get-stdin()
result = P.grade-pawtograder-spec(input)

print(result.serialize() + "\n")

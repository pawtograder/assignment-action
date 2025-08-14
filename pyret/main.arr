# TODO: nicer pyret entry?
import npm("pyret-autograder-pawtograder", "../src/main.arr") as P
# FIXME: pyret's nested modules are broken
include npm("pyret-autograder", "../src/tools/main.arr")

input = io.get-stdin()
result = P.grade-pawtograder-spec(input)

io.send-final(result.serialize())

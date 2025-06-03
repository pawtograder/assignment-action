include js-file("./stdin")
include file("./output.arr")
include file("./input.arr")
# FIXME: use npm inport
include file("../node_modules/pyret-autograder/src/main.arr")

input = get-stdin()

# TODO: use input :P

student-path = "node_modules/pyret-autograder/examples/gcd.arr"
graders =
  [list:
    node(
      "gcd-chaff-1",
      [list:],
      chaff(student-path, "node_modules/pyret-autograder/examples/gcd/wheat.arr", "gcd"),
      visible(1)
    ),
    node(
      "gcd-wheat-1",
      [list:],
      wheat(student-path, "node_modules/pyret-autograder/examples/gcd/wheat.arr", "gcd"),
      visible(1)
    ),
    node(
      "gcd-reference-tests",
      [list:],
      functional(student-path, "node_modules/pyret-autograder/examples/gcd/functional.arr", "gcd-reference-tests"),
      visible(1)
    )
  ]

result = grade(graders)
output = prepare-for-pawtograder(result)

print(to-repr(output) + "\n")
print(output.serialize() + "\n")


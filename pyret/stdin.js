// prettier-ignore (will insert ; at beginning)
({
  requires: [],
  provides: {
    values: {
      "get-stdin": ["arrow", [], "String"]
    }
  },
  nativeRequires: [],
  theModule: (RUNTIME, NAMESPACE, uri) => {
    let input = ""
    let eof = false

    RUNTIME.stdin.setEncoding("utf8")

    RUNTIME.stdin.on("data", (chunk) => {
      input += chunk
    })

    RUNTIME.stdin.on("end", () => {
      eof = true
    })

    function getStdin() {
      if (!eof) {
        return RUNTIME.pauseStack(async (restarter) => {
          RUNTIME.stdin.on("end", () => {
            restarter.resume(RUNTIME.makeString(input))
          })
        })
      }

      return RUNTIME.makeString(input)
    }

    return RUNTIME.makeModuleReturn(
      {
        "get-stdin": RUNTIME.makeFunction(getStdin, "get-stdin")
      },
      {}
    )
  }
})

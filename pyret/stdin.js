({
  requires: [],
  provides: {
    values: {
      "get-stdin": ["arrow", [], "String"],
    },
  },
  nativeRequires: [],
  theModule: function (runtime, _, _) {
    let input = "";
    let eof = false;

    runtime.stdin.setEncoding("utf8");
    runtime.stdin.on("data", (chunk) => (input += chunk));
    runtime.stdin.on("end", () => (eof = true));

    function getStdin() {
      if (!eof) {
        return runtime.pauseStack(async (restarter) => {
          runtime.stdin.on("end", () => {
            restarter.resume(runtime.makeString(input));
          });
        });
      }

      return runtime.makeString(input);
    }

    return runtime.makeModuleReturn({
      "get-stdin": runtime.makeFunction(getStdin, "get-stdin"),
    }, {});
  },
})

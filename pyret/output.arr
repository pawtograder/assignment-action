import lists as L
import json as J
import string-dict as SD

import file("../node_modules/pyret-autograder/src/main.arr") as A

provide:
  # data PawtograderFeedback,
  # data PawtograderTest,
  # data PawtograderLint,
  # data PawtograderLintStatus,
  # data PawtograderTopLevelOutput,
  # data PawtograderOutput,
  # data PawtograderArtifact,
  # data PawtograderAnnotations,
  # data PawtograderFeedbackAuthor,
  # data OutputFormat,
  prepare-for-pawtograder
end

fun add(sd :: SD.MutableStringDict, key :: String, val, trans):
  if (is-Option(val)) block:
    cases (Option) val:
      | none => nothing
      | some(v) => sd.set-now(key, trans(v))
    end
  else:
    sd.set-now(key, trans(val))
  end
end

fun map-json(trans):
  lam(lst):
    L.map(trans, lst) ^ J.j-arr
  end
end

data PawtograderFeedback:
  | pawtograder-feedback(
    tests :: L.List<PawtograderTest>,
    lint :: PawtograderLint,
    output :: PawtograderTopLevelOutput,
    max-score :: Option<Number>,
    score :: Option<Number>,
    artifacts :: L.List<PawtograderArtifact>,
    annotations :: L.List<PawtograderAnnotations>) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    shadow add = add(sd, _, _, _)
    add("tests", self.tests, map-json(_.to-json()))
    add("lint", self.lint, _.to-json())
    add("output", self.output, _.to-json())
    add("max_score", self.max-score, J.to-json)
    add("score", self.score, J.to-json)
    add("artifacts", self.artifacts, map-json(_.to-json()))
    add("annotations", self.annotations, map-json(_.to-json()))
    J.j-obj(sd.freeze())
  end
end

data PawtograderTest:
  | pawtograder-test(
    part :: Option<String>,
    output-format :: OutputFormat,
    output :: String,
    hidden-output :: Option<String>,
    hidden-output-format :: Option<OutputFormat>,
    name :: String,
    max-score :: Option<Number>,
    score :: Option<Number>,
    hide-until-released :: Option<Boolean>) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    shadow add = add(sd, _, _, _)
    add("part", self.part, J.to-json)
    add("output_format", self.output-format, _.to-json())
    add("output", self.output, J.to-json)
    add("hidden_output", self.hidden-output, J.to-json)
    add("hidden_output_format", self.hidden-output-format, _.to-json())
    add("name", self.name, J.to-json)
    add("max_score", self.max-score, J.to-json)
    add("score", self.score, J.to-json)
    add("hide_until_released", self.hide-until-released, _.to-json())
    J.j-obj(sd.freeze())
  end
end

data PawtograderLint:
  | pawtograder-lint(
    output-format :: Option<OutputFormat>,
    output :: String,
    status :: PawtograderLintStatus) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    shadow add = add(sd, _, _, _)
    add("output_format", self.output-format, _.to-json())
    add("output", self.output, J.to-json)
    add("status", self.status, _.to-json())
    J.j-obj(sd.freeze())
  end
end

data PawtograderLintStatus:
  | pass with:
  method to-json(self) -> J.JSON:
    J.j-str("pass")
  end
  | fail with:
  method to-json(self) -> J.JSON:
    J.j-str("fail")
  end
end

data PawtograderTopLevelOutput:
  | pawtograder-top-level-output(
      visible :: Option<PawtograderOutput>,
      hidden :: Option<PawtograderOutput>,
      after-due-date :: Option<PawtograderOutput>,
      after-published :: Option<PawtograderOutput>) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    add(sd, "visible", self.visible, _.to-json())
    add(sd, "hidden", self.hidden, _.to-json())
    add(sd, "after_due_date", self.after-due-date, _.to-json())
    add(sd, "after_published", self.after-published, _.to-json())
    J.j-obj(sd.freeze())
  end
end

data PawtograderOutput:
  | pawtograder-output(output-format :: Option<OutputFormat>, output :: String) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    add(sd, "output_format", self.output-format, _.to-json)
    add(sd, "output", self.output, J.to-json)
    J.j-obj(sd.freeze())
  end
end

data PawtograderArtifact:
  | pawtograder-artifact(
      name :: String,
      path :: String
      # TODO: what is data?
  ) with:
  method to-json(self) -> J.JSON block:
    sd = [SD.mutable-string-dict:]
    add(sd, "name", self.name, J.to-json)
    add(sd, "path", self.path, J.to-json)
    J.j-obj(sd.freeze())
  end
end

data PawtograderAnnotations:
  | feedback-comment(
      author :: PawtograderFeedbackAuthor,
      message :: String,
      points :: Option<Number>,
      rubric-check-id :: Option<Number>,
      released :: Boolean) with:
  method to-json(self) block:
    sd = self.common-sd(self)
    J.j-obj(sd.freeze())
  end
  | feedback-line-comment(
      author :: PawtograderFeedbackAuthor,
      message :: String,
      points :: Option<Number>,
      rubric-check-id :: Option<Number>,
      released :: Boolean,
      line :: Number,
      file-name :: String) with:
  method to-json(self) block:
    sd = self.common-sd(self)
    add(sd, "line", self.line, J.to-json)
    add(sd, "file_name", self.file-name, J.to-json)
    J.j-obj(sd.freeze())
  end
  | feedback-artifact-comment(
      author :: PawtograderFeedbackAuthor,
      message :: String,
      points :: Option<Number>,
      rubric-check-id :: Option<Number>,
      released :: Boolean,
      artifact-name :: String) with:
  method to-json(self) block:
    sd = self.common-sd(self)
    add(sd, "artifact_name", self.artifact-name, J.to-json)
    J.j-obj(sd.freeze())
  end
sharing:
  method common-sd(self) block:
    sd = [SD.mutable-string-dict:]
    add(sd, self.author)
    sd
  end
end

data PawtograderFeedbackAuthor:
  | feedback-author(
      name :: String,
      avatar-url :: String,
      flair :: Option<String>,
      flair-color :: Option<String>) with:
  method to-json(self) block:
    sd = [SD.mutable-string-dict:]
    add(sd, "name", self.name, J.to-json)
    add(sd, "avatar_url", self.avatar-url, J.to-json)
    add(sd, "flair", self.flair, J.to-json)
    add(sd, "flair_color", self.flair-color, J.to-json)
    J.j-obj(sd.freeze())
  end
end

data OutputFormat:
  | text
  | markdown
  | ansi
sharing:
  method to-json(self):
    cases (OutputFormat) self:
      | text => J.j-str("text")
      | markdown => J.j-str("markdown")
      | ansi => J.j-str("ansi")
    end
  end
end


fun aggregate-output-to-pawtograder(output :: A.AggregateOutput) -> {OutputFormat; String}:
  cases (A.AggregateOutput) output:
    | output-text(content) => {text; content}
    | output-markdown(content) => {markdown; content}
    | output-ansi(content) => {ansi; content}
  end
end

# n.b uses + rather than link to preserve order
# FIXME: do we really need to keep track of score and max-score?
fun prepare-for-pawtograder(results :: List<{A.Id; A.AggregateResult;}>) -> J.JSON block:
  {tests; score; max-score} = for fold({acc-tests; acc-score; acc-max-score} from {[list:]; 0; 0},
                                       {id; res} from results):
    cases (A.AggregateResult) res:
      | aggregate-skipped(name, so, io, max-score) =>
        {sof; sos} = aggregate-output-to-pawtograder(so)
        {iof; ios} = (aggregate-output-to-pawtograder(_) ^ io.and-then).or-else({none; none})
        test = pawtograder-test(
          none, # TODO: what is a part?
          sof,
          sos,
          ios,
          iof,
          name,
          some(max-score),
          some(0),
          none
        )
        {acc-tests + [list: test]; acc-score; acc-max-score + max-score}
      | aggregate-test(name, so, io, score, max-score) =>
        {sof; sos} = aggregate-output-to-pawtograder(so)
        {iof; ios} = (aggregate-output-to-pawtograder(_) ^ io.and-then).or-else({none; none})
        test = pawtograder-test(
          none, # TODO: what is a part?
          sof,
          sos,
          ios,
          iof,
          name,
          some(max-score),
          some(score),
          none
        )
        {acc-tests + [list: test]; acc-score + score; acc-max-score + max-score}
      | aggregate-artifact(_, _, _) => {acc-tests; acc-score; acc-max-score}
    end
  end

  artifacts = for fold(acc from [list:], {id; res} from results):
    cases (A.AggregateResult) res:
      | aggregate-skipped(_, _, _, _) => acc
      | aggregate-test(_, _, _, _, _) => acc
      | aggregate-artifact(name, path, _) => # TODO: what about artifact skip?
        # TODO: can we add id as metadata somewhere?
        artifact = pawtograder-artifact(name, path)
        acc + [list: artifact]
    end
  end

  pawtograder-feedback(
    tests,
    pawtograder-lint(none, "", pass),
    pawtograder-top-level-output(none, none, none, none), # TODO: what should we put here?
    some(max-score),
    some(score),
    artifacts,
    [list:]
  ).to-json()
end



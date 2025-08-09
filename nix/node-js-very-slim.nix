{ pkgs }:
(pkgs.nodejs_24.override {
  enableNpm = false;
}).overrideAttrs
  (old: {
    doCheck = false;

    outputs = [
      "out"
    ];

    # copied from nixpkgs; removed all v8 output
    postInstall = ''
      HOST_PATH=$out/bin patchShebangs --host $out

      $out/bin/node --completion-bash > node.bash
      installShellCompletion node.bash

      rm -rf $out/include

      rm -rf $out/lib/node_modules/corepack
      rm -rf $out/bin/corepack

      rm -rf $out/share/doc
      rm -rf $out/share/man
    '';

    postConfigure = ""; # incorrectly assumes $dev will exist
  })


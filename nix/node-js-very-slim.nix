{ pkgs }:
let
  node-js-slim = pkgs.nodejs_24.override { enableNpm = false; };
in
pkgs.runCommand "nodejs-slim-stripped"
  {
    nativeBuildInputs = with pkgs; [ removeReferencesTo ];

    meta = {
      mainProgram = "node";
      description = "Node.js with dev references stripped";
    };

    disallowedReferences = [ node-js-slim ];
  }
  ''
    mkdir -p $out/bin
    cp ${node-js-slim}/bin/node $out/bin/node

    remove-references-to -t ${pkgs.icu.dev} $out/bin/node
    remove-references-to -t ${pkgs.openssl.dev} $out/bin/node
    remove-references-to -t ${pkgs.sqlite.dev} $out/bin/node
    remove-references-to -t ${pkgs.zlib.dev} $out/bin/node
    remove-references-to -t ${pkgs.libuv.dev} $out/bin/node

    remove-references-to -t ${node-js-slim} $out/bin/node
  ''

{ pkgs }:
(pkgs.nodejs_24.override {
  enableNpm = false;
}).overrideAttrs
  (old: {
    doCheck = false;

    outputs = [
      "out"
      "libv8"
    ];

    # HACK: this is copied from nixpkgs with npm and dev outputs removed
    postInstall = ''
      HOST_PATH=$out/bin patchShebangs --host $out

      $out/bin/node --completion-bash > node.bash
      installShellCompletion node.bash

      # --- NPM REMOVED ---

      # --- COPYING HEADERS REMOVED ---

      # assemble a static v8 library and put it in the 'libv8' output
      mkdir -p $libv8/lib
      pushd out/Release/obj
      find . -path "**/torque_*/**/*.o" -or -path "**/v8*/**/*.o" \
        -and -not -name "torque.*" \
        -and -not -name "mksnapshot.*" \
        -and -not -name "gen-regexp-special-case.*" \
        -and -not -name "bytecode_builtins_list_generator.*" \
        | sort -u >files
      test -s files # ensure that the list is not empty
      $AR -cqs $libv8/lib/libv8.a @files
      popd

      # copy v8 headers
      cp -r deps/v8/include $libv8/

      # create a pkgconfig file for v8
      major=$(grep V8_MAJOR_VERSION deps/v8/include/v8-version.h | cut -d ' ' -f 3)
      minor=$(grep V8_MINOR_VERSION deps/v8/include/v8-version.h | cut -d ' ' -f 3)
      patch=$(grep V8_PATCH_LEVEL deps/v8/include/v8-version.h | cut -d ' ' -f 3)
      mkdir -p $libv8/lib/pkgconfig
      cat > $libv8/lib/pkgconfig/v8.pc << EOF
      Name: v8
      Description: V8 JavaScript Engine
      Version: $major.$minor.$patch
      Libs: -L$libv8/lib -lv8 -pthread -licui18n -licuuc
      Cflags: -I$libv8/include
      EOF
    '';

    postConfigure = ""; # incorrectly assumes $dev will exist
  })

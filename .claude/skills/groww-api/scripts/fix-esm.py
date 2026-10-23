#!/usr/bin/env python3
"""Make a TypeScript ESM build loadable by Node.

tsc emits extensionless import specifiers; Node's ESM resolver rejects them.
This rewrites each one to an explicit path, applying the only rule set that
works across all four cases:

  relative -> <spec>.js exists          append .js
  relative -> directory with index.js   append /index.js
  bare subpath (dayjs/plugin/x)         append .js if that file exists
  bare package root (camelcase-keys)    leave alone - its "exports" map
                                        resolves it, and a /index.js suffix
                                        raises ERR_PACKAGE_PATH_NOT_EXPORTED

Usage: fix-esm.py <dist-dir> <node_modules-dir>
"""
import os
import re
import sys

RE = re.compile(r"""((?:\bfrom\s*|\bimport\s*\(\s*))(['"])([^'"\n]+)\2""")
HAS_EXT = re.compile(r"\.(js|mjs|cjs|json|node)$")


def resolve(spec, from_file, node_modules):
    if HAS_EXT.search(spec):
        return None
    relative = spec.startswith(".")
    base = os.path.dirname(from_file) if relative else node_modules
    target = os.path.normpath(os.path.join(base, spec))
    if os.path.isfile(target + ".js"):
        return spec + ".js"
    if relative and os.path.isfile(os.path.join(target, "index.js")):
        return spec.rstrip("/") + "/index.js"
    return None


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    dist, node_modules = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    if not os.path.isdir(dist):
        sys.exit("not a directory: " + dist)

    specifiers = files = 0
    for dirpath, _, filenames in os.walk(dist):
        for name in filenames:
            if not name.endswith((".js", ".mjs")):
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding="utf8") as fh:
                src = fh.read()
            count = [0]

            def substitute(match):
                new = resolve(match.group(3), path, node_modules)
                if not new:
                    return match.group(0)
                count[0] += 1
                return match.group(1) + match.group(2) + new + match.group(2)

            out = RE.sub(substitute, src)
            if out != src:
                with open(path, "w", encoding="utf8") as fh:
                    fh.write(out)
                files += 1
                specifiers += count[0]

    print("rewrote %d specifiers across %d files" % (specifiers, files))


if __name__ == "__main__":
    main()

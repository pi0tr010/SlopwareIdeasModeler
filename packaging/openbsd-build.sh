#!/bin/sh
# Build SlopwareIdeasModeler on OpenBSD itself (amd64).
# There is no cross-compile from Windows or Linux: the window uses the system WebKit.
# Run from the project root: sh packaging/openbsd-build.sh
set -e

if [ "$(uname -s)" != "OpenBSD" ]; then
  echo "This script runs on OpenBSD, not on $(uname -s)."
  exit 1
fi

doas pkg_add -I rust node gtk+3 webkitgtk4 librsvg

npm ci
node scripts/build-mcp-binary.mjs src-tauri/binaries/slopware-mcp-x86_64-unknown-openbsd
cd src-tauri
cargo build --release

echo
echo "Binary: src-tauri/target/release/slopware-ideas-modeler"
echo "Agent:  src-tauri/binaries/slopware-mcp-x86_64-unknown-openbsd"
echo "The window links WebKit from the system. If cargo stops on a missing library, install that package and run this script again."
echo "Tauri does not produce an OpenBSD installer. Copy both files into one directory and point the agent at the slopware-mcp file."

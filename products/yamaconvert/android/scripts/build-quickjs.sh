#!/usr/bin/env bash
set -euo pipefail

ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/yamaconvert-quickjs"
SOURCE_DIR="$WORK_DIR/source"
DEST_DIR="$ANDROID_DIR/app/build/generated/yamaconvert-jniLibs"

if [[ -n "${ANDROID_NDK_HOME:-}" && -f "$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" ]]; then
  NDK_DIR="$ANDROID_NDK_HOME"
elif [[ -n "${ANDROID_HOME:-}" ]]; then
  NDK_DIR="$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort -V | tail -n 1)"
else
  NDK_DIR=""
fi
if [[ -z "$NDK_DIR" || ! -f "$NDK_DIR/build/cmake/android.toolchain.cmake" ]]; then
  echo "Android NDK with CMake support was not found." >&2
  exit 1
fi

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$DEST_DIR"
git clone --quiet --depth 1 --branch v0.16.1 https://github.com/quickjs-ng/quickjs.git "$SOURCE_DIR"

for ABI in arm64-v8a x86_64; do
  BUILD_DIR="$WORK_DIR/build-$ABI"
  cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" \
    -DCMAKE_TOOLCHAIN_FILE="$NDK_DIR/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$ABI" \
    -DANDROID_PLATFORM=android-26 \
    -DCMAKE_BUILD_TYPE=Release \
    -DQJS_BUILD_LIBC=ON \
    -DQJS_ENABLE_INSTALL=OFF
  cmake --build "$BUILD_DIR" --target qjs_exe --parallel 2
  QJS="$BUILD_DIR/qjs"
  if [[ ! -s "$QJS" ]]; then
    echo "QuickJS build did not produce an executable for $ABI." >&2
    exit 1
  fi
  mkdir -p "$DEST_DIR/$ABI"
  install -m 0755 "$QJS" "$DEST_DIR/$ABI/libqjs.so"
done


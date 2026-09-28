#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Please install Python 3.9+ from https://www.python.org/downloads/ and run again."
  read -r answer
  exit 1
fi
python3 studio.py "$@"

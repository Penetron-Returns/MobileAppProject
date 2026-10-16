#!/usr/bin/env bash
# Samples a running Android app's CPU, threads, memory and wakelocks over adb.
# Usage: scripts/perf/measure-android.sh <adb-path> <package-name>
# Leave the app idle in the state you want to measure (e.g. Home, screen on) before running.
set -u

ADB="${1:-}"
PKG="${2:-}"
if [ -z "$ADB" ] || [ -z "$PKG" ]; then
  echo "usage: $0 <adb-path> <package-name>" >&2
  exit 2
fi

PID="$("$ADB" shell pidof "$PKG" | tr -d '\r' | awk '{print $1}')"
if [ -z "$PID" ]; then
  echo "$PKG is not running" >&2
  exit 1
fi
echo "== $PKG pid=$PID =="

echo
echo "== Process CPU% (3 samples, 1 s top interval; 100% = one core) =="
for i in 1 2 3; do
  "$ADB" shell top -b -n 2 -d 1 -p "$PID" | tr -d '\r' | awk -v n="$i" '
    /^ *[0-9]+ / { last = $0 }
    END { print "sample " n ": " last }'
done

echo
echo "== Top 8 threads =="
"$ADB" shell top -H -b -n 2 -d 1 -p "$PID" | tr -d '\r' | awk '
  /^ *PID +USER/ { block++ ; next }
  block == 2 && /^ *[0-9]+ / { print }' | head -8

echo
echo "== Memory (dumpsys meminfo) =="
"$ADB" shell dumpsys meminfo "$PKG" | tr -d '\r' | grep -E "TOTAL PSS|TOTAL RSS|Native Heap|Java Heap|Graphics|Code:|Views:|WebViews:" | head -12

echo
echo "== Wakelocks held by $PKG =="
"$ADB" shell dumpsys power | tr -d '\r' | grep -E "WakeLock|Wake Locks" | grep -E "$PKG|Wake Locks: size" || echo "(none)"

echo
echo "== WebViews / renderer threads in the process =="
"$ADB" shell top -H -b -n 1 -p "$PID" | tr -d '\r' | grep -E "Chrome_|Viz|RenderThread|mqt_v_js|clovie-wakeword" | head -10 || true

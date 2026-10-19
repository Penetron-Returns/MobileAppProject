export MSYS_NO_PATHCONV=1
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
e(){ "$ADB" -s emulator-5554 "$@"; }
dump(){ e shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; e shell cat /sdcard/u.xml | grep -o -E '(text|content-desc)="[^"]+"[^>]*bounds="[^"]+"' | sed -E 's/ (resource-id|class|package|checkable|checked|clickable|enabled|focusable|focused|long-clickable|password|scrollable|selected|index)="[^"]*"//g' | head -${1:-40}; }
shot(){ e exec-out screencap -p > "C:/Users/colin/dev/mp-sdk/docs/play-store/assets/src/raw/$1.png"; }

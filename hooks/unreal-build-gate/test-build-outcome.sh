#!/usr/bin/env bash
# What a build log MEANS. Three answers, not two, and the third is why this file exists.
#
# On 2026-08-31 the gate read "Unable to build while Live Coding is active" as a compile
# failure, twice, and opened its own circuit breaker on it. The breaker then stayed open for
# fifteen days and nothing was verified in that time. The log line that did it is case 3.
set -u
. "$(dirname "${BASH_SOURCE[0]}")/build-outcome.sh"

pass=0; fail=0
check() {                       # check <name> <expected> <log text>
  local name="$1" want="$2" log; log=$(mktemp)
  printf '%s\n' "$3" > "$log"
  local got; got=$(classify_build "$log")
  if [ "$got" = "$want" ]; then pass=$((pass+1));
  else fail=$((fail+1)); printf 'FAIL  %s\n      want=%s got=%s\n' "$name" "$want" "$got"; fi
  rm -f "$log"
}

check "a build that worked" SUCCEEDED \
'Building 3 actions with 12 processes...
Result: Succeeded
Total execution time: 41.02 seconds'

check "a real compiler error" FAILED \
'PRJDoorTemplateActor.cpp(340): error C2065: undeclared identifier
Result: Failed (OtherCompilationError)
Total execution time: 8.11 seconds'

check "a real linker error" FAILED \
'PRJ.lib : error LNK2019: unresolved external symbol
Result: Failed (OtherCompilationError)'

# 🔴 THE CASE THAT OPENED THE BREAKER. Word for word from last-build.log of 2026-08-31.
# There is no compiler error in it. The build never started.
check "the editor was open" BLOCKED \
'Using bundled DotNet SDK version: 8.0.412 win-x64
Running UnrealBuildTool: dotnet "UnrealBuildTool.dll" ProjectEditor Win64 Development
Log file: %USERPROFILE%\AppData\Local\UnrealBuildTool\Log.txt
Unable to build while Live Coding is active. Exit the editor and game, or press Ctrl+Alt+F11 if iterating on code in the editor or game

Result: Failed (OtherCompilationError)
Total execution time: 1.62 seconds'

check "another build held the mutex" BLOCKED \
'Waiting for other instances to complete...
ERROR: Unable to acquire mutex UnrealBuildTool_Mutex
Result: Failed (OtherCompilationError)'

check "the target file was locked" BLOCKED \
'ERROR: Cannot open output file UnrealEditor-PRJ.dll: The process cannot access the file because it is being used by another process
Result: Failed (OtherCompilationError)'

check "nothing at all in the log" BLOCKED \
''

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

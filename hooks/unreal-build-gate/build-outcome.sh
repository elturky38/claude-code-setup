#!/usr/bin/env bash
# What a build log means. ONE owner of that question - verify-build.sh asks, this answers.
#
# 🔴 THREE ANSWERS, NOT TWO, AND THE THIRD IS THE WHOLE POINT.
#
#   SUCCEEDED  it compiled.
#   FAILED     it compiled and the CODE was wrong. A person can fix this.
#   BLOCKED    it never compiled at all. The editor was open, another build held the mutex,
#              the output .dll was locked. Nothing about the code is known either way.
#
# The gate used to have two answers, and BLOCKED came back as FAILED. That is not a naming
# quibble - it cost fifteen days. On 2026-08-31 the editor was open, Build.bat printed
# "Unable to build while Live Coding is active", and the signature the gate extracted came
# from the word ERROR inside "Result: Failed (OtherCompilationError)". Stable, so two runs
# matched, so the breaker opened, so the Stop gate stopped blocking - and it was still open
# on 2026-09-15 with last-build.ok dated 2026-08-26.
#
# 🔴 BLOCKED STILL BLOCKS THE STOP GATE. It must: nothing was verified. What it must NOT do
# is count toward the breaker. The breaker exists to stop a model retrying a fix it cannot
# make; a lockout has no fix in the code, so counting it punishes the one case where
# retrying - after closing the editor - is exactly the right move.
#
# Tested by test-build-outcome.sh, including the 2026-08-31 log word for word.

# classify_build <logfile>  ->  prints SUCCEEDED | FAILED | BLOCKED
classify_build() {
	local log="$1"
	[ -f "$log" ] || { printf 'BLOCKED'; return; }

	if grep -q "Result: Succeeded" "$log"; then printf 'SUCCEEDED'; return; fi

	# A REAL compiler or linker diagnostic: error C2065, error LNK2019, error CS0246.
	# This is the only evidence that the code itself was read and rejected. Note the
	# space before the code - it keeps this off the word ERROR inside an identifier
	# like OtherCompilationError, which is the exact match that opened the breaker.
	if grep -qiE 'error (C[0-9]+|LNK[0-9]+|CS[0-9]+)' "$log"; then printf 'FAILED'; return; fi

	# Everything else that says Failed said so without reading the code. Named rather
	# than assumed, so a new lockout message is BLOCKED by the default below and not
	# silently promoted to FAILED.
	printf 'BLOCKED'
}

# build_signature <logfile>  ->  the failure fingerprint the breaker compares
# Digits are flattened so two runs of the same fault match even when line numbers move.
build_signature() {
	local log="$1" sig
	sig=$(grep -oiE 'error (C[0-9]+|LNK[0-9]+|CS[0-9]+)[^\r]*' "$log" 2>/dev/null \
	        | head -1 | tr -d '\r' | sed 's/[0-9]\+/N/g')
	printf '%s' "$sig"
}

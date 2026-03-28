#!/usr/bin/env bash
set -euo pipefail

IMAGE="ai-employee-worker"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [[ "${result}" == PASS* ]]; then
    echo "  ✓ ${name}"
    ((PASS++)) || true
  else
    echo "  ✗ ${name}: ${result}"
    ((FAIL++)) || true
  fi
}

echo "Verifying Docker image: ${IMAGE}"
echo ""

# 1. Image exists
if docker images "${IMAGE}" --format "{{.Repository}}" | grep -q "${IMAGE}"; then
  check "Image exists" "PASS"
else
  check "Image exists" "FAIL"
fi

# 2. node v20
if output=$(docker run --rm "${IMAGE}" node --version 2>&1) && [[ "${output}" == v20* ]]; then
  check "node v20" "PASS"
else
  check "node v20" "FAIL (got: ${output:-unknown})"
fi

# 3. pnpm exists
if docker run --rm "${IMAGE}" pnpm --version >/dev/null 2>&1; then
  check "pnpm exists" "PASS"
else
  check "pnpm exists" "FAIL"
fi

# 4. git exists
if docker run --rm "${IMAGE}" git --version >/dev/null 2>&1; then
  check "git exists" "PASS"
else
  check "git exists" "FAIL"
fi

# 5. gh exists
if docker run --rm "${IMAGE}" gh --version >/dev/null 2>&1; then
  check "gh exists" "PASS"
else
  check "gh exists" "FAIL"
fi

# 6. opencode exists
if docker run --rm "${IMAGE}" opencode --version >/dev/null 2>&1; then
  check "opencode exists" "PASS"
else
  check "opencode exists" "FAIL"
fi

# 7. dist/ exists
if docker run --rm "${IMAGE}" ls /app/dist/ >/dev/null 2>&1; then
  check "dist/ exists" "PASS"
else
  check "dist/ exists" "FAIL"
fi

# 8. entrypoint.sh exists
if docker run --rm "${IMAGE}" test -f /app/entrypoint.sh && echo "found" >/dev/null 2>&1; then
  check "entrypoint.sh exists" "PASS"
else
  check "entrypoint.sh exists" "FAIL"
fi

# 9. Image size < 1.5GB
size_str=$(docker images "${IMAGE}" --format "{{.Size}}")
# Parse size string (e.g., "1.42GB" -> 1.42)
size_gb=$(echo "${size_str}" | sed 's/GB$//')
if (( $(echo "${size_gb} < 1.5" | bc -l) )); then
  check "Image size < 1.5GB" "PASS (${size_str})"
else
  check "Image size < 1.5GB" "FAIL (${size_str})"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ ${FAIL} -gt 0 ]]; then
  exit 1
fi
echo "All Docker image checks passed!"

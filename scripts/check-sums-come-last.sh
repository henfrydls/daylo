#!/usr/bin/env bash
# The file of hashes has to be built after everything it describes is final.
#
# WHAT IT GUARDS: SHA256SUMS.txt is written from the digests the releases API reports, so
# it is a snapshot of the release at the instant the job reads it. Any job that uploads an
# asset afterwards leaves a line in that file describing bytes that no longer exist.
#
# That is not hypothetical. Until this existed, the job that writes the sums and the job
# that rewrites latest.json started in the same second and the sums job was the shorter of
# the two, so every release from v1.4.0 onward published a hash for latest.json that was
# the hash of the file it replaced. Twenty of twenty-one lines were right, which is the
# worst possible shape for a file whose whole job is to be believed.
#
# WHAT IT CANNOT DO: nothing here runs release.yml. It reads the dependency graph, and a
# graph that says the right thing is not the same as a release that does it. Only a tag
# proves that, and the lab is where a tag is cheap.
set -uo pipefail

workflow="${1:-.github/workflows/release.yml}"

python3 - "$workflow" <<'PY'
import sys, yaml

path = sys.argv[1]
with open(path) as handle:
    jobs = yaml.safe_load(handle)["jobs"]


def script_of(job):
    """Every shell line in a job, so a step's `run:` can be searched as one string."""
    return "\n".join(step.get("run", "") for step in job.get("steps", []))


def needs_of(name):
    declared = jobs[name].get("needs", [])
    return [declared] if isinstance(declared, str) else declared


def reached_from(name):
    """The jobs that are guaranteed to have finished before `name` starts."""
    seen, pending = set(), list(needs_of(name))
    while pending:
        job = pending.pop()
        if job in seen:
            continue
        seen.add(job)
        pending.extend(needs_of(job))
    return seen


writes_sums = [n for n, j in jobs.items() if "SHA256SUMS.txt" in script_of(j)]
uploads = [n for n, j in jobs.items() if "gh release upload" in script_of(j)]

problems = []
if len(writes_sums) != 1:
    # Two jobs writing it, or none, means the question this asks has no single answer.
    # Failing is right: silence here would be a guard that stopped guarding.
    problems.append(f"expected exactly one job to write SHA256SUMS.txt, found {writes_sums}")
else:
    sums_job = writes_sums[0]
    before = reached_from(sums_job)
    for job in sorted(set(uploads) - {sums_job}):
        if job not in before:
            problems.append(f"'{job}' uploads release assets but '{sums_job}' does not wait for it")
            problems.append(f"  add '{job}' to the needs of '{sums_job}', or its asset gets a hash of whatever was there before")

if problems:
    print(f"::error::{path}: the hashes can be published before the files they describe are final.")
    for line in problems:
        print(f"::error::{line}")
    sys.exit(1)

print(f"{path}: SHA256SUMS.txt is written after every job that uploads an asset.")
PY

#!/usr/bin/env python3
"""Print the GitHub validation record for the supplied Budgit commit."""

import argparse
import json
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


API = "https://api.github.com/repos/Shandowww/monthly-flow-budget/actions"
WORKFLOW = ".github/workflows/security.yml"


PENDING = 75  # EX_TEMPFAIL: CI has not finished for this commit yet.


class Pending(Exception):
    pass


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Keep the Actions credential scoped to the configured API endpoint.
        return None


def verify_validation(commit, get):
    query = urlencode({"branch": "main", "event": "push", "head_sha": commit, "per_page": 1})
    runs = get(f"/workflows/security.yml/runs?{query}")["workflow_runs"]
    if not runs:
        raise Pending("No main push run found for this commit yet.")

    run = runs[0]
    if (
        run["head_sha"] != commit
        or run["head_branch"] != "main"
        or run["event"] != "push"
        or run["path"] != WORKFLOW
    ):
        raise ValueError("GitHub returned a run for a different commit, branch, event or workflow.")
    if run["status"] != "completed":
        raise Pending(f"Main push run {run['id']} is still {run['status']}.")
    if run["conclusion"] != "success":
        raise ValueError(f"Main push run {run['id']} has no successful conclusion.")

    run_id = int(run["id"])
    attempt = int(run["run_attempt"])
    jobs = get(f"/runs/{run_id}/attempts/{attempt}/jobs?per_page=100")["jobs"]
    validation = [job for job in jobs if job["name"] == "validate"]
    if len(validation) != 1:
        raise ValueError(f"Expected one validate job in run {run_id}, attempt {attempt}.")
    job = validation[0]
    if job["head_sha"] != commit or job["status"] != "completed" or job["conclusion"] != "success":
        raise ValueError(f"The validate job did not pass for the requested commit in run {run_id}.")

    return {"commit": commit, "run_id": run_id, "run_attempt": attempt, "validate_job_id": int(job["id"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("commit", help="Full SHA of the commit fetched from main")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("expected a full lowercase Git commit SHA")

    token = sys.stdin.readline().strip()
    if not token:
        parser.error("supply a GitHub Actions read token on standard input")

    client = build_opener(NoRedirects())

    def get(path):
        request = Request(
            API + path,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        with client.open(request, timeout=15) as response:
            return json.load(response)

    try:
        approval = verify_validation(args.commit, get)
    except HTTPError as error:
        parser.exit(1, f"GitHub validation API returned HTTP {error.code}.\n")
    except (URLError, TimeoutError):
        parser.exit(1, "Could not reach the GitHub validation API.\n")
    except (KeyError, TypeError, json.JSONDecodeError):
        parser.exit(1, "GitHub returned an unexpected validation record.\n")
    except Pending as error:
        parser.exit(PENDING, f"{error}\n")
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    print(json.dumps(approval))


if __name__ == "__main__":
    main()
